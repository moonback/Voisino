"use server";

import { after } from "next/server";
import type { z } from "zod";
import { videoSchema, videoUpdateSchema } from "@/lib/validation";
import { runAction } from "../run";
import { processJobs } from "../jobs";
import { requireContributor, requireViewer } from "../session";
import * as videos from "../services/videos";

export const publishVideo = async (input: z.input<typeof videoSchema>) =>
  runAction(async () => {
    const created = await videos.createVideo(await requireContributor(), input);
    // Développement / petit serveur : traitement juste après la réponse. Sinon `npm run worker`.
    if (process.env.PROCESS_JOBS_INLINE === "true") after(() => processJobs(3));
    return created;
  });

export const updateVideo = async (videoId: string, input: z.input<typeof videoUpdateSchema>) =>
  runAction(async () => videos.updateVideo(await requireViewer(), videoId, input));

export const deleteVideo = async (videoId: string) => runAction(async () => videos.deleteVideo(await requireViewer(), videoId));

/** Permet à l'auteur de suivre l'état de traitement depuis l'écran de publication. */
export const videoStatus = async (videoId: string) =>
  runAction(async () => {
    const v = await videos.getVideo(videoId, await requireViewer());
    return { status: v?.status ?? "removed" };
  });
