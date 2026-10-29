import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db } from "../db";
import {
  bookmarks,
  businesses,
  categories,
  cities,
  events,
  follows,
  hashtags,
  likes,
  mediaAssets,
  places,
  profiles,
  user,
  videoHashtags,
  videoViews,
  videos,
  zones,
} from "../db/schema";
import { AppError } from "../errors";
import { canModerate, type Viewer } from "../permissions";
import { limit } from "../rate-limit";
import { deletePrefix, mediaUrl } from "../storage";
import { enqueue } from "../jobs";
import { extractHashtags } from "@/lib/text";
import { videoSchema, videoUpdateSchema } from "@/lib/validation";
import { videoVisibleTo } from "./visibility";

const sponsor = alias(businesses, "sponsor");

/** Assemble les cartes vidéo (auteur, ville, média, liens, état du lecteur) dans l'ordre des ids. */
export async function hydrateVideos(ids: string[], viewerId: string | null) {
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: videos.id,
      caption: videos.caption,
      visibility: videos.visibility,
      status: videos.status,
      allowComments: videos.allowComments,
      likeCount: videos.likeCount,
      commentCount: videos.commentCount,
      shareCount: videos.shareCount,
      viewCount: videos.viewCount,
      publishedAt: videos.publishedAt,
      createdAt: videos.createdAt,
      isDemo: videos.isDemo,
      authorId: videos.authorId,
      authorName: user.name,
      authorImage: user.image,
      authorUsername: profiles.username,
      authorAllowsComments: profiles.allowComments,
      cityId: videos.cityId,
      citySlug: cities.slug,
      cityName: cities.name,
      zoneName: zones.name,
      categorySlug: categories.slug,
      categoryName: categories.name,
      variants: mediaAssets.variants,
      width: mediaAssets.width,
      height: mediaAssets.height,
      durationSec: mediaAssets.durationSec,
      businessSlug: businesses.slug,
      businessName: businesses.name,
      eventSlug: events.slug,
      eventTitle: events.title,
      placeSlug: places.slug,
      placeName: places.name,
      sponsorSlug: sponsor.slug,
      sponsorName: sponsor.name,
    })
    .from(videos)
    .innerJoin(user, eq(user.id, videos.authorId))
    .innerJoin(profiles, eq(profiles.userId, videos.authorId))
    .innerJoin(cities, eq(cities.id, videos.cityId))
    .innerJoin(mediaAssets, eq(mediaAssets.id, videos.assetId))
    .leftJoin(zones, eq(zones.id, videos.zoneId))
    .leftJoin(categories, eq(categories.id, videos.categoryId))
    .leftJoin(businesses, eq(businesses.id, videos.businessId))
    .leftJoin(events, eq(events.id, videos.eventId))
    .leftJoin(places, eq(places.id, videos.placeId))
    .leftJoin(sponsor, eq(sponsor.id, videos.sponsoredByBusinessId))
    .where(inArray(videos.id, ids));

  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const [tags, liked, saved, followed] = await Promise.all([
    db
      .select({ videoId: videoHashtags.videoId, tag: hashtags.tag })
      .from(videoHashtags)
      .innerJoin(hashtags, eq(hashtags.id, videoHashtags.hashtagId))
      .where(and(inArray(videoHashtags.videoId, ids), eq(hashtags.isBlocked, false))),
    viewerId ? db.select({ id: likes.videoId }).from(likes).where(and(eq(likes.userId, viewerId), inArray(likes.videoId, ids))) : [],
    viewerId
      ? db.select({ id: bookmarks.videoId }).from(bookmarks).where(and(eq(bookmarks.userId, viewerId), inArray(bookmarks.videoId, ids)))
      : [],
    viewerId && authorIds.length
      ? db
          .select({ id: follows.followingId, accepted: follows.accepted })
          .from(follows)
          .where(and(eq(follows.followerId, viewerId), inArray(follows.followingId, authorIds)))
      : [],
  ]);
  const likedSet = new Set(liked.map((l) => l.id));
  const savedSet = new Set(saved.map((s) => s.id));
  const followMap = new Map(followed.map((f) => [f.id, f.accepted ? "accepted" : "pending"] as const));
  const byId = new Map(rows.map((r) => [r.id, r]));

  return ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    const { variants, ...rest } = r;
    return [
      {
        ...rest,
        videoUrl: mediaUrl(variants.video),
        posterUrl: mediaUrl(variants.poster),
        hashtags: tags.filter((t) => t.videoId === id).map((t) => t.tag),
        commentsOpen: r.allowComments && r.authorAllowsComments,
        viewer: {
          liked: likedSet.has(id),
          saved: savedSet.has(id),
          follow: followMap.get(r.authorId) ?? null,
          isAuthor: viewerId === r.authorId,
        },
      },
    ];
  });
}
export type VideoCard = Awaited<ReturnType<typeof hydrateVideos>>[number];

