"use client";

import {
  AlertTriangle,
  Bookmark,
  CalendarDays,
  Expand,
  Flag,
  Heart,
  Landmark,
  Link2,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Store,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { likeVideo, saveItem } from "@/server/actions/social";
import type { VideoCard } from "@/server/services/videos";
import { formatCount } from "@/lib/text";
import { TimeAgo } from "./bits";
import { cn } from "@/lib/utils";
import { useAuthGate } from "./auth-gate";
import { CommentsSheet } from "./comments-sheet";
import { FollowButton } from "./follow-button";
import { ReportDialog } from "./report-dialog";
import { UserAvatar } from "./user-avatar";

export type Me = { id: string; canContribute: boolean } | null;

/** Légende avec #hashtags et @mentions cliquables. */
function Caption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const parts = text.split(/((?:^|\s)[#@][\p{L}\p{N}_.]+)/u);
  return (
    <div>
      <p className={cn("text-[15px] leading-snug break-words whitespace-pre-wrap", !expanded && "line-clamp-2")}>
        {parts.map((p, i) => {
          const m = p.match(/^(\s?)([#@])(.+)$/u);
          if (!m) return p;
          const href = m[2] === "#" ? `/explorer?q=${encodeURIComponent(`#${m[3]}`)}` : `/u/${m[3]!.toLowerCase()}`;
          return (
            <span key={i}>
              {m[1]}
              <Link href={href} className="font-semibold hover:underline">
                {m[2]}
                {m[3]}
              </Link>
            </span>
          );
        })}
      </p>
      {text.length > 90 && (
        <button className="text-sm font-semibold text-white/80 hover:text-white" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
          {expanded ? "Moins" : "Plus"}
        </button>
      )}
    </div>
  );
}

function RailButton({ label, onClick, children, count, pressed }: { label: string; onClick: () => void; children: React.ReactNode; count?: string; pressed?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={pressed} className="group flex flex-col items-center gap-1 text-white">
      <span className="flex size-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm transition-transform group-active:scale-90 md:bg-white/10 md:group-hover:bg-white/20">
        {children}
      </span>
      {count !== undefined && <span className="text-xs font-semibold [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">{count}</span>}
    </button>
  );
}

/**
 * Une vidéo du flux. Seule la vidéo active est lue ; les autres sont en pause et
 * ne préchargent que leurs métadonnées (la suivante est préchargée davantage).
 */
export function VideoPlayer({ video, active, preload, muted, onToggleMute, me, standalone = false }: {
  video: VideoCard;
  active: boolean;
  preload: "auto" | "metadata" | "none";
  muted: boolean;
  onToggleMute: () => void;
  me: Me;
  standalone?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState(video.viewer.liked);
  const [likes, setLikes] = useState(video.likeCount);
  const [saved, setSaved] = useState(video.viewer.saved);
  const [comments, setComments] = useState(video.commentCount);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [, start] = useTransition();
  const viewSent = useRef(false);
  const gate = useAuthGate(Boolean(me));

  // Lecture/pause selon la visibilité.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active && !failed) {
      el.play().then(
        () => setBlocked(false),
        () => setBlocked(true), // lecture automatique refusée par le navigateur
      );
    } else {
      el.pause();
      if (!active) el.currentTime = 0;
    }
  }, [active, failed]);

  // Vue comptée après 2 s de lecture effective.
  useEffect(() => {
    if (!active || paused || viewSent.current || !video.videoUrl) return;
    const t = setTimeout(() => {
      viewSent.current = true;
      void fetch(`/api/videos/${video.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "view" }) });
    }, 2000);
    return () => clearTimeout(t);
  }, [active, paused, video.id, video.videoUrl]);

  function togglePlay() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    else el.pause();
  }

  // Raccourcis clavier (vidéo active uniquement).
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable], [role=dialog]")) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "m") onToggleMute();
      else if (e.key === "l") toggleLike();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleLike() {
    if (!gate("aimer cette vidéo")) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    start(async () => {
      const res = await likeVideo(video.id, next);
      if (!res.ok) {
        setLiked(!next);
        setLikes((n) => n + (next ? -1 : 1));
        toast.error(res.error);
      } else setLikes(res.data.likeCount);
    });
  }

  function toggleSave() {
    if (!gate("enregistrer cette vidéo")) return;
    const next = !saved;
    setSaved(next);
    start(async () => {
      const res = await saveItem({ videoId: video.id }, next);
      if (!res.ok) {
        setSaved(!next);
        return void toast.error(res.error);
      }
      toast.success(next ? "Ajoutée à vos favoris." : "Retirée de vos favoris.");
    });
  }

  async function share() {
    const url = `${window.location.origin}/v/${video.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Voisino", text: video.caption.slice(0, 100), url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié dans le presse-papiers.");
      }
      void fetch(`/api/videos/${video.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "share" }) });
    } catch {
      /* partage annulé par l'utilisateur */
    }
  }

  function fullscreen() {
    const el = frameRef.current;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el?.requestFullscreen) void el.requestFullscreen();
    else (ref.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.();
  }

  const place = [video.cityName, video.zoneName].filter(Boolean).join(" · ");
  const processing = !video.videoUrl;

  return (
    <article
      aria-label={`Vidéo de @${video.authorUsername}${video.caption ? ` : ${video.caption.slice(0, 80)}` : ""}`}
      className={cn("relative flex h-full w-full items-center justify-center", !standalone && "snap-start snap-always")}
    >
      <div ref={frameRef} className="relative h-full w-full overflow-hidden bg-black md:aspect-[9/16] md:h-[calc(100%-2rem)] md:w-auto md:max-w-full md:rounded-2xl">
        {processing ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
            {video.status === "failed" ? <AlertTriangle className="size-8 text-destructive" /> : <Loader2 className="size-8 animate-spin" />}
            <p className="font-medium">{video.status === "failed" ? "Le traitement de cette vidéo a échoué." : "Vidéo en cours de traitement…"}</p>
          </div>
        ) : (
          <video
            ref={ref}
            src={video.videoUrl ?? undefined}
            poster={video.posterUrl ?? undefined}
            preload={preload}
            muted={muted}
            loop
            playsInline
            className="h-full w-full object-cover"
            onClick={togglePlay}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            onError={() => setFailed(true)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
            aria-label="Lecture vidéo : touchez pour mettre en pause ou reprendre"
          />
        )}

        {/* Dégradés de lisibilité */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* États */}
        {buffering && active && !failed && (
          <Loader2 className="pointer-events-none absolute top-1/2 left-1/2 size-10 -translate-1/2 animate-spin text-white/90" aria-label="Chargement" />
        )}
        {(blocked || (paused && active && !buffering && !processing)) && !failed && (
          <button onClick={togglePlay} className="absolute top-1/2 left-1/2 flex size-20 -translate-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur" aria-label="Lire la vidéo">
            <Play className="size-9 translate-x-0.5" fill="currentColor" />
          </button>
        )}
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center text-white">
            <AlertTriangle className="size-8" />
            <p>Impossible de lire cette vidéo.</p>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-semibold text-black"
              onClick={() => {
                setFailed(false);
                ref.current?.load();
              }}
            >
              <RotateCcw className="size-4" /> Réessayer
            </button>
          </div>
        )}

        {/* Contrôles haut */}
        <div className={cn("absolute right-3 flex gap-2", standalone ? "top-3" : "top-16 md:top-3")}>
          {!processing && (
            <>
              <button onClick={onToggleMute} className="flex size-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur" aria-label={muted ? "Activer le son" : "Couper le son"} aria-pressed={!muted}>
                {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
              <button onClick={togglePlay} className="hidden size-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur md:flex" aria-label={paused ? "Lire" : "Pause"}>
                {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
              </button>
              <button onClick={fullscreen} className="flex size-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur" aria-label="Plein écran">
                <Expand className="size-5" />
              </button>
            </>
          )}
        </div>

        {/* Informations */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 pr-20 text-white md:pr-4">
          {video.sponsorName && (
            <Link href={`/commerces/${video.sponsorSlug}`} className="w-fit rounded-md bg-amber-300 px-2 py-0.5 text-xs font-bold text-black">
              Sponsorisé · {video.sponsorName}
            </Link>
          )}
          <div className="flex items-center gap-2">
            <Link href={`/u/${video.authorUsername}`} className="flex min-w-0 items-center gap-2">
              <UserAvatar name={video.authorName} image={video.authorImage} className="size-9 ring-2 ring-white/80" />
              <span className="truncate font-semibold [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">@{video.authorUsername}</span>
            </Link>
            {!video.viewer.isAuthor && video.viewer.follow !== "accepted" && (
              <FollowButton userId={video.authorId} initial={video.viewer.follow} signedIn={Boolean(me)} size="sm" tone="overlay" className="h-7 rounded-full px-3" />
            )}
            {video.isDemo && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase">Démo</span>}
          </div>
          <Caption text={video.caption} />
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 backdrop-blur">
              <MapPin className="size-3.5" aria-hidden="true" /> {place}
            </span>
            {video.categoryName && (
              <Link href={`/explorer?categorie=${video.categorySlug}`} className="rounded-full bg-black/40 px-2 py-1 backdrop-blur hover:bg-black/60">
                {video.categoryName}
              </Link>
            )}
            {video.businessSlug && (
              <Link href={`/commerces/${video.businessSlug}`} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 font-semibold text-black">
                <Store className="size-3.5" aria-hidden="true" /> {video.businessName}
              </Link>
            )}
            {video.eventSlug && (
              <Link href={`/evenements/${video.eventSlug}`} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 font-semibold text-black">
                <CalendarDays className="size-3.5" aria-hidden="true" /> {video.eventTitle}
              </Link>
            )}
            {video.placeSlug && (
              <Link href={`/lieux/${video.placeSlug}`} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 font-semibold text-black">
                <Landmark className="size-3.5" aria-hidden="true" /> {video.placeName}
              </Link>
            )}
            {video.publishedAt && <span className="text-white/75">· <TimeAgo date={video.publishedAt} /></span>}
          </div>
        </div>

        {/* Barre de progression (cliquable pour se déplacer) */}
        {!processing && (
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            onChange={(e) => {
              const v = ref.current;
              if (v?.duration) v.currentTime = (Number(e.target.value) / 1000) * v.duration;
            }}
            aria-label="Position de lecture"
            className="absolute inset-x-0 bottom-0 h-1.5 w-full cursor-pointer appearance-none bg-white/25 accent-primary [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            style={{ background: `linear-gradient(to right, white ${progress * 100}%, rgb(255 255 255 / 0.25) ${progress * 100}%)` }}
          />
        )}

        {/* Actions (dans le cadre sur mobile) */}
        <div className="absolute right-2 bottom-24 flex flex-col items-center gap-4 md:hidden">
          {Rail()}
        </div>
      </div>

      {/* Actions (à côté du cadre sur ordinateur) */}
      <div className="hidden flex-col items-center gap-4 self-end pb-12 pl-4 md:flex">
        {Rail()}
      </div>

      <CommentsSheet
        videoId={video.id}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
        commentsOpen={video.commentsOpen}
        me={me}
        onCountChange={(d) => setComments((n) => n + d)}
      />
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} targetType="video" targetId={video.id} />
    </article>
  );

  function Rail() {
    return (
      <>
        <RailButton label={liked ? "Je n'aime plus" : "J'aime"} pressed={liked} onClick={toggleLike} count={formatCount(likes)}>
          <Heart className={cn("size-7", liked && "fill-rose-500 text-rose-500")} />
        </RailButton>
        <RailButton label={`Commentaires (${comments})`} onClick={() => setCommentsOpen(true)} count={formatCount(comments)}>
          <MessageCircle className="size-7" />
        </RailButton>
        <RailButton label={saved ? "Retirer des favoris" : "Ajouter aux favoris"} pressed={saved} onClick={toggleSave}>
          <Bookmark className={cn("size-7", saved && "fill-amber-300 text-amber-300")} />
        </RailButton>
        <RailButton label="Partager" onClick={share}>
          <Share2 className="size-7" />
        </RailButton>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex size-12 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm md:bg-white/10" aria-label="Plus d'options">
            <MoreHorizontal className="size-6" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!standalone && (
              <DropdownMenuItem asChild>
                <Link href={`/v/${video.id}`}>
                  <Link2 /> Ouvrir la page de la vidéo
                </Link>
              </DropdownMenuItem>
            )}
            {!video.viewer.isAuthor && (
              <DropdownMenuItem onSelect={() => gate("signaler un contenu") && setReportOpen(true)}>
                <Flag /> Signaler
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  }
}
