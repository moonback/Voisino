import "server-only";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Tx } from "../db";
import { businesses, notifications, profiles, user, videos } from "../db/schema";
import { AppError } from "../errors";
import { blockedBetween } from "./visibility";

type NotificationType = (typeof notifications.$inferInsert)["type"];

/** Types administratifs : toujours envoyés, quelles que soient les préférences. */
const MANDATORY: NotificationType[] = ["moderation", "video_failed", "business_claim"];

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  follow: "Nouveaux abonnés",
  like: "J'aime sur vos vidéos",
  comment: "Commentaires",
  reply: "Réponses à vos commentaires",
  mention: "Mentions",
  new_video: "Nouvelles vidéos des comptes suivis",
  video_ready: "Vidéo publiée après traitement",
  video_failed: "Échec de traitement d'une vidéo",
  business_claim: "Comptes professionnels",
  moderation: "Décisions de modération",
  event_reminder: "Rappels d'événements",
};
export const CONFIGURABLE_TYPES = (Object.keys(NOTIFICATION_LABELS) as NotificationType[]).filter((t) => !MANDATORY.includes(t));

export async function notify(n: typeof notifications.$inferInsert, tx: Tx | typeof db = db) {
  if (n.actorId && n.actorId === n.userId) return;
  if (!MANDATORY.includes(n.type)) {
    const [p] = await tx.select({ prefs: profiles.notificationPrefs }).from(profiles).where(eq(profiles.userId, n.userId));
    if (p?.prefs?.[n.type] === false) return;
  }
  if (n.actorId) {
    const [b] = await tx.execute<{ blocked: boolean }>(sql`select ${blockedBetween(n.actorId, n.userId)} as blocked`);
    if (b?.blocked) return;
  }
  await tx.insert(notifications).values(n);
}

const actor = alias(user, "actor");
const actorProfile = alias(profiles, "actor_profile");

export async function listNotifications(userId: string, page = 0, pageSize = 20) {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      message: notifications.message,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      videoId: notifications.videoId,
      actorName: actor.name,
      actorImage: actor.image,
      actorUsername: actorProfile.username,
      businessSlug: businesses.slug,
      businessName: businesses.name,
      videoCaption: videos.caption,
    })
    .from(notifications)
    .leftJoin(actor, eq(actor.id, notifications.actorId))
    .leftJoin(actorProfile, eq(actorProfile.userId, notifications.actorId))
    .leftJoin(businesses, eq(businesses.id, notifications.businessId))
    .leftJoin(videos, eq(videos.id, notifications.videoId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  return {
    items: rows.slice(0, pageSize).map((r) => ({ ...r, href: hrefFor(r) })),
    hasMore: rows.length > pageSize,
  };
}

function hrefFor(r: { type: NotificationType; videoId: string | null; actorUsername: string | null; businessSlug: string | null }) {
  if (r.videoId) return `/v/${r.videoId}`;
  if (r.businessSlug) return `/commerces/${r.businessSlug}`;
  if (r.type === "moderation") return "/parametres/moderation";
  if (r.actorUsername) return `/u/${r.actorUsername}`;
  return "/activite";
}

export async function unreadCount(userId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function markRead(userId: string, id: string) {
  const res = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  if (!res.length) throw new AppError("NOT_FOUND", "Notification introuvable.");
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
