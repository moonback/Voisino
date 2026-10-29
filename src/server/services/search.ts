import "server-only";
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../db";
import { businesses, categories, cities, events, hashtags, newsArticles, places, profiles, user, videoHashtags, videos } from "../db/schema";
import { hydrateVideos } from "./videos";
import { videoVisibleTo } from "./visibility";

export const SEARCH_TYPES = ["videos", "commerces", "evenements", "actualites", "lieux", "comptes"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

type Filters = { q: string; cityId: string | null; categorySlug: string | null; viewerId: string | null; page: number };
const PAGE = 12;

/** Échappe les jokers LIKE saisis par l'utilisateur. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const catFilter = (col: AnyPgColumn, slug: string | null) =>
  slug ? sql`${col} = (select id from categories where slug = ${slug})` : sql`true`;

export async function searchVideos({ q, cityId, categorySlug, viewerId, page }: Filters) {
  const tag = q.replace(/^#/, "").toLowerCase();
  const text = q
    ? or(
        sql`to_tsvector('french', ${videos.caption}) @@ plainto_tsquery('french', ${q})`,
        ilike(videos.caption, like(q)),
        sql`exists (select 1 from ${videoHashtags} vh join ${hashtags} h on h.id = vh.hashtag_id where vh.video_id = ${videos.id} and h.tag = ${tag})`,
        sql`exists (select 1 from profiles p where p.user_id = ${videos.authorId} and p.username ilike ${like(q)})`,
      )
    : sql`true`;
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(videoVisibleTo(viewerId), text, cityId ? eq(videos.cityId, cityId) : sql`true`, catFilter(videos.categoryId, categorySlug)))
    .orderBy(q ? sql`(${videos.likeCount} + ${videos.commentCount} * 2) desc, ${videos.publishedAt} desc` : desc(videos.publishedAt))
    .limit(PAGE + 1)
    .offset(page * PAGE);
  return { items: await hydrateVideos(rows.slice(0, PAGE).map((r) => r.id), viewerId), hasMore: rows.length > PAGE };
}

export async function searchBusinesses({ q, cityId, categorySlug, page }: Filters) {
  const rows = await db
    .select({
      id: businesses.id,
      slug: businesses.slug,
      name: businesses.name,
      description: businesses.description,
      logoUrl: businesses.logoUrl,
      coverUrl: businesses.coverUrl,
      address: businesses.address,
      verification: businesses.verification,
      plan: businesses.plan,
      isDemo: businesses.isDemo,
      categoryName: categories.name,
      cityName: cities.name,
    })
    .from(businesses)
    .innerJoin(cities, eq(cities.id, businesses.cityId))
    .leftJoin(categories, eq(categories.id, businesses.categoryId))
    .where(
      and(
        eq(businesses.isHidden, false),
        q ? or(ilike(businesses.name, like(q)), ilike(businesses.description, like(q)), ilike(categories.name, like(q))) : sql`true`,
        cityId ? eq(businesses.cityId, cityId) : sql`true`,
        catFilter(businesses.categoryId, categorySlug),
      ),
    )
    .orderBy(sql`${businesses.verification} = 'verified' desc`, businesses.name)
    .limit(PAGE + 1)
    .offset(page * PAGE);
  return { items: rows.slice(0, PAGE), hasMore: rows.length > PAGE };
}

export async function searchEvents({ q, cityId, categorySlug, page }: Filters, includePast = false) {
  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      description: events.description,
      coverUrl: events.coverUrl,
      venueName: events.venueName,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      status: events.status,
      isDemo: events.isDemo,
      timezone: cities.timezone,
      cityName: cities.name,
      categoryName: categories.name,
      going: sql<number>`(select count(*) from event_attendees a where a.event_id = ${events.id} and a.status = 'going')`.mapWith(Number),
    })
    .from(events)
    .innerJoin(cities, eq(cities.id, events.cityId))
    .leftJoin(categories, eq(categories.id, events.categoryId))
    .where(
      and(
        sql`${events.status} <> 'removed'`,
        includePast ? sql`true` : gte(events.endsAt, sql`now()`),
        q ? or(ilike(events.title, like(q)), ilike(events.description, like(q)), ilike(events.venueName, like(q))) : sql`true`,
        cityId ? eq(events.cityId, cityId) : sql`true`,
        catFilter(events.categoryId, categorySlug),
      ),
    )
    .orderBy(includePast ? desc(events.startsAt) : events.startsAt)
    .limit(PAGE + 1)
    .offset(page * PAGE);
  return { items: rows.slice(0, PAGE), hasMore: rows.length > PAGE };
}

export async function searchNews({ q, cityId, categorySlug, page }: Filters) {
  const rows = await db
    .select({
      id: newsArticles.id,
      slug: newsArticles.slug,
      title: newsArticles.title,
      summary: newsArticles.summary,
      coverUrl: newsArticles.coverUrl,
      isBrief: newsArticles.isBrief,
      sourceName: newsArticles.sourceName,
      publishedAt: newsArticles.publishedAt,
      isDemo: newsArticles.isDemo,
      cityName: cities.name,
      categoryName: categories.name,
    })
    .from(newsArticles)
    .innerJoin(cities, eq(cities.id, newsArticles.cityId))
    .leftJoin(categories, eq(categories.id, newsArticles.categoryId))
    .where(
      and(
        eq(newsArticles.status, "published"),
        q
          ? or(
              sql`to_tsvector('french', ${newsArticles.title} || ' ' || ${newsArticles.summary}) @@ plainto_tsquery('french', ${q})`,
              ilike(newsArticles.title, like(q)),
            )
          : sql`true`,
        cityId ? eq(newsArticles.cityId, cityId) : sql`true`,
        catFilter(newsArticles.categoryId, categorySlug),
      ),
    )
    .orderBy(desc(newsArticles.publishedAt))
    .limit(PAGE + 1)
    .offset(page * PAGE);
  return { items: rows.slice(0, PAGE), hasMore: rows.length > PAGE };
}

export async function searchPlaces({ q, cityId, categorySlug, page }: Filters) {
  const rows = await db
    .select({
      id: places.id,
      slug: places.slug,
      name: places.name,
      description: places.description,
      coverUrl: places.coverUrl,
      address: places.address,
      isDemo: places.isDemo,
      cityName: cities.name,
      categoryName: categories.name,
      videoCount: sql<number>`(select count(*) from videos v where v.place_id = ${places.id} and v.status = 'published' and v.deleted_at is null)`.mapWith(Number),
    })
    .from(places)
    .innerJoin(cities, eq(cities.id, places.cityId))
    .leftJoin(categories, eq(categories.id, places.categoryId))
    .where(
      and(
        q ? or(ilike(places.name, like(q)), ilike(places.description, like(q))) : sql`true`,
        cityId ? eq(places.cityId, cityId) : sql`true`,
        catFilter(places.categoryId, categorySlug),
      ),
    )
    .orderBy(places.name)
    .limit(PAGE + 1)
    .offset(page * PAGE);
  return { items: rows.slice(0, PAGE), hasMore: rows.length > PAGE };
}

export async function searchAccounts({ q, page, viewerId }: Filters) {
  const v = viewerId ?? "00000000-0000-0000-0000-000000000000";
  const rows = await db
    .select({ id: user.id, name: user.name, image: user.image, username: profiles.username, bio: profiles.bio })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(
      and(
        sql`${user.status} <> 'suspended'`,
        q ? or(ilike(profiles.username, like(q)), ilike(user.name, like(q))) : sql`true`,
        sql`not exists (select 1 from blocks b where (b.blocker_id = ${v} and b.blocked_id = ${user.id}) or (b.blocker_id = ${user.id} and b.blocked_id = ${v}))`,
      ),
    )
    .orderBy(profiles.username)
    .limit(PAGE + 1)
    .offset(page * PAGE);
  return { items: rows.slice(0, PAGE), hasMore: rows.length > PAGE };
}

/** Suggestions instantanées (préfixe) : hashtags, comptes, commerces. */
export async function suggest(q: string, cityId: string | null) {
  const query = q.trim().replace(/^#/, "");
  if (query.length < 2) return [];
  const prefix = `${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const [tags, accounts, shops] = await Promise.all([
    db
      .select({ label: hashtags.tag })
      .from(hashtags)
      .where(and(ilike(hashtags.tag, prefix), eq(hashtags.isBlocked, false)))
      .limit(4),
    db
      .select({ label: profiles.username, name: user.name })
      .from(profiles)
      .innerJoin(user, eq(user.id, profiles.userId))
      .where(and(ilike(profiles.username, prefix), sql`${user.status} <> 'suspended'`))
      .limit(3),
    db
      .select({ label: businesses.name, slug: businesses.slug })
      .from(businesses)
      .where(and(ilike(businesses.name, `%${prefix}`), eq(businesses.isHidden, false), cityId ? eq(businesses.cityId, cityId) : sql`true`))
      .limit(3),
  ]);
  return [
    ...tags.map((t) => ({ kind: "hashtag" as const, label: `#${t.label}`, href: `/explorer?q=${encodeURIComponent(`#${t.label}`)}` })),
    ...accounts.map((a) => ({ kind: "compte" as const, label: `@${a.label}`, hint: a.name, href: `/u/${a.label}` })),
    ...shops.map((s) => ({ kind: "commerce" as const, label: s.label, href: `/commerces/${s.slug}` })),
  ];
}

/** Hashtags les plus utilisés sur 7 jours dans la ville (vidéos visibles uniquement). */
export async function trendingHashtags(cityId: string | null, max = 10) {
  return db
    .select({ tag: hashtags.tag, uses: sql<number>`count(*)`.mapWith(Number) })
    .from(videoHashtags)
    .innerJoin(hashtags, eq(hashtags.id, videoHashtags.hashtagId))
    .innerJoin(videos, eq(videos.id, videoHashtags.videoId))
    .where(
      and(
        eq(hashtags.isBlocked, false),
        videoVisibleTo(null),
        sql`${videos.publishedAt} > now() - interval '7 days'`,
        cityId ? eq(videos.cityId, cityId) : sql`true`,
      ),
    )
    .groupBy(hashtags.tag)
    .orderBy(sql`count(*) desc`)
    .limit(max);
}

export async function popularVideos(cityId: string | null, viewerId: string | null, max = 8) {
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(videoVisibleTo(viewerId), cityId ? eq(videos.cityId, cityId) : sql`true`, sql`${videos.publishedAt} > now() - interval '30 days'`))
    .orderBy(sql`(${videos.likeCount} + 2 * ${videos.commentCount} + 3 * ${videos.shareCount}) desc`)
    .limit(max);
  return hydrateVideos(rows.map((r) => r.id), viewerId);
}
