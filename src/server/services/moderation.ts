import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Tx } from "../db";
import { appeals, businesses, comments, events, moderationActions, newsArticles, profiles, reports, session, user, videos } from "../db/schema";
import { AppError } from "../errors";
import { audit } from "../audit";
import { canModerate, canModerateCity, type Viewer } from "../permissions";
import { limit } from "../rate-limit";
import { reportSchema } from "@/lib/validation";
import { notify } from "./notifications";
import { getSetting } from "./settings";

export type TargetType = (typeof reports.$inferSelect)["targetType"];
export type ModerationAction = (typeof moderationActions.$inferSelect)["action"];

type TargetInfo = { cityId: string | null; subjectUserId: string | null; label: string; href: string; excerpt: string; state: string };

/** Résout une cible signalée : ville (périmètre de modération), auteur, aperçu. */
export async function describeTarget(type: TargetType, id: string): Promise<TargetInfo | null> {
  switch (type) {
    case "video": {
      const [v] = await db.select({ cityId: videos.cityId, authorId: videos.authorId, caption: videos.caption, status: videos.status }).from(videos).where(eq(videos.id, id));
      return v && { cityId: v.cityId, subjectUserId: v.authorId, label: "Vidéo", href: `/v/${id}`, excerpt: v.caption || "(sans légende)", state: v.status };
    }
    case "comment": {
      const [c] = await db
        .select({ cityId: videos.cityId, authorId: comments.authorId, body: comments.body, videoId: comments.videoId, status: comments.status })
        .from(comments)
        .innerJoin(videos, eq(videos.id, comments.videoId))
        .where(eq(comments.id, id));
      return c && { cityId: c.cityId, subjectUserId: c.authorId, label: "Commentaire", href: `/v/${c.videoId}`, excerpt: c.body, state: c.status };
    }
    case "user": {
      const [u] = await db.select({ cityId: profiles.cityId, username: profiles.username, name: user.name, status: user.status }).from(user).innerJoin(profiles, eq(profiles.userId, user.id)).where(eq(user.id, id));
      return u && { cityId: u.cityId, subjectUserId: id, label: "Profil", href: `/u/${u.username}`, excerpt: `${u.name} (@${u.username})`, state: u.status };
    }
    case "business": {
      const [b] = await db.select({ cityId: businesses.cityId, slug: businesses.slug, name: businesses.name, hidden: businesses.isHidden, owner: businesses.createdById }).from(businesses).where(eq(businesses.id, id));
      return b && { cityId: b.cityId, subjectUserId: b.owner, label: "Commerce", href: `/commerces/${b.slug}`, excerpt: b.name, state: b.hidden ? "hidden" : "visible" };
    }
    case "event": {
      const [e] = await db.select({ cityId: events.cityId, slug: events.slug, title: events.title, organizerId: events.organizerId, status: events.status }).from(events).where(eq(events.id, id));
      return e && { cityId: e.cityId, subjectUserId: e.organizerId, label: "Événement", href: `/evenements/${e.slug}`, excerpt: e.title, state: e.status };
    }
    case "news": {
      const [n] = await db.select({ cityId: newsArticles.cityId, slug: newsArticles.slug, title: newsArticles.title, authorId: newsArticles.authorId, status: newsArticles.status }).from(newsArticles).where(eq(newsArticles.id, id));
      return n && { cityId: n.cityId, subjectUserId: n.authorId, label: "Actualité", href: `/actualites/${n.slug}`, excerpt: n.title, state: n.status };
    }
  }
}

