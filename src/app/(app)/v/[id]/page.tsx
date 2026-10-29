import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TimeAgo } from "@/components/bits";
import { OwnerActions, StandalonePlayer } from "@/components/video-page-client";
import { AppError } from "@/server/errors";
import { canContribute } from "@/server/permissions";
import { getViewer } from "@/server/session";
import { getVideo } from "@/server/services/videos";
import { formatCount } from "@/lib/text";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!UUID.test(id)) return null;
  try {
    return await getVideo(id, await getViewer());
  } catch (e) {
    if (e instanceof AppError) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/v/[id]">): Promise<Metadata> {
  const v = await load((await params).id);
  if (!v) return { title: "Vidéo introuvable" };
  return {
    title: v.caption ? v.caption.slice(0, 60) : `Vidéo de @${v.authorUsername}`,
    openGraph: v.visibility === "public" && v.posterUrl ? { images: [v.posterUrl] } : undefined,
  };
}

export default async function VideoPage({ params }: PageProps<"/v/[id]">) {
  const { id } = await params;
  const [video, viewer] = await Promise.all([load(id), getViewer()]);
  if (!video) notFound();
  const statusLabel = { processing: "En cours de traitement", failed: "Échec du traitement", hidden: "Masquée par la modération", removed: "Retirée", published: null }[video.status];

  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[minmax(0,1fr)_320px] md:px-8 md:py-8">
      <StandalonePlayer video={video} me={viewer && { id: viewer.id, canContribute: canContribute(viewer) }} />
      <aside className="flex flex-col gap-4 px-4 pb-8 md:px-0">
        {statusLabel && <p className="rounded-xl bg-secondary p-3 text-sm font-medium">{statusLabel}</p>}
        <div>
          <Link href={`/u/${video.authorUsername}`} className="font-semibold hover:underline">
            {video.authorName}
          </Link>
          <p className="text-sm text-muted-foreground">
            @{video.authorUsername} · {video.publishedAt ? <TimeAgo date={video.publishedAt} /> : "non publiée"}
          </p>
        </div>
        {video.caption && <p className="whitespace-pre-wrap">{video.caption}</p>}
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["J'aime", video.likeCount],
            ["Commentaires", video.commentCount],
            ["Vues", video.viewCount],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-xl bg-muted p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-bold">{formatCount(n as number)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          Publiée à {video.cityName}
          {video.zoneName ? ` · ${video.zoneName}` : ""}
          {video.visibility !== "public" && ` · visibilité : ${video.visibility === "followers" ? "abonnés" : "privée"}`}
        </p>
        {video.viewer.isAuthor && <OwnerActions video={video} />}
      </aside>
    </div>
  );
}
