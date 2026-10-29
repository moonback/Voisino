import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db";
import { comments, profiles, user, videos } from "../db/schema";
import { AppError } from "../errors";
import { canModerate, type Viewer } from "../permissions";
import { limit } from "../rate-limit";
import { extractMentions } from "@/lib/text";
import { commentSchema } from "@/lib/validation";
import { notify } from "./notifications";
import { videoVisibleTo } from "./visibility";

const NOBODY = "00000000-0000-0000-0000-000000000000";

const commentFields = {
  id: comments.id,
  body: comments.body,
  parentId: comments.parentId,
  createdAt: comments.createdAt,
  editedAt: comments.editedAt,
  authorId: comments.authorId,
  authorName: user.name,
  authorImage: user.image,
  authorUsername: profiles.username,
};

/** Commentaires visibles (hors auteurs bloqués ou suspendus), avec leurs réponses. */
export async function listComments(videoId: string, viewer: Viewer | null, page = 0, pageSize = 20) {
  const vid = viewer?.id ?? NOBODY;
  const [v] = await db.select({ id: videos.id }).from(videos).where(and(eq(videos.id, videoId), videoVisibleTo(viewer?.id ?? null)));
  if (!v) throw new AppError("NOT_FOUND", "Vidéo introuvable.");
  const visible = and(
    eq(comments.videoId, videoId),
    eq(comments.status, "visible"),
    sql`${user.status} <> 'suspended'`,
    sql`not exists (select 1 from blocks b where (b.blocker_id = ${vid} and b.blocked_id = ${comments.authorId}) or (b.blocker_id = ${comments.authorId} and b.blocked_id = ${vid}))`,
  );
  const top = await db
    .select(commentFields)
    .from(comments)
    .innerJoin(user, eq(user.id, comments.authorId))
    .innerJoin(profiles, eq(profiles.userId, comments.authorId))
    .where(and(visible, isNull(comments.parentId)))
    .orderBy(desc(comments.createdAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  const parents = top.slice(0, pageSize);
  const replies = parents.length
    ? await db
        .select(commentFields)
        .from(comments)
        .innerJoin(user, eq(user.id, comments.authorId))
        .innerJoin(profiles, eq(profiles.userId, comments.authorId))
        .where(and(visible, inArray(comments.parentId, parents.map((p) => p.id))))
        .orderBy(asc(comments.createdAt))
    : [];
  return {
    items: parents.map((p) => ({ ...p, replies: replies.filter((r) => r.parentId === p.id) })),
    hasMore: top.length > pageSize,
  };
}
export type CommentItem = Awaited<ReturnType<typeof listComments>>["items"][number];

export async function addComment(viewer: Viewer, input: z.input<typeof commentSchema>) {
  const d = commentSchema.parse(input);
  limit("comment", viewer.id);
  const [v] = await db
    .select({
      id: videos.id,
      authorId: videos.authorId,
      allowComments: videos.allowComments,
      authorAllows: profiles.allowComments,
    })
    .from(videos)
    .innerJoin(profiles, eq(profiles.userId, videos.authorId))
    .where(and(eq(videos.id, d.videoId), videoVisibleTo(viewer.id)));
  if (!v) throw new AppError("NOT_FOUND", "Vidéo introuvable.");
  if (!v.allowComments || !v.authorAllows) throw new AppError("FORBIDDEN", "Les commentaires sont désactivés sur cette vidéo.");

  let parentAuthor: string | null = null;
  if (d.parentId) {
    const [p] = await db
      .select({ authorId: comments.authorId, parentId: comments.parentId })
      .from(comments)
      .where(and(eq(comments.id, d.parentId), eq(comments.videoId, d.videoId), eq(comments.status, "visible")));
    if (!p) throw new AppError("NOT_FOUND", "Le commentaire auquel vous répondez n'existe plus.");
    if (p.parentId) throw new AppError("VALIDATION", "Répondez au commentaire principal.");
    parentAuthor = p.authorId;
  }

  const created = await db.transaction(async (tx) => {
    const [c] = await tx.insert(comments).values({ videoId: d.videoId, authorId: viewer.id, parentId: d.parentId, body: d.body }).returning();
    await tx.update(videos).set({ commentCount: sql`${videos.commentCount} + 1` }).where(eq(videos.id, d.videoId));
    return c!;
  });

  if (parentAuthor) await notify({ userId: parentAuthor, actorId: viewer.id, type: "reply", videoId: d.videoId, commentId: created.id });
  if (v.authorId !== parentAuthor) await notify({ userId: v.authorId, actorId: viewer.id, type: "comment", videoId: d.videoId, commentId: created.id });
  const mentioned = extractMentions(d.body);
  if (mentioned.length) {
    const targets = await db
      .select({ id: profiles.userId })
      .from(profiles)
      .where(inArray(sql`lower(${profiles.username})`, mentioned));
    for (const t of targets) {
      if (t.id !== v.authorId && t.id !== parentAuthor) {
        await notify({ userId: t.id, actorId: viewer.id, type: "mention", videoId: d.videoId, commentId: created.id });
      }
    }
  }
  return {
    ...created,
    authorName: viewer.name,
    authorImage: viewer.image,
    authorUsername: viewer.username,
    replies: [],
  };
}

export async function editComment(viewer: Viewer, commentId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > 1000) throw new AppError("VALIDATION", "Le commentaire doit contenir entre 1 et 1 000 caractères.");
  const res = await db
    .update(comments)
    .set({ body: text, editedAt: new Date() })
    .where(and(eq(comments.id, commentId), eq(comments.authorId, viewer.id), eq(comments.status, "visible")))
    .returning({ id: comments.id });
  if (!res.length) throw new AppError("FORBIDDEN", "Vous ne pouvez modifier que vos propres commentaires.");
}

/** Suppression par l'auteur du commentaire ou par l'auteur de la vidéo (ou un modérateur). */
export async function deleteComment(viewer: Viewer, commentId: string) {
  const [c] = await db
    .select({ id: comments.id, authorId: comments.authorId, videoId: comments.videoId, videoAuthor: videos.authorId })
    .from(comments)
    .innerJoin(videos, eq(videos.id, comments.videoId))
    .where(and(eq(comments.id, commentId), eq(comments.status, "visible")));
  if (!c) throw new AppError("NOT_FOUND", "Commentaire introuvable.");
  if (c.authorId !== viewer.id && c.videoAuthor !== viewer.id && !canModerate(viewer)) {
    throw new AppError("FORBIDDEN", "Vous ne pouvez pas supprimer ce commentaire.");
  }
  await db.transaction(async (tx) => {
    const removed = await tx
      .update(comments)
      .set({ status: "removed" })
      .where(sql`${comments.id} = ${commentId} or (${comments.parentId} = ${commentId} and ${comments.status} = 'visible')`)
      .returning({ id: comments.id });
    await tx
      .update(videos)
      .set({ commentCount: sql`greatest(0, ${videos.commentCount} - ${removed.length})` })
      .where(eq(videos.id, c.videoId));
  });
}