async function assertVisible(videoId: string, viewer: Viewer | null) {
  const allowAll = viewer && canModerate(viewer);
  const [row] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(
      and(
        eq(videos.id, videoId),
        allowAll ? sql`true` : sql`(${videoVisibleTo(viewer?.id ?? null)} or (${videos.authorId} = ${viewer?.id ?? null} and ${videos.deletedAt} is null))`,
      ),
    );
  if (!row) throw new AppError("NOT_FOUND", "Cette vidéo n'existe pas ou n'est plus disponible.");
}

export async function getVideo(videoId: string, viewer: Viewer | null) {
  await assertVisible(videoId, viewer);
  const [card] = await hydrateVideos([videoId], viewer?.id ?? null);
  return card ?? null;
}

/** Vidéos d'un profil (visibles par le lecteur ; l'auteur voit aussi celles en traitement). */
export async function listUserVideos(authorId: string, viewer: Viewer | null, page = 0, pageSize = 18) {
  const isSelf = viewer?.id === authorId;
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(
      and(
        eq(videos.authorId, authorId),
        isSelf ? sql`${videos.deletedAt} is null and ${videos.status} <> 'removed'` : videoVisibleTo(viewer?.id ?? null),
      ),
    )
    .orderBy(sql`coalesce(${videos.publishedAt}, ${videos.createdAt}) desc`)
    .limit(pageSize + 1)
    .offset(page * pageSize);
  return { items: await hydrateVideos(rows.slice(0, pageSize).map((r) => r.id), viewer?.id ?? null), hasMore: rows.length > pageSize };
}

export async function listSavedVideos(viewer: Viewer, page = 0, pageSize = 18) {
  const rows = await db
    .select({ id: bookmarks.videoId })
    .from(bookmarks)
    .innerJoin(videos, eq(videos.id, bookmarks.videoId))
    .where(and(eq(bookmarks.userId, viewer.id), videoVisibleTo(viewer.id)))
    .orderBy(sql`${bookmarks.createdAt} desc`)
    .limit(pageSize + 1)
    .offset(page * pageSize);
  const ids = rows.slice(0, pageSize).map((r) => r.id!);
  return { items: await hydrateVideos(ids, viewer.id), hasMore: rows.length > pageSize };
}

/** Associe une liste de hashtags à une vidéo (crée ceux qui n'existent pas, ignore les bloqués). */
async function linkHashtags(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], videoId: string, tags: string[]) {
  await tx.delete(videoHashtags).where(eq(videoHashtags.videoId, videoId));
  if (!tags.length) return;
  await tx.insert(hashtags).values(tags.map((tag) => ({ tag }))).onConflictDoNothing();
  const rows = await tx
    .select({ id: hashtags.id })
    .from(hashtags)
    .where(and(inArray(hashtags.tag, tags), eq(hashtags.isBlocked, false)));
  if (rows.length) await tx.insert(videoHashtags).values(rows.map((h) => ({ videoId, hashtagId: h.id })));
}

