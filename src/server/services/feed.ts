import "server-only";
import { and, desc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { videos } from "../db/schema";
import { rankWithDiversity, type Candidate } from "./ranking";
import { hydrateVideos } from "./videos";
import { videoVisibleTo } from "./visibility";

export type FeedMode = "local" | "following";
const NOBODY = "00000000-0000-0000-0000-000000000000";

/**
 * Flux paginé par exclusion : le client envoie les ids déjà affichés pendant la session,
 * ce qui reste stable même si le classement évolue entre deux pages.
 */
export async function getFeed(opts: { viewerId: string | null; cityId: string; mode: FeedMode; exclude: string[]; limit?: number }) {
  const pageSize = opts.limit ?? 6;
  const v = opts.viewerId ?? NOBODY;
  const exclude = opts.exclude.slice(-300);
  const notSeen = exclude.length ? notInArray(videos.id, exclude) : sql`true`;

  if (opts.mode === "following") {
    if (!opts.viewerId) return { items: [], hasMore: false };
    const rows = await db
      .select({ id: videos.id })
      .from(videos)
      .where(
        and(
          videoVisibleTo(opts.viewerId),
          notSeen,
          sql`exists (select 1 from follows f where f.follower_id = ${v} and f.following_id = ${videos.authorId} and f.accepted)`,
        ),
      )
      .orderBy(desc(videos.publishedAt))
      .limit(pageSize + 1);
    const ids = rows.slice(0, pageSize).map((r) => r.id);
    return { items: await hydrateVideos(ids, opts.viewerId), hasMore: rows.length > pageSize };
  }

  const candidates = await db
    .select({
      id: videos.id,
      authorId: videos.authorId,
      categoryId: videos.categoryId,
      publishedAt: sql<Date>`${videos.publishedAt}`.mapWith((d) => new Date(d)),
      likeCount: videos.likeCount,
      commentCount: videos.commentCount,
      shareCount: videos.shareCount,
      viewCount: videos.viewCount,
      authorVideoCount: sql<number>`(select count(*) from videos a where a.author_id = ${videos.authorId} and a.status = 'published')`.mapWith(Number),
      openReports: sql<number>`(select count(*) from reports r where r.target_type = 'video' and r.target_id = ${videos.id} and r.status = 'open')`.mapWith(Number),
      seenCount: sql<number>`coalesce((select vv.count from video_views vv where vv.user_id = ${v} and vv.video_id = ${videos.id}), 0)`.mapWith(Number),
      followsAuthor: sql<boolean>`exists (select 1 from follows f where f.follower_id = ${v} and f.following_id = ${videos.authorId} and f.accepted)`,
      followsCategory: sql<boolean>`exists (select 1 from category_follows cf where cf.user_id = ${v} and cf.category_id = ${videos.categoryId})`,
      categoryAffinity: sql<number>`(select count(*) from likes l join videos lv on lv.id = l.video_id
        where l.user_id = ${v} and lv.category_id = ${videos.categoryId} and l.created_at > now() - interval '90 days')`.mapWith(Number),
    })
    .from(videos)
    .where(
      and(
        eq(videos.cityId, opts.cityId),
        videoVisibleTo(opts.viewerId),
        isNull(videos.sponsoredByBusinessId),
        sql`${videos.publishedAt} > now() - interval '180 days'`,
        notSeen,
      ),
    )
    .orderBy(desc(videos.publishedAt))
    .limit(300);

  const ranked = rankWithDiversity(candidates satisfies Candidate[], new Date(), pageSize);
  const ids = ranked.map((c) => c.id);

  // Au plus un contenu sponsorisé par page, toujours signalé comme tel dans l'interface.
  const [sponsored] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.cityId, opts.cityId), videoVisibleTo(opts.viewerId), isNotNull(videos.sponsoredByBusinessId), notSeen))
    .orderBy(sql`random()`)
    .limit(1);
  if (sponsored && ids.length >= 3) ids.splice(3, 0, sponsored.id);

  return { items: await hydrateVideos(ids, opts.viewerId), hasMore: candidates.length > pageSize };
}
