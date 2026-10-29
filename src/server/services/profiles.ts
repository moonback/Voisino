import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  blocks,
  bookmarks,
  businessMembers,
  businesses,
  comments,
  eventAttendees,
  follows,
  likes,
  mediaAssets,
  notifications,
  profiles,
  reports,
  user,
  videos,
  type NotificationPrefs,
} from "../db/schema";
import { AppError } from "../errors";
import { deletePrefix, mediaUrl } from "../storage";
import { usernameFrom } from "@/lib/text";
import { profileSchema, privacySchema } from "@/lib/validation";
import type { Viewer } from "../permissions";
import { audit } from "../audit";
import type { z } from "zod";

export async function createProfileFor(userId: string, name: string, email: string) {
  const base = usernameFrom(name || email.split("@")[0]!);
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? base : `${base}${Math.floor(100 + Math.random() * 9900)}`;
    const res = await db.insert(profiles).values({ userId, username: candidate }).onConflictDoNothing().returning();
    if (res.length) return candidate;
  }
  const fallback = `${base}_${userId.slice(0, 8)}`;
  await db.insert(profiles).values({ userId, username: fallback });
  return fallback;
}

/** Suppression de compte (RGPD) : efface les fichiers médias avant la suppression en cascade. */
export async function purgeUserMedia(userId: string) {
  const assets = await db.select({ key: mediaAssets.storageKey }).from(mediaAssets).where(eq(mediaAssets.ownerId, userId));
  for (const a of assets) await deletePrefix(a.key.slice(0, a.key.lastIndexOf("/") + 1)).catch(() => {});
  await audit({ actorId: null, action: "user.delete", entityType: "user", entityId: userId });
}

export async function getProfile(username: string, viewer: Viewer | null) {
  const [p] = await db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      username: profiles.username,
      bio: profiles.bio,
      isPrivate: profiles.isPrivate,
    })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(eq(sql`lower(${profiles.username})`, username.toLowerCase()));
  if (!p || p.status === "suspended") return null;
  const isSelf = viewer?.id === p.id;

  const [[followers], [following], [videoCount], relation, owned] = await Promise.all([
    db.select({ n: count() }).from(follows).where(and(eq(follows.followingId, p.id), eq(follows.accepted, true))),
    db.select({ n: count() }).from(follows).where(and(eq(follows.followerId, p.id), eq(follows.accepted, true))),
    db
      .select({ n: count() })
      .from(videos)
      .where(and(eq(videos.authorId, p.id), eq(videos.status, "published"), sql`${videos.deletedAt} is null`)),
    viewer && !isSelf ? relationBetween(viewer.id, p.id) : null,
    db
      .select({ slug: businesses.slug, name: businesses.name, verification: businesses.verification })
      .from(businessMembers)
      .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
      .where(eq(businessMembers.userId, p.id)),
  ]);
  if (relation?.blockedBy) return null; // l'auteur a bloqué ce lecteur : profil introuvable pour lui
  const canSeeContent = isSelf || !p.isPrivate || relation?.follow === "accepted";
  return {
    ...p,
    isSelf,
    canSeeContent,
    counts: { followers: followers!.n, following: following!.n, videos: videoCount!.n },
    relation,
    businesses: owned,
  };
}

async function relationBetween(viewerId: string, targetId: string) {
  const [f] = await db
    .select({ accepted: follows.accepted })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, targetId)));
  const blockRows = await db
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(
      sql`(${blocks.blockerId} = ${viewerId} and ${blocks.blockedId} = ${targetId}) or (${blocks.blockerId} = ${targetId} and ${blocks.blockedId} = ${viewerId})`,
    );
  return {
    follow: f ? (f.accepted ? ("accepted" as const) : ("pending" as const)) : null,
    blocking: blockRows.some((b) => b.blockerId === viewerId),
    blockedBy: blockRows.some((b) => b.blockerId === targetId),
  };
}

export async function updateProfile(viewer: Viewer, input: z.input<typeof profileSchema>) {
  const data = profileSchema.parse(input);
  let image: string | undefined;
  if (data.imageAssetId) {
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, data.imageAssetId), eq(mediaAssets.ownerId, viewer.id), eq(mediaAssets.kind, "image")));
    if (!asset) throw new AppError("VALIDATION", "Image introuvable.");
    image = mediaUrl(asset.storageKey)!;
  }
  try {
    await db.transaction(async (tx) => {
      await tx.update(user).set({ name: data.name, ...(image ? { image } : {}) }).where(eq(user.id, viewer.id));
      await tx.update(profiles).set({ username: data.username, bio: data.bio || null }).where(eq(profiles.userId, viewer.id));
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "Ce pseudonyme est déjà pris.");
    throw e;
  }
  return { username: data.username };
}

export async function updatePrivacy(viewer: Viewer, input: z.input<typeof privacySchema>) {
  const data = privacySchema.parse(input);
  await db.transaction(async (tx) => {
    await tx.update(profiles).set(data).where(eq(profiles.userId, viewer.id));
    // Repasser en public accepte les demandes en attente.
    if (!data.isPrivate) await tx.update(follows).set({ accepted: true }).where(eq(follows.followingId, viewer.id));
  });
}

export async function getSettings(userId: string) {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p) throw new AppError("NOT_FOUND", "Profil introuvable.");
  return p;
}

export async function updateNotificationPrefs(viewer: Viewer, prefs: NotificationPrefs) {
  const clean = Object.fromEntries(Object.entries(prefs).filter(([, v]) => typeof v === "boolean"));
  await db.update(profiles).set({ notificationPrefs: clean }).where(eq(profiles.userId, viewer.id));
}

export async function setHomeCity(userId: string, cityId: string) {
  await db.update(profiles).set({ cityId }).where(eq(profiles.userId, userId));
}

export async function listConnections(userId: string, kind: "followers" | "following", page = 0, pageSize = 30) {
  const other = kind === "followers" ? follows.followerId : follows.followingId;
  const self = kind === "followers" ? follows.followingId : follows.followerId;
  const rows = await db
    .select({ id: user.id, name: user.name, image: user.image, username: profiles.username, bio: profiles.bio })
    .from(follows)
    .innerJoin(user, eq(user.id, other))
    .innerJoin(profiles, eq(profiles.userId, other))
    .where(and(eq(self, userId), eq(follows.accepted, true), sql`${user.status} <> 'suspended'`))
    .orderBy(desc(follows.createdAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

/** Export RGPD : toutes les données personnelles de l'utilisateur, au format JSON. */
export async function exportUserData(userId: string) {
  const [account] = await db
    .select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, role: user.role, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId));
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const [myVideos, myComments, myLikes, myBookmarks, myFollows, myNotifications, myReports, myEvents] = await Promise.all([
    db.select().from(videos).where(eq(videos.authorId, userId)),
    db.select().from(comments).where(eq(comments.authorId, userId)),
    db.select().from(likes).where(eq(likes.userId, userId)),
    db.select().from(bookmarks).where(eq(bookmarks.userId, userId)),
    db.select().from(follows).where(eq(follows.followerId, userId)),
    db.select().from(notifications).where(eq(notifications.userId, userId)),
    db.select().from(reports).where(eq(reports.reporterId, userId)),
    db.select().from(eventAttendees).where(eq(eventAttendees.userId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account,
    profile,
    videos: myVideos,
    comments: myComments,
    likes: myLikes,
    bookmarks: myBookmarks,
    following: myFollows,
    notifications: myNotifications,
    reports: myReports,
    events: myEvents,
  };
}

export function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}