const normalizeTags = (caption: string, extra: string[]) =>
  [...new Set([...extractHashtags(caption), ...extra.map((t) => t.replace(/^#/, "").trim().toLowerCase())])]
    .filter((t) => /^[\p{L}\p{N}_]{2,40}$/u.test(t))
    .slice(0, 10);

export async function createVideo(viewer: Viewer, input: z.input<typeof videoSchema>) {
  const d = videoSchema.parse(input);
  limit("upload", viewer.id);

  const [asset] = await db
    .select({ id: mediaAssets.id, status: mediaAssets.status, used: sql<boolean>`exists (select 1 from videos where asset_id = ${mediaAssets.id})` })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, d.assetId), eq(mediaAssets.ownerId, viewer.id), eq(mediaAssets.kind, "video")));
  if (!asset || asset.used || asset.status === "failed") throw new AppError("VALIDATION", "Fichier vidéo introuvable : téléversez-le à nouveau.");

  const [city] = await db.select({ id: cities.id }).from(cities).where(and(eq(cities.id, d.cityId), eq(cities.isActive, true)));
  if (!city) throw new AppError("VALIDATION", "Ville inconnue.");
  const checks = await Promise.all([
    d.zoneId ? db.select({ id: zones.id }).from(zones).where(and(eq(zones.id, d.zoneId), eq(zones.cityId, d.cityId))) : [{}],
    d.businessId
      ? db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, d.businessId), eq(businesses.isHidden, false)))
      : [{}],
    d.eventId ? db.select({ id: events.id }).from(events).where(and(eq(events.id, d.eventId), eq(events.status, "published"))) : [{}],
    d.placeId ? db.select({ id: places.id }).from(places).where(eq(places.id, d.placeId)) : [{}],
    d.categoryId ? db.select({ id: categories.id }).from(categories).where(eq(categories.id, d.categoryId)) : [{}],
  ]);
  if (checks.some((r) => r.length === 0)) throw new AppError("VALIDATION", "Une association (zone, commerce, événement, lieu ou catégorie) est invalide.");

  const tags = normalizeTags(d.caption, d.hashtags);
  // Position arrondie à 3 décimales (~100 m) : jamais d'adresse précise.
  const location = d.location ? { x: Math.round(d.location.lng * 1000) / 1000, y: Math.round(d.location.lat * 1000) / 1000 } : null;

  const video = await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(videos)
      .values({
        authorId: viewer.id,
        assetId: d.assetId,
        cityId: d.cityId,
        zoneId: d.zoneId,
        categoryId: d.categoryId,
        businessId: d.businessId,
        eventId: d.eventId,
        placeId: d.placeId,
        caption: d.caption,
        visibility: d.visibility,
        allowComments: d.allowComments,
        location,
        status: "processing",
      })
      .returning({ id: videos.id });
    await linkHashtags(tx, v!.id, tags);
    return v!;
  });
  await enqueue("video.process", { videoId: video.id });
  return video;
}

async function ownVideo(viewer: Viewer, videoId: string) {
  const [v] = await db.select().from(videos).where(and(eq(videos.id, videoId), sql`${videos.deletedAt} is null`));
  if (!v) throw new AppError("NOT_FOUND", "Vidéo introuvable.");
  if (v.authorId !== viewer.id) throw new AppError("FORBIDDEN", "Seul l'auteur peut modifier cette vidéo.");
  return v;
}

export async function updateVideo(viewer: Viewer, videoId: string, input: z.input<typeof videoUpdateSchema>) {
  const d = videoUpdateSchema.parse(input);
  await ownVideo(viewer, videoId);
  await db.transaction(async (tx) => {
    await tx.update(videos).set(d).where(eq(videos.id, videoId));
    await linkHashtags(tx, videoId, normalizeTags(d.caption, []));
  });
}

/** Suppression par l'auteur : la vidéo disparaît et ses fichiers sont effacés. */
export async function deleteVideo(viewer: Viewer, videoId: string) {
  const v = await ownVideo(viewer, videoId);
  const [asset] = await db.select({ key: mediaAssets.storageKey }).from(mediaAssets).where(eq(mediaAssets.id, v.assetId));
  await db.update(videos).set({ deletedAt: new Date(), status: "removed" }).where(eq(videos.id, videoId));
  if (asset) await deletePrefix(asset.key.slice(0, asset.key.lastIndexOf("/") + 1)).catch((e) => console.error("[media] purge", e));
}

/** Vue comptée après quelques secondes de lecture ; alimente le signal d'exposition. */
export async function recordView(viewerId: string | null, videoId: string) {
  const [v] = await db.select({ id: videos.id }).from(videos).where(and(eq(videos.id, videoId), videoVisibleTo(viewerId)));
  if (!v) return;
  await db.update(videos).set({ viewCount: sql`${videos.viewCount} + 1` }).where(eq(videos.id, videoId));
  if (viewerId) {
    await db
      .insert(videoViews)
      .values({ userId: viewerId, videoId })
      .onConflictDoUpdate({
        target: [videoViews.userId, videoViews.videoId],
        set: { count: sql`${videoViews.count} + 1`, lastSeenAt: new Date() },
      });
  }
}

export async function recordShare(viewerId: string | null, videoId: string) {
  await db
    .update(videos)
    .set({ shareCount: sql`${videos.shareCount} + 1` })
    .where(and(eq(videos.id, videoId), videoVisibleTo(viewerId)));
}
