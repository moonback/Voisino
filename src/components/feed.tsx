"use client";

import { ChevronDown, Compass, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoCard } from "@/server/services/videos";
import { cn } from "@/lib/utils";
import { CityPickerDialog } from "./city-picker";
import { VideoPlayer, type Me } from "./video-player";

const MUTE_KEY = "voisino:son-coupe";

/** Préférence « son coupé » : persistée par appareil (le navigateur exige souvent le muet pour l'autolecture). */
export function useMuted() {
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) !== "0");
    } catch {
      /* stockage indisponible : on reste en muet */
    }
  }, []);
  const toggle = useCallback(() => {
    setMuted((m) => {
      try {
        localStorage.setItem(MUTE_KEY, m ? "0" : "1");
      } catch {}
      return !m;
    });
  }, []);
  return [muted, toggle] as const;
}

export function Feed({ city, mode, initial, me }: {
  city: { slug: string; name: string };
  mode: "local" | "following";
  initial: { items: VideoCard[]; hasMore: boolean };
  me: Me;
}) {
  const [items, setItems] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState(0);
  const [muted, toggleMute] = useMuted();
  const scroller = useRef<HTMLDivElement>(null);

  // Repart du début quand la ville ou le mode change.
  useEffect(() => {
    setItems(initial.items);
    setHasMore(initial.hasMore);
    setActive(0);
    scroller.current?.scrollTo({ top: 0 });
  }, [initial]);

  // Vidéo active = celle qui occupe la majorité de l'écran.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setLoadError(false);
    try {
      const r = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city.slug, mode, exclude: items.map((v) => v.id) }),
      });
      if (!r.ok) throw new Error();
      const data = (await r.json()) as { items: VideoCard[]; hasMore: boolean };
      setItems((prev) => [...prev, ...data.items.filter((n) => !prev.some((p) => p.id === n.id))]);
      setHasMore(data.hasMore && data.items.length > 0);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, city.slug, mode, items]);

  useEffect(() => {
    if (active >= items.length - 3) void loadMore();
  }, [active, items.length, loadMore]);

  // Navigation clavier entre les vidéos.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable], [role=dialog]")) return;
      const step = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const el = scroller.current?.querySelector<HTMLElement>(`[data-index="${Math.max(0, active + step)}"]`);
      el?.scrollIntoView({ behavior: "smooth" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <div className="relative h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] bg-black md:h-dvh">
      {/* Barre haute : onglets et ville */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 p-3 md:left-0 md:justify-start">
        <nav aria-label="Type de flux" className="pointer-events-auto flex rounded-full bg-black/40 p-1 text-sm font-semibold text-white backdrop-blur">
          {(
            [
              ["local", "Pour vous", "/"],
              ["following", "Abonnements", "/?flux=abonnements"],
            ] as const
          ).map(([m, label, href]) => (
            <Link key={m} href={href} aria-current={mode === m ? "page" : undefined} className={cn("rounded-full px-3.5 py-1.5", mode === m ? "bg-white text-black" : "text-white/80 hover:text-white")}>
              {label}
            </Link>
          ))}
        </nav>
        <CityPickerDialog current={city.slug}>
          <button className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-2 text-sm font-semibold text-white backdrop-blur md:absolute md:right-4">
            <MapPin className="size-4" aria-hidden="true" />
            {city.name}
            <ChevronDown className="size-4" aria-hidden="true" />
            <span className="sr-only">— changer de ville</span>
          </button>
        </CityPickerDialog>
      </div>

      <div ref={scroller} className="scrollbar-none h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain" aria-live="off">
        {items.map((v, i) => (
          <div key={v.id} data-index={i} className="h-full snap-start snap-always">
            <VideoPlayer
              video={v}
              active={i === active}
              preload={i === active ? "auto" : i === active + 1 ? "auto" : Math.abs(i - active) <= 2 ? "metadata" : "none"}
              muted={muted}
              onToggleMute={toggleMute}
              me={me}
            />
          </div>
        ))}
        <div className="flex h-full snap-start flex-col items-center justify-center gap-4 p-8 text-center text-white">
          {loading ? (
            <Loader2 className="size-8 animate-spin" aria-label="Chargement de vidéos supplémentaires" />
          ) : loadError ? (
            <>
              <p>Impossible de charger la suite du flux.</p>
              <button onClick={() => void loadMore()} className="rounded-full bg-white px-5 py-2.5 font-semibold text-black">
                Réessayer
              </button>
            </>
          ) : (
            <>
              <Compass className="size-10 text-primary" aria-hidden="true" />
              <h2 className="text-2xl font-bold">{items.length ? "Vous êtes à jour" : mode === "following" ? "Rien de neuf chez vos abonnements" : `Pas encore de vidéo à ${city.name}`}</h2>
              <p className="max-w-sm text-white/75">
                {mode === "following"
                  ? "Abonnez-vous à des habitants et des commerces pour retrouver leurs vidéos ici."
                  : "Explorez les autres quartiers et villes, ou publiez la première vidéo !"}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/explorer" className="rounded-full bg-white px-5 py-2.5 font-semibold text-black">
                  Explorer
                </Link>
                <Link href="/publier" className="rounded-full border border-white/40 px-5 py-2.5 font-semibold">
                  Publier une vidéo
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