export async function createReport(viewer: Viewer, input: z.input<typeof reportSchema>) {
  const d = reportSchema.parse(input);
  limit("report", viewer.id);
  const target = await describeTarget(d.targetType, d.targetId);
  if (!target) throw new AppError("NOT_FOUND", "Contenu introuvable.");
  if (target.subjectUserId === viewer.id) throw new AppError("VALIDATION", "Vous ne pouvez pas signaler votre propre contenu.");
  const [row] = await db
    .insert(reports)
    .values({ reporterId: viewer.id, targetType: d.targetType, targetId: d.targetId, reason: d.reason as never, details: d.details, cityId: target.cityId })
    .onConflictDoNothing()
    .returning({ id: reports.id });
  if (!row) throw new AppError("CONFLICT", "Vous avez déjà signalé ce contenu. Notre équipe l'examine.");

  // Protection : au-delà d'un seuil de signalements distincts, une vidéo ou un commentaire est masqué en attendant l'examen.
  if (d.targetType === "video" || d.targetType === "comment") {
    const threshold = Number(await getSetting("auto_hide_threshold"));
    const [{ n }] = (await db
      .select({ n: count() })
      .from(reports)
      .where(and(eq(reports.targetType, d.targetType), eq(reports.targetId, d.targetId), eq(reports.status, "open")))) as [{ n: number }];
    if (threshold > 0 && n >= threshold && target.state !== "hidden" && target.state !== "removed") {
      await db.transaction(async (tx) => {
        await applyToTarget(tx, d.targetType, d.targetId, "hide");
        await tx.insert(moderationActions).values({
          moderatorId: null,
          targetType: d.targetType,
          targetId: d.targetId,
          subjectUserId: target.subjectUserId,
          action: "hide",
          reason: `Masquage automatique après ${n} signalements, en attente d'examen.`,
        });
      });
    }
  }
  return row;
}

export async function listReports(viewer: Viewer, status: "open" | "resolved" | "dismissed" = "open", page = 0, pageSize = 25) {
  if (!canModerate(viewer)) throw new AppError("FORBIDDEN", "Accès réservé à l'équipe de modération.");
  const scope =
    viewer.role === "local_admin"
      ? viewer.adminCityIds.length
        ? inArray(reports.cityId, viewer.adminCityIds)
        : sql`false`
      : sql`true`;
  const rows = await db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      details: reports.details,
      status: reports.status,
      createdAt: reports.createdAt,
      reporterUsername: profiles.username,
      sameTarget: sql<number>`(select count(*) from reports r2 where r2.target_type = ${reports.targetType} and r2.target_id = ${reports.targetId} and r2.status = 'open')`.mapWith(Number),
    })
    .from(reports)
    .innerJoin(profiles, eq(profiles.userId, reports.reporterId))
    .where(and(eq(reports.status, status), scope))
    .orderBy(status === "open" ? reports.createdAt : desc(reports.createdAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  const items = await Promise.all(rows.slice(0, pageSize).map(async (r) => ({ ...r, target: await describeTarget(r.targetType, r.targetId) })));
  return { items, hasMore: rows.length > pageSize };
}

/** Modifie l'état d'une cible. Retourne false si l'action ne s'applique pas à ce type. */
async function applyToTarget(tx: Tx, type: TargetType, id: string, action: ModerationAction) {
  const hide = action === "hide";
  const remove = action === "remove";
  const restore = action === "restore";
  if (!hide && !remove && !restore) return false;
  switch (type) {
    case "video":
      await tx
        .update(videos)
        .set({ status: restore ? sql`case when ${videos.publishedAt} is null then 'processing'::video_status else 'published'::video_status end` : hide ? "hidden" : "removed" })
        .where(eq(videos.id, id));
      return true;
    case "comment": {
      const [c] = await tx.select({ status: comments.status, videoId: comments.videoId }).from(comments).where(eq(comments.id, id));
      if (!c) return false;
      const next = restore ? "visible" : hide ? "hidden" : "removed";
      const delta = (next === "visible" ? 1 : 0) - (c.status === "visible" ? 1 : 0);
      await tx.update(comments).set({ status: next }).where(eq(comments.id, id));
      if (delta) await tx.update(videos).set({ commentCount: sql`greatest(0, ${videos.commentCount} + ${delta})` }).where(eq(videos.id, c.videoId));
      return true;
    }
    case "business":
      await tx.update(businesses).set({ isHidden: !restore }).where(eq(businesses.id, id));
      return true;
    case "event":
      await tx.update(events).set({ status: restore ? "published" : "removed" }).where(eq(events.id, id));
      return true;
    case "news":
      await tx.update(newsArticles).set({ status: restore ? "published" : "removed" }).where(eq(newsArticles.id, id));
      return true;
    case "user":
      return false;
  }
}

async function applyToUser(tx: Tx, userId: string, action: ModerationAction) {
  if (action === "suspend") {
    await tx.update(user).set({ status: "suspended" }).where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId)); // déconnexion immédiate
  } else if (action === "restrict") {
    await tx.update(user).set({ status: "restricted" }).where(eq(user.id, userId));
  } else if (action === "reactivate") {
    await tx.update(user).set({ status: "active" }).where(eq(user.id, userId));
  }
}

