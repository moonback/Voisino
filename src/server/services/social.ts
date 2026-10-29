import "server-only";
import { and, desc, eq, gt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { blocks, bookmarks, businessFollows, businesses, categoryFollows, eventAttendees, events, follows, likes, newsArticles, notifications, profiles, user, videos } from "../db/schema";
import { AppError } from "../errors";
import type { Viewer } from "../permissions";
import { limit } from "../rate-limit";
import { notify } from "./notifications";
import { blockedBetween, videoVisibleTo } from "./visibility";

async function visibleVideo(viewerId: string, videoId: string) {
  const [v] = await db
    .select({ id: videos.id, authorId: videos.authorId })
    .from(videos)
    .where(and(eq(videos.id, videoId), videoVisibleTo(viewerId)));
  if (!v) throw new AppError("NOT_FOUND", "Cette vidéo n'est plus disponible.");
  return v;
}

/** J'aime idempotent : la clé primaire (user, vidéo) empêche tout doublon, même en cas de double clic. */
export async function setLike(viewer: Viewer, videoId: string, liked: boolean) {
  limit("like", viewer.id);
  const v = await visibleVideo(viewer.id, videoId);
  const changed = await db.transaction(async (tx) => {
    const res = liked
      ? await tx.insert(likes).values({ userId: viewer.id, videoId }).onConflictDoNothing().returning()
      : await tx.delete(likes).where(and(eq(likes.userId, viewer.id), eq(likes.videoId, videoId))).returning();
    if (res.length) {
      await tx
        .update(videos)
        .set({ likeCount: sql`greatest(0, ${videos.likeCount} + ${liked ? 1 : -1})` })
        .where(eq(videos.id, videoId));
    }
    return res.length > 0;
  });
  if (changed && liked) {
    // Une seule notification par personne et par vidéo sur 24 h (évite le spam j'aime / je n'aime plus).
    const [recent] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, v.authorId),
          eq(notifications.actorId, viewer.id),
          eq(notifications.videoId, videoId),
          eq(notifications.type, "like"),
          gt(notifications.createdAt, sql`now() - interval '24 hours'`),
        ),
      );
    if (!recent) await notify({ userId: v.authorId, actorId: viewer.id, type: "like", videoId });
  }
  const [{ likeCount }] = (await db.select({ likeCount: videos.likeCount }).from(videos).where(eq(videos.id, videoId))) as [{ likeCount: number }];
  return { liked, likeCount };
}

export type BookmarkTarget = { videoId: string } | { newsId: string } | { eventId: string };

export async function setBookmark(viewer: Viewer, target: BookmarkTarget, saved: boolean) {
  limit("like", viewer.id);
  if ("videoId" in target) await visibleVideo(viewer.id, target.videoId);
  const col = "videoId" in target ? bookmarks.videoId : "newsId" in target ? bookmarks.newsId : bookmarks.eventId;
  const id = Object.values(target)[0] as string;
  if (saved) {
    await db.insert(bookmarks).values({ userId: viewer.id, ...target }).onConflictDoNothing();
  } else {
    await db.delete(bookmarks).where(and(eq(bookmarks.userId, viewer.id), eq(col, id)));
  }
  return { saved };
}

export async function isBookmarked(viewerId: string, target: BookmarkTarget) {
  const col = "videoId" in target ? bookmarks.videoId : "newsId" in target ? bookmarks.newsId : bookmarks.eventId;
  const [r] = await db.select({ id: bookmarks.id }).from(bookmarks).where(and(eq(bookmarks.userId, viewerId), eq(col, Object.values(target)[0] as string)));
  return Boolean(r);
}

/** Abonnement. Compte privé → demande en attente d'acceptation. */
export async function follow(viewer: Viewer, targetId: string) {
  limit("follow", viewer.id);
  if (targetId === viewer.id) throw new AppError("VALIDATION", "Vous ne pouvez pas vous abonner à vous-même.");
  const [target] = await db
    .select({ isPrivate: profiles.isPrivate, status: user.status, blocked: sql<boolean>`${blockedBetween(viewer.id, targetId)}` })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(eq(profiles.userId, targetId));
  if (!target || target.status === "suspended" || target.blocked) throw new AppError("NOT_FOUND", "Profil introuvable.");
  const [row] = await db
    .insert(follows)
    .values({ followerId: viewer.id, followingId: targetId, accepted: !target.isPrivate })
    .onConflictDoNothing()
    .returning();
  if (row?.accepted) await notify({ userId: targetId, actorId: viewer.id, type: "follow" });
  if (row && !row.accepted) {
    await notify({ userId: targetId, actorId: viewer.id, type: "follow", message: "souhaite s'abonner à votre compte privé." });
  }
  return { state: target.isPrivate ? ("pending" as const) : ("accepted" as const) };
}

export async function unfollow(viewer: Viewer, targetId: string) {
  await db.delete(follows).where(and(eq(follows.followerId, viewer.id), eq(follows.followingId, targetId)));
  return { state: null };
}

