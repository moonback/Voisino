"use server";

import type { z } from "zod";
import { commentSchema, reportSchema } from "@/lib/validation";
import { runAction } from "../run";
import { requireContributor, requireViewer } from "../session";
import * as comments from "../services/comments";
import { createReport } from "../services/moderation";
import * as social from "../services/social";

export const likeVideo = async (videoId: string, liked: boolean) =>
  runAction(async () => social.setLike(await requireViewer(), videoId, liked));

export const saveItem = async (target: social.BookmarkTarget, saved: boolean) =>
  runAction(async () => social.setBookmark(await requireViewer(), target, saved));

export const followUser = async (userId: string, following: boolean) =>
  runAction(async () => {
    const v = await requireViewer();
    return following ? social.follow(v, userId) : social.unfollow(v, userId);
  });

export const answerFollowRequest = async (followerId: string, accept: boolean) =>
  runAction(async () => social.answerFollowRequest(await requireViewer(), followerId, accept));

export const blockUser = async (userId: string, blocked: boolean) =>
  runAction(async () => social.setBlock(await requireViewer(), userId, blocked));

export const followBusiness = async (businessId: string, following: boolean) =>
  runAction(async () => social.setBusinessFollow(await requireViewer(), businessId, following));

export const followCategory = async (categoryId: string, following: boolean) =>
  runAction(async () => social.setCategoryFollow(await requireViewer(), categoryId, following));

export const setAttendance = async (eventId: string, status: "going" | "interested" | null) =>
  runAction(async () => social.setAttendance(await requireViewer(), eventId, status));

export const postComment = async (input: z.input<typeof commentSchema>) =>
  runAction(async () => comments.addComment(await requireContributor(), input));

export const editComment = async (commentId: string, body: string) =>
  runAction(async () => comments.editComment(await requireContributor(), commentId, body));

export const deleteComment = async (commentId: string) =>
  runAction(async () => comments.deleteComment(await requireViewer(), commentId));

export const reportContent = async (input: z.input<typeof reportSchema>) =>
  runAction(async () => {
    await createReport(await requireViewer(), input);
    return null;
  });