const ACTION_MESSAGES: Partial<Record<ModerationAction, string>> = {
  hide: "Un de vos contenus a été masqué par la modération.",
  remove: "Un de vos contenus a été retiré par la modération.",
  restore: "Un de vos contenus a été rétabli.",
  warn: "Vous avez reçu un avertissement de la modération.",
  restrict: "Votre compte est restreint : vous ne pouvez plus publier temporairement.",
  reactivate: "Votre compte a été réactivé.",
};

/** Applique une décision de modération sur une cible (avec ou sans signalement). */
export async function moderate(
  viewer: Viewer,
  input: { targetType: TargetType; targetId: string; action: ModerationAction; reason: string; reportId?: string },
) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new AppError("VALIDATION", "Indiquez le motif de la décision (journalisé).");
  const target = await describeTarget(input.targetType, input.targetId);
  if (!target) throw new AppError("NOT_FOUND", "Contenu introuvable.");
  if (!canModerateCity(viewer, target.cityId)) throw new AppError("FORBIDDEN", "Ce contenu n'est pas dans votre périmètre de modération.");
  if (target.subjectUserId === viewer.id) throw new AppError("FORBIDDEN", "Vous ne pouvez pas modérer votre propre contenu.");
  const userActions: ModerationAction[] = ["warn", "restrict", "suspend", "reactivate"];

  const actionId = await db.transaction(async (tx) => {
    if (input.action !== "dismiss") {
      if (userActions.includes(input.action)) {
        if (!target.subjectUserId) throw new AppError("VALIDATION", "Aucun compte associé à ce contenu.");
        // Un modérateur ne peut pas sanctionner un membre de l'équipe.
        const [subject] = await tx.select({ role: user.role }).from(user).where(eq(user.id, target.subjectUserId));
        if (subject && subject.role !== "user" && subject.role !== "pro" && viewer.role !== "global_admin") {
          throw new AppError("FORBIDDEN", "Seul un administrateur global peut sanctionner un membre de l'équipe.");
        }
        await applyToUser(tx, target.subjectUserId, input.action);
      } else if (!(await applyToTarget(tx, input.targetType, input.targetId, input.action))) {
        throw new AppError("VALIDATION", "Cette action ne s'applique pas à ce type de contenu.");
      }
    }
    const [a] = await tx
      .insert(moderationActions)
      .values({ moderatorId: viewer.id, targetType: input.targetType, targetId: input.targetId, subjectUserId: target.subjectUserId, action: input.action, reason })
      .returning({ id: moderationActions.id });
    await tx
      .update(reports)
      .set({ status: input.action === "dismiss" ? "dismissed" : "resolved", resolvedById: viewer.id, resolvedAt: new Date() })
      .where(and(eq(reports.targetType, input.targetType), eq(reports.targetId, input.targetId), eq(reports.status, "open")));
    await audit(
      { actorId: viewer.id, action: `moderation.${input.action}`, entityType: input.targetType, entityId: input.targetId, metadata: { reason, reportId: input.reportId ?? null } },
      tx,
    );
    return a!.id;
  });

  const message = ACTION_MESSAGES[input.action];
  if (message && target.subjectUserId && input.action !== "suspend") {
    await notify({ userId: target.subjectUserId, type: "moderation", message: `${message} Motif : ${reason}` });
  }
  return { actionId };
}

