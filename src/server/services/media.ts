import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { follows, mediaAssets, videos } from "../db/schema";
import { putFile, withLocalFile } from "../storage";
import { notify } from "./notifications";

const run = promisify(execFile);
const ffmpeg = () => process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = () => process.env.FFPROBE_PATH || "ffprobe";

export type Sniffed = { kind: "video" | "image"; mime: string; ext: string };

/** Identifie le type réel d'un fichier par ses premiers octets (jamais par son nom). */
export function sniff(head: Uint8Array): Sniffed | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    return brand.startsWith("qt") ? { kind: "video", mime: "video/quicktime", ext: "mov" } : { kind: "video", mime: "video/mp4", ext: "mp4" };
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return { kind: "video", mime: "video/webm", ext: "webm" };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (head[0] === 0x89 && ascii(1, 4) === "PNG") return { kind: "image", mime: "image/png", ext: "png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { kind: "image", mime: "image/webp", ext: "webp" };
  return null;
}

type Probe = { duration: number; width: number; height: number; hasVideo: boolean };

export async function probe(file: string): Promise<Probe> {
  const { stdout } = await run(ffprobe(), ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]);
  const data = JSON.parse(stdout) as { streams?: { codec_type: string; width?: number; height?: number }[]; format?: { duration?: string } };
  const v = data.streams?.find((s) => s.codec_type === "video");
  return { duration: Number(data.format?.duration ?? 0), width: v?.width ?? 0, height: v?.height ?? 0, hasVideo: Boolean(v) };
}

/** Réencode une image téléversée (≤ 1080 px, WebP) et supprime ses métadonnées (dont GPS). */
export async function normalizeImage(input: string, output: string) {
  await run(ffmpeg(), [
    "-y", "-v", "error", "-i", input,
    "-vf", "scale='min(1080,iw)':-2",
    "-map_metadata", "-1", "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", output,
  ]);
}

/**
 * Traitement d'une vidéo : vérification, transcodage H.264 « faststart » (côté long ≤ 1280 px),
 * image de couverture, puis publication et notifications.
 */
export async function processVideoAsset(videoId: string) {
  const [row] = await db
    .select({ video: videos, asset: mediaAssets })
    .from(videos)
    .innerJoin(mediaAssets, eq(mediaAssets.id, videos.assetId))
    .where(eq(videos.id, videoId));
  if (!row) return; // vidéo supprimée entre-temps
  const { video, asset } = row;
  if (video.status !== "processing" || video.deletedAt) return;
  await db.update(mediaAssets).set({ status: "processing" }).where(eq(mediaAssets.id, asset.id));

  const maxSeconds = Number(process.env.MAX_VIDEO_SECONDS ?? 180);
  const dir = await mkdtemp(path.join(os.tmpdir(), "voisino-video-"));
  const prefix = path.posix.dirname(asset.storageKey);
  try {
    const meta = await withLocalFile(asset.storageKey, async (input) => {
      const info = await probe(input);
      if (!info.hasVideo) throw new FatalMediaError("Le fichier ne contient pas de piste vidéo.");
      if (info.duration > maxSeconds + 1) throw new FatalMediaError(`La vidéo dépasse ${maxSeconds} secondes.`);
      await run(ffmpeg(), [
        "-y", "-v", "error", "-i", input,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-profile:v", "main", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-map_metadata", "-1",
        path.join(dir, "video.mp4"),
      ]);
      await run(ffmpeg(), [
        "-y", "-v", "error", "-ss", String(Math.min(1, info.duration / 2)), "-i", input,
        "-frames:v", "1", "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'", "-q:v", "4",
        path.join(dir, "poster.jpg"),
      ]);
      return info;
    });
    const out = await probe(path.join(dir, "video.mp4"));
    const variants = { video: `${prefix}/video.mp4`, poster: `${prefix}/poster.jpg` };
    await putFile(variants.video, path.join(dir, "video.mp4"), "video/mp4");
    await putFile(variants.poster, path.join(dir, "poster.jpg"), "image/jpeg");

    await db.transaction(async (tx) => {
      await tx
        .update(mediaAssets)
        .set({ status: "ready", variants, width: out.width, height: out.height, durationSec: Math.round(meta.duration), error: null })
        .where(eq(mediaAssets.id, asset.id));
      await tx.update(videos).set({ status: "published", publishedAt: new Date() }).where(eq(videos.id, videoId));
    });
    await notify({ userId: video.authorId, type: "video_ready", videoId, message: "Votre vidéo est en ligne." });
    if (video.visibility !== "private") {
      // shortcut: notifie au plus 1 000 abonnés en ligne ; passer à un envoi par lots au-delà.
      const fans = await db
        .select({ id: follows.followerId })
        .from(follows)
        .where(and(eq(follows.followingId, video.authorId), eq(follows.accepted, true)))
        .limit(1000);
      for (const f of fans) await notify({ userId: f.id, actorId: video.authorId, type: "new_video", videoId });
    }
  } catch (e) {
    if (e instanceof FatalMediaError) {
      await failVideoProcessing(videoId, e.message);
      return;
    }
    await db.update(mediaAssets).set({ status: "uploaded" }).where(eq(mediaAssets.id, asset.id));
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Erreur définitive (fichier invalide) : inutile de réessayer. */
class FatalMediaError extends Error {}

export async function failVideoProcessing(videoId: string, reason: string) {
  const [v] = await db.update(videos).set({ status: "failed" }).where(eq(videos.id, videoId)).returning();
  if (!v) return;
  await db.update(mediaAssets).set({ status: "failed", error: reason }).where(eq(mediaAssets.id, v.assetId));
  await notify({ userId: v.authorId, type: "video_failed", videoId, message: `Le traitement de votre vidéo a échoué : ${reason}` });
}