export async function listFollowRequests(viewer: Viewer) {
  return db
    .select({ id: user.id, name: user.name, image: user.image, username: profiles.username, createdAt: follows.createdAt })
    .from(follows)
    .innerJoin(user, eq(user.id, follows.followerId))
    .innerJoin(profiles, eq(profiles.userId, follows.followerId))
    .where(and(eq(follows.followingId, viewer.id), eq(follows.accepted, false)))
    .orderBy(desc(follows.createdAt))
    .limit(50);
}

export async function answerFollowRequest(viewer: Viewer, followerId: string, accept: boolean) {
  const where = and(eq(follows.followerId, followerId), eq(follows.followingId, viewer.id), eq(follows.accepted, false));
  const res = accept ? await db.update(follows).set({ accepted: true }).where(where).returning() : await db.delete(follows).where(where).returning();
  if (!res.length) throw new AppError("NOT_FOUND", "Demande introuvable.");
  if (accept) await notify({ userId: followerId, actorId: viewer.id, type: "follow", message: "a accepté votre demande d'abonnement." });
}

/** Blocage : supprime les abonnements dans les deux sens et masque les contenus réciproquement. */
export async function setBlock(viewer: Viewer, targetId: string, blocked: boolean) {
  if (targetId === viewer.id) throw new AppError("VALIDATION", "Vous ne pouvez pas vous bloquer vous-même.");
  await db.transaction(async (tx) => {
    if (blocked) {
      await tx.insert(blocks).values({ blockerId: viewer.id, blockedId: targetId }).onConflictDoNothing();
      await tx
        .delete(follows)
        .where(
          or(
            and(eq(follows.followerId, viewer.id), eq(follows.followingId, targetId)),
            and(eq(follows.followerId, targetId), eq(follows.followingId, viewer.id)),
          ),
        );
    } else {
      await tx.delete(blocks).where(and(eq(blocks.blockerId, viewer.id), eq(blocks.blockedId, targetId)));
    }
  });
  return { blocked };
}

export async function listBlocked(viewer: Viewer) {
  return db
    .select({ id: user.id, name: user.name, username: profiles.username, image: user.image })
    .from(blocks)
    .innerJoin(user, eq(user.id, blocks.blockedId))
    .innerJoin(profiles, eq(profiles.userId, blocks.blockedId))
    .where(eq(blocks.blockerId, viewer.id));
}

export async function setBusinessFollow(viewer: Viewer, businessId: string, following: boolean) {
  limit("follow", viewer.id);
  const [b] = await db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, businessId), eq(businesses.isHidden, false)));
  if (!b) throw new AppError("NOT_FOUND", "Commerce introuvable.");
  if (following) await db.insert(businessFollows).values({ userId: viewer.id, businessId }).onConflictDoNothing();
  else await db.delete(businessFollows).where(and(eq(businessFollows.userId, viewer.id), eq(businessFollows.businessId, businessId)));
  return { following };
}

export async function setCategoryFollow(viewer: Viewer, categoryId: string, following: boolean) {
  if (following) await db.insert(categoryFollows).values({ userId: viewer.id, categoryId }).onConflictDoNothing();
  else await db.delete(categoryFollows).where(and(eq(categoryFollows.userId, viewer.id), eq(categoryFollows.categoryId, categoryId)));
  return { following };
}

export async function followedCategoryIds(viewerId: string) {
  return (await db.select({ id: categoryFollows.categoryId }).from(categoryFollows).where(eq(categoryFollows.userId, viewerId))).map((r) => r.id);
}

/** Participation / intérêt pour un événement, avec contrôle de capacité. */
export async function setAttendance(viewer: Viewer, eventId: string, status: "going" | "interested" | null) {
  const [ev] = await db.select().from(events).where(and(eq(events.id, eventId), eq(events.status, "published")));
  if (!ev) throw new AppError("NOT_FOUND", "Événement introuvable ou annulé.");
  if (ev.endsAt < new Date()) throw new AppError("VALIDATION", "Cet événement est terminé.");
  if (status === null) {
    await db.delete(eventAttendees).where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.userId, viewer.id)));
    return { status };
  }
  await db.transaction(async (tx) => {
    if (status === "going" && ev.capacity) {
      // Verrou sur l'événement : deux inscriptions simultanées ne dépassent pas la capacité.
      await tx.execute(sql`select id from events where id = ${eventId} for update`);
      const [{ n }] = (await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from event_attendees where event_id = ${eventId} and status = 'going' and user_id <> ${viewer.id}`,
      )) as unknown as [{ n: number }];
      if (n >= ev.capacity) throw new AppError("CONFLICT", "Cet événement est complet.");
    }
    await tx
      .insert(eventAttendees)
      .values({ eventId, userId: viewer.id, status })
      .onConflictDoUpdate({ target: [eventAttendees.eventId, eventAttendees.userId], set: { status } });
  });
  return { status };
}

export async function newsExists(id: string) {
  const [n] = await db.select({ id: newsArticles.id }).from(newsArticles).where(and(eq(newsArticles.id, id), eq(newsArticles.status, "published")));
  return Boolean(n);
}
