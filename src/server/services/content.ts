import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db";
import {
  businessClaims,
  businessFollows,
  businessMembers,
  businesses,
  categories,
  cities,
  eventAttendees,
  events,
  mediaAssets,
  newsArticles,
  places,
  profiles,
  user,
  videos,
} from "../db/schema";
import { AppError } from "../errors";
import { audit } from "../audit";
import { canContribute, canManageCity, canModerateCity, canPublishNews, type Viewer } from "../permissions";
import { limit } from "../rate-limit";
import { mediaUrl } from "../storage";
import { slugify } from "@/lib/text";
import { zonedLocalToUtc } from "@/lib/time";
import { businessSchema, claimSchema, eventSchema, newsSchema } from "@/lib/validation";
import { notify } from "./notifications";
import { hydrateVideos } from "./videos";
import { videoVisibleTo } from "./visibility";

/** Slug unique : suffixe aléatoire court en cas de collision. */
async function uniqueSlug(table: typeof businesses | typeof events | typeof newsArticles, base: string) {
  const root = slugify(base) || "contenu";
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 6)}`;
    const [hit] = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug));
    if (!hit) return slug;
  }
  return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}

async function imageUrlFor(viewer: Viewer, assetId: string | null) {
  if (!assetId) return undefined;
  const [a] = await db
    .select({ key: mediaAssets.storageKey })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.ownerId, viewer.id), eq(mediaAssets.kind, "image"), eq(mediaAssets.status, "ready")));
  if (!a) throw new AppError("VALIDATION", "Image introuvable : téléversez-la à nouveau.");
  return mediaUrl(a.key)!;
}

async function isMember(userId: string, businessId: string, role?: "owner") {
  const [m] = await db
    .select({ role: businessMembers.role })
    .from(businessMembers)
    .where(and(eq(businessMembers.userId, userId), eq(businessMembers.businessId, businessId)));
  return Boolean(m && (!role || m.role === role));
}

// ─── Actualités ───────────────────────────────────────────────────────

export async function getNews(slug: string, viewer: Viewer | null) {
  const [n] = await db
    .select({
      article: newsArticles,
      cityName: cities.name,
      citySlug: cities.slug,
      categoryName: categories.name,
      authorName: user.name,
      authorUsername: profiles.username,
      businessName: businesses.name,
      businessSlug: businesses.slug,
    })
    .from(newsArticles)
    .innerJoin(cities, eq(cities.id, newsArticles.cityId))
    .leftJoin(categories, eq(categories.id, newsArticles.categoryId))
    .leftJoin(user, eq(user.id, newsArticles.authorId))
    .leftJoin(profiles, eq(profiles.userId, newsArticles.authorId))
    .leftJoin(businesses, eq(businesses.id, newsArticles.businessId))
    .where(eq(newsArticles.slug, slug));
  if (!n) return null;
  const isAuthor = viewer?.id === n.article.authorId;
  if (n.article.status !== "published" && !isAuthor && !(viewer && canModerateCity(viewer, n.article.cityId))) return null;
  const related = await db
    .select({ slug: newsArticles.slug, title: newsArticles.title, publishedAt: newsArticles.publishedAt })
    .from(newsArticles)
    .where(
      and(
        eq(newsArticles.cityId, n.article.cityId),
        eq(newsArticles.status, "published"),
        sql`${newsArticles.id} <> ${n.article.id}`,
      ),
    )
    .orderBy(desc(newsArticles.publishedAt))
    .limit(4);
  return { ...n, related, canEdit: isAuthor };
}

export async function saveNews(viewer: Viewer, input: z.input<typeof newsSchema>, id?: string) {
  const d = newsSchema.parse(input);
  const member = d.businessId ? await isMember(viewer.id, d.businessId) : false;
  if (!canPublishNews(viewer, d.cityId, member)) {
    throw new AppError("FORBIDDEN", "La publication d'actualités est réservée aux professionnels vérifiés et aux administrateurs de la ville.");
  }
  if (d.businessId && !member) throw new AppError("FORBIDDEN", "Vous n'êtes pas membre de ce commerce.");
  const coverUrl = await imageUrlFor(viewer, d.coverAssetId);
  const values = {
    title: d.title,
    summary: d.summary,
    body: d.body,
    cityId: d.cityId,
    categoryId: d.categoryId,
    businessId: d.businessId,
    sourceName: d.sourceName || null,
    isBrief: d.isBrief,
    status: d.status,
    ...(coverUrl ? { coverUrl } : {}),
  };
  if (id) {
    const [existing] = await db.select().from(newsArticles).where(eq(newsArticles.id, id));
    if (!existing || (existing.authorId !== viewer.id && !canManageCity(viewer, existing.cityId))) throw new AppError("FORBIDDEN", "Modification non autorisée.");
    await db
      .update(newsArticles)
      .set({ ...values, publishedAt: d.status === "published" ? (existing.publishedAt ?? new Date()) : existing.publishedAt })
      .where(eq(newsArticles.id, id));
    return { slug: existing.slug };
  }
  const slug = await uniqueSlug(newsArticles, d.title);
  await db.insert(newsArticles).values({ ...values, slug, authorId: viewer.id, publishedAt: d.status === "published" ? new Date() : null });
  await audit({ actorId: viewer.id, action: "news.create", entityType: "news", entityId: slug });
  return { slug };
}

// ─── Commerces ────────────────────────────────────────────────────────

export async function getBusiness(slug: string, viewer: Viewer | null) {
  const [b] = await db
    .select({
      business: businesses,
      cityName: cities.name,
      citySlug: cities.slug,
      timezone: cities.timezone,
      categoryName: categories.name,
      lat: sql<number | null>`st_y(${businesses.location})`,
      lng: sql<number | null>`st_x(${businesses.location})`,
      followers: sql<number>`(select count(*) from business_follows f where f.business_id = ${businesses.id})`.mapWith(Number),
    })
    .from(businesses)
    .innerJoin(cities, eq(cities.id, businesses.cityId))
    .leftJoin(categories, eq(categories.id, businesses.categoryId))
    .where(eq(businesses.slug, slug));
  if (!b) return null;
  const member = viewer ? await db.select({ role: businessMembers.role }).from(businessMembers).where(and(eq(businessMembers.businessId, b.business.id), eq(businessMembers.userId, viewer.id))) : [];
  if (b.business.isHidden && !member.length && !(viewer && canModerateCity(viewer, b.business.cityId))) return null;

  const [videoRows, news, upcoming, following, pendingClaim] = await Promise.all([
    db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.businessId, b.business.id), videoVisibleTo(viewer?.id ?? null)))
      .orderBy(desc(videos.publishedAt))
      .limit(12),
    db
      .select({ slug: newsArticles.slug, title: newsArticles.title, summary: newsArticles.summary, publishedAt: newsArticles.publishedAt })
      .from(newsArticles)
      .where(and(eq(newsArticles.businessId, b.business.id), eq(newsArticles.status, "published")))
      .orderBy(desc(newsArticles.publishedAt))
      .limit(5),
    db
      .select({ slug: events.slug, title: events.title, startsAt: events.startsAt })
      .from(events)
      .where(and(eq(events.businessId, b.business.id), eq(events.status, "published"), sql`${events.endsAt} >= now()`))
      .orderBy(events.startsAt)
      .limit(5),
    viewer
      ? db.select({ u: businessFollows.userId }).from(businessFollows).where(and(eq(businessFollows.businessId, b.business.id), eq(businessFollows.userId, viewer.id)))
      : [],
    viewer
      ? db
          .select({ id: businessClaims.id })
          .from(businessClaims)
          .where(and(eq(businessClaims.businessId, b.business.id), eq(businessClaims.userId, viewer.id), eq(businessClaims.status, "pending")))
      : [],
  ]);
  return {
    ...b,
    videos: await hydrateVideos(videoRows.map((r) => r.id), viewer?.id ?? null),
    news,
    upcoming,
    isFollowing: following.length > 0,
    memberRole: member[0]?.role ?? null,
    hasPendingClaim: pendingClaim.length > 0,
  };
}

/** Création d'une fiche par un utilisateur : elle n'est jamais vérifiée d'office. */
export async function createBusiness(viewer: Viewer, input: z.input<typeof businessSchema>) {
  if (!canContribute(viewer)) throw new AppError("FORBIDDEN", "Confirmez votre adresse e-mail pour créer une fiche.");
  limit("claim", viewer.id);
  const d = businessSchema.parse(input);
  const slug = await uniqueSlug(businesses, d.name);
  const [b] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(businesses)
      .values({ ...businessValues(d), slug, cityId: d.cityId, createdById: viewer.id, verification: "pending" })
      .returning({ id: businesses.id, slug: businesses.slug });
    await tx.insert(businessMembers).values({ businessId: rows[0]!.id, userId: viewer.id, role: "owner" });
    return rows;
  });
  await audit({ actorId: viewer.id, action: "business.create", entityType: "business", entityId: b!.id });
  return b!;
}

function businessValues(d: z.output<typeof businessSchema>) {
  return {
    name: d.name,
    categoryId: d.categoryId,
    description: d.description || null,
    address: d.address || null,
    phone: d.phone || null,
    email: d.email || null,
    website: d.website,
    hours: d.hours,
  };
}

export async function updateBusiness(viewer: Viewer, businessId: string, input: z.input<typeof businessSchema>) {
  const d = businessSchema.parse(input);
  const [b] = await db.select({ cityId: businesses.cityId }).from(businesses).where(eq(businesses.id, businessId));
  if (!b) throw new AppError("NOT_FOUND", "Commerce introuvable.");
  if (!(await isMember(viewer.id, businessId)) && !canManageCity(viewer, b.cityId)) {
    throw new AppError("FORBIDDEN", "Seuls les gestionnaires de cette fiche peuvent la modifier.");
  }
  // Le nom d'une fiche vérifiée ne change pas sans nouvelle vérification (anti-usurpation).
  const [current] = await db.select({ name: businesses.name, verification: businesses.verification }).from(businesses).where(eq(businesses.id, businessId));
  const renamed = current!.verification === "verified" && current!.name !== d.name;
  await db
    .update(businesses)
    .set({ ...businessValues(d), ...(renamed ? { verification: "pending" as const, verifiedAt: null } : {}) })
    .where(eq(businesses.id, businessId));
  await audit({ actorId: viewer.id, action: "business.update", entityType: "business", entityId: businessId, metadata: { renamed } });
}

export async function requestClaim(viewer: Viewer, input: z.input<typeof claimSchema>) {
  if (!canContribute(viewer)) throw new AppError("FORBIDDEN", "Confirmez votre adresse e-mail pour revendiquer une fiche.");
  limit("claim", viewer.id);
  const d = claimSchema.parse(input);
  const [b] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, d.businessId));
  if (!b) throw new AppError("NOT_FOUND", "Commerce introuvable.");
  if (await isMember(viewer.id, d.businessId)) throw new AppError("CONFLICT", "Vous gérez déjà cette fiche.");
  const [claim] = await db.insert(businessClaims).values({ ...d, userId: viewer.id }).onConflictDoNothing().returning();
  if (!claim) throw new AppError("CONFLICT", "Une demande est déjà en cours d'examen.");
  await audit({ actorId: viewer.id, action: "business.claim.request", entityType: "business", entityId: d.businessId });
  return claim;
}

export async function listClaims(viewer: Viewer, status: "pending" | "approved" | "rejected" = "pending") {
  const rows = await db
    .select({
      id: businessClaims.id,
      message: businessClaims.message,
      proof: businessClaims.proof,
      status: businessClaims.status,
      createdAt: businessClaims.createdAt,
      businessId: businesses.id,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      cityId: businesses.cityId,
      userName: user.name,
      userEmail: user.email,
      username: profiles.username,
    })
    .from(businessClaims)
    .innerJoin(businesses, eq(businesses.id, businessClaims.businessId))
    .innerJoin(user, eq(user.id, businessClaims.userId))
    .innerJoin(profiles, eq(profiles.userId, businessClaims.userId))
    .where(eq(businessClaims.status, status))
    .orderBy(desc(businessClaims.createdAt))
    .limit(100);
  return rows.filter((r) => canManageCity(viewer, r.cityId));
}

/** Validation d'une revendication : l'utilisateur devient propriétaire, la fiche est vérifiée. */
export async function reviewClaim(viewer: Viewer, claimId: string, approve: boolean, note: string) {
  const [c] = await db
    .select({ claim: businessClaims, cityId: businesses.cityId })
    .from(businessClaims)
    .innerJoin(businesses, eq(businesses.id, businessClaims.businessId))
    .where(eq(businessClaims.id, claimId));
  if (!c) throw new AppError("NOT_FOUND", "Demande introuvable.");
  if (!canManageCity(viewer, c.cityId)) throw new AppError("FORBIDDEN", "Vous ne gérez pas cette ville.");
  if (c.claim.status !== "pending") throw new AppError("CONFLICT", "Cette demande a déjà été traitée.");
  await db.transaction(async (tx) => {
    await tx
      .update(businessClaims)
      .set({ status: approve ? "approved" : "rejected", reviewedById: viewer.id, reviewedAt: new Date(), reviewNote: note || null })
      .where(eq(businessClaims.id, claimId));
    if (approve) {
      await tx
        .insert(businessMembers)
        .values({ businessId: c.claim.businessId, userId: c.claim.userId, role: "owner" })
        .onConflictDoUpdate({ target: [businessMembers.businessId, businessMembers.userId], set: { role: "owner" } });
      await tx.update(businesses).set({ verification: "verified", verifiedAt: new Date() }).where(eq(businesses.id, c.claim.businessId));
      await tx.update(user).set({ role: "pro" }).where(and(eq(user.id, c.claim.userId), eq(user.role, "user")));
    }
    await audit(
      { actorId: viewer.id, action: approve ? "business.claim.approve" : "business.claim.reject", entityType: "business", entityId: c.claim.businessId },
      tx,
    );
  });
  await notify({
    userId: c.claim.userId,
    type: "business_claim",
    businessId: c.claim.businessId,
    message: approve ? "Votre demande de gestion a été acceptée : la fiche est vérifiée." : `Votre demande de gestion a été refusée.${note ? ` Motif : ${note}` : ""}`,
  });
}

/** Vérification directe d'une fiche créée par son gérant (après contrôle des justificatifs). */
export async function setBusinessVerification(viewer: Viewer, businessId: string, verification: "verified" | "rejected" | "unverified") {
  const [b] = await db.select({ cityId: businesses.cityId }).from(businesses).where(eq(businesses.id, businessId));
  if (!b) throw new AppError("NOT_FOUND", "Commerce introuvable.");
  if (!canManageCity(viewer, b.cityId)) throw new AppError("FORBIDDEN", "Vous ne gérez pas cette ville.");
  await db
    .update(businesses)
    .set({ verification, verifiedAt: verification === "verified" ? new Date() : null })
    .where(eq(businesses.id, businessId));
  await audit({ actorId: viewer.id, action: `business.verification.${verification}`, entityType: "business", entityId: businessId });
}

export async function myBusinesses(viewer: Viewer) {
  return db
    .select({ id: businesses.id, slug: businesses.slug, name: businesses.name, verification: businesses.verification, role: businessMembers.role, cityId: businesses.cityId })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(eq(businessMembers.userId, viewer.id));
}

// ─── Événements ───────────────────────────────────────────────────────

export async function getEvent(slug: string, viewer: Viewer | null) {
  const [e] = await db
    .select({
      event: events,
      cityName: cities.name,
      citySlug: cities.slug,
      timezone: cities.timezone,
      categoryName: categories.name,
      organizerName: user.name,
      organizerUsername: profiles.username,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      placeName: places.name,
      placeSlug: places.slug,
    })
    .from(events)
    .innerJoin(cities, eq(cities.id, events.cityId))
    .leftJoin(categories, eq(categories.id, events.categoryId))
    .leftJoin(user, eq(user.id, events.organizerId))
    .leftJoin(profiles, eq(profiles.userId, events.organizerId))
    .leftJoin(businesses, eq(businesses.id, events.businessId))
    .leftJoin(places, eq(places.id, events.placeId))
    .where(eq(events.slug, slug));
  if (!e) return null;
  if (e.event.status === "removed" && !(viewer && canModerateCity(viewer, e.event.cityId))) return null;
  const [counts, mine, videoRows] = await Promise.all([
    db
      .select({ status: eventAttendees.status, n: count() })
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, e.event.id))
      .groupBy(eventAttendees.status),
    viewer
      ? db.select({ status: eventAttendees.status }).from(eventAttendees).where(and(eq(eventAttendees.eventId, e.event.id), eq(eventAttendees.userId, viewer.id)))
      : [],
    db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.eventId, e.event.id), videoVisibleTo(viewer?.id ?? null)))
      .orderBy(desc(videos.publishedAt))
      .limit(9),
  ]);
  return {
    ...e,
    going: counts.find((c) => c.status === "going")?.n ?? 0,
    interested: counts.find((c) => c.status === "interested")?.n ?? 0,
    myStatus: mine[0]?.status ?? null,
    isPast: e.event.endsAt < new Date(),
    canEdit: viewer?.id === e.event.organizerId,
    videos: await hydrateVideos(videoRows.map((r) => r.id), viewer?.id ?? null),
  };
}

export async function saveEvent(viewer: Viewer, input: z.input<typeof eventSchema>, id?: string) {
  if (!canContribute(viewer) || viewer.status !== "active") throw new AppError("FORBIDDEN", "Confirmez votre adresse e-mail pour créer un événement.");
  limit("generic", viewer.id);
  const d = eventSchema.parse(input);
  const [city] = await db.select({ timezone: cities.timezone }).from(cities).where(and(eq(cities.id, d.cityId), eq(cities.isActive, true)));
  if (!city) throw new AppError("VALIDATION", "Ville inconnue.");
  if (d.businessId && !(await isMember(viewer.id, d.businessId))) throw new AppError("FORBIDDEN", "Vous n'êtes pas membre de ce commerce.");
  // Les dates saisies sont des heures locales de la ville : conversion en UTC pour le stockage.
  const startsAt = zonedLocalToUtc(d.startsAtLocal, city.timezone);
  const endsAt = zonedLocalToUtc(d.endsAtLocal, city.timezone);
  if (!id && startsAt < new Date(Date.now() - 3_600_000)) throw new AppError("VALIDATION", "La date de début est déjà passée.");
  const coverUrl = await imageUrlFor(viewer, d.coverAssetId);
  const values = {
    title: d.title,
    description: d.description,
    cityId: d.cityId,
    categoryId: d.categoryId,
    businessId: d.businessId,
    venueName: d.venueName || null,
    address: d.address || null,
    startsAt,
    endsAt,
    conditions: d.conditions || null,
    externalUrl: d.externalUrl,
    capacity: d.capacity,
    ...(coverUrl ? { coverUrl } : {}),
  };
  if (id) {
    const [existing] = await db.select().from(events).where(eq(events.id, id));
    if (!existing || existing.organizerId !== viewer.id) throw new AppError("FORBIDDEN", "Seul l'organisateur peut modifier cet événement.");
    await db.update(events).set(values).where(eq(events.id, id));
    return { slug: existing.slug };
  }
  const slug = await uniqueSlug(events, d.title);
  await db.insert(events).values({ ...values, slug, organizerId: viewer.id });
  return { slug };
}

export async function cancelEvent(viewer: Viewer, eventId: string) {
  const res = await db
    .update(events)
    .set({ status: "cancelled" })
    .where(and(eq(events.id, eventId), eq(events.organizerId, viewer.id)))
    .returning({ id: events.id });
  if (!res.length) throw new AppError("FORBIDDEN", "Seul l'organisateur peut annuler cet événement.");
}

/** Fichier iCalendar (RFC 5545) pour ajouter l'événement à un agenda. */
export function toIcs(e: { id: string; title: string; description: string; startsAt: Date; endsAt: Date; venueName: string | null; address: string | null }, url: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Voisino//FR",
    "BEGIN:VEVENT",
    `UID:${e.id}@voisino`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(e.startsAt)}`,
    `DTEND:${fmt(e.endsAt)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(e.description.slice(0, 1000))}`,
    `LOCATION:${esc([e.venueName, e.address].filter(Boolean).join(", "))}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// ─── Lieux ────────────────────────────────────────────────────────────

export async function getPlace(slug: string, viewer: Viewer | null) {
  const [p] = await db
    .select({ place: places, cityName: cities.name, citySlug: cities.slug, categoryName: categories.name })
    .from(places)
    .innerJoin(cities, eq(cities.id, places.cityId))
    .leftJoin(categories, eq(categories.id, places.categoryId))
    .where(eq(places.slug, slug));
  if (!p) return null;
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.placeId, p.place.id), videoVisibleTo(viewer?.id ?? null)))
    .orderBy(desc(videos.publishedAt))
    .limit(12);
  return { ...p, videos: await hydrateVideos(rows.map((r) => r.id), viewer?.id ?? null) };
}

/** Options d'association proposées au formulaire de publication (même ville). */
export async function linkOptions(cityId: string) {
  const [b, e, p] = await Promise.all([
    db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(and(eq(businesses.cityId, cityId), eq(businesses.isHidden, false))).orderBy(businesses.name).limit(200),
    db
      .select({ id: events.id, name: events.title })
      .from(events)
      .where(and(eq(events.cityId, cityId), eq(events.status, "published"), sql`${events.endsAt} >= now() - interval '7 days'`))
      .orderBy(events.startsAt)
      .limit(100),
    db.select({ id: places.id, name: places.name }).from(places).where(eq(places.cityId, cityId)).orderBy(places.name).limit(200),
  ]);
  return { businesses: b, events: e, places: p };
}