/** Décisions concernant l'utilisateur, pour la page de contestation. */
export async function myModerationDecisions(viewer: Viewer) {
  return db
    .select({
      id: moderationActions.id,
      action: moderationActions.action,
      reason: moderationActions.reason,
      targetType: moderationActions.targetType,
      createdAt: moderationActions.createdAt,
      appealStatus: appeals.status,
    })
    .from(moderationActions)
    .leftJoin(appeals, and(eq(appeals.actionId, moderationActions.id), eq(appeals.userId, viewer.id)))
    .where(and(eq(moderationActions.subjectUserId, viewer.id), sql`${moderationActions.action} <> 'dismiss'`))
    .orderBy(desc(moderationActions.createdAt))
    .limit(50);
}

export async function createAppeal(viewer: Viewer, actionId: string, message: string) {
  const text = message.trim();
  if (text.length < 10) throw new AppError("VALIDATION", "Expliquez votre contestation (10 caractères minimum).");
  const [a] = await db.select().from(moderationActions).where(and(eq(moderationActions.id, actionId), eq(moderationActions.subjectUserId, viewer.id)));
  if (!a) throw new AppError("NOT_FOUND", "Décision introuvable.");
  const [row] = await db.insert(appeals).values({ actionId, userId: viewer.id, message: text.slice(0, 2000) }).onConflictDoNothing().returning();
  if (!row) throw new AppError("CONFLICT", "Vous avez déjà contesté cette décision.");
  return row;
}

export async function listAppeals(viewer: Viewer) {
  if (!canModerate(viewer)) throw new AppError("FORBIDDEN", "Accès réservé à l'équipe de modération.");
  return db
    .select({
      id: appeals.id,
      message: appeals.message,
      createdAt: appeals.createdAt,
      action: moderationActions.action,
      reason: moderationActions.reason,
      targetType: moderationActions.targetType,
      targetId: moderationActions.targetId,
      username: profiles.username,
    })
    .from(appeals)
    .innerJoin(moderationActions, eq(moderationActions.id, appeals.actionId))
    .innerJoin(profiles, eq(profiles.userId, appeals.userId))
    .where(eq(appeals.status, "pending"))
    .orderBy(appeals.createdAt)
    .limit(50);
}

/** Contestation acceptée : la décision est annulée (contenu rétabli ou compte réactivé). */
export async function decideAppeal(viewer: Viewer, appealId: string, accept: boolean) {
  const [ap] = await db
    .select({ appeal: appeals, action: moderationActions })
    .from(appeals)
    .innerJoin(moderationActions, eq(moderationActions.id, appeals.actionId))
    .where(eq(appeals.id, appealId));
  if (!ap) throw new AppError("NOT_FOUND", "Contestation introuvable.");
  if (ap.appeal.status !== "pending") throw new AppError("CONFLICT", "Contestation déjà traitée.");
  const target = await describeTarget(ap.action.targetType, ap.action.targetId);
  if (!canModerateCity(viewer, target?.cityId ?? null)) throw new AppError("FORBIDDEN", "Hors de votre périmètre.");
  await db.update(appeals).set({ status: accept ? "approved" : "rejected", decidedById: viewer.id, decidedAt: new Date() }).where(eq(appeals.id, appealId));
  if (accept) {
    const reverse: ModerationAction = ["suspend", "restrict"].includes(ap.action.action) ? "reactivate" : "restore";
    if (["hide", "remove", "suspend", "restrict"].includes(ap.action.action)) {
      await moderate(viewer, { targetType: ap.action.targetType, targetId: ap.action.targetId, action: reverse, reason: "Contestation acceptée" });
    }
  } else {
    await notify({ userId: ap.appeal.userId, type: "moderation", message: "Votre contestation a été examinée : la décision est maintenue." });
  }
  await audit({ actorId: viewer.id, action: accept ? "appeal.approve" : "appeal.reject", entityType: "appeal", entityId: appealId });
}
