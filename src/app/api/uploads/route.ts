import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { once } from "node:events";
import { db } from "@/server/db";
import { mediaAssets } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { runRoute } from "@/server/run";
import { rateLimit } from "@/server/rate-limit";
import { requireContributor } from "@/server/session";
import { normalizeImage, sniff } from "@/server/services/media";
import { putFile, stagingPath } from "@/server/storage";

const MB = 1024 * 1024;

/**
 * POST /api/uploads?kind=video|image — corps brut du fichier (pas de multipart),
 * ce qui permet un suivi de progression côté client et un flux direct vers le disque.
 * Le type réel est vérifié sur les premiers octets ; les images sont réencodées sans métadonnées.
 * Réponse 201 : { assetId, status }.
 */
export async function POST(req: Request) {
  return runRoute(async () => {
    const viewer = await requireContributor();
    rateLimit(`upload-file:${viewer.id}`, 30, 3_600_000);
    const kind = new URL(req.url).searchParams.get("kind") === "image" ? "image" : "video";
    const max = kind === "video" ? Number(process.env.MAX_UPLOAD_MB ?? 200) * MB : 8 * MB;
    const tooBig = () => new AppError("VALIDATION", `Fichier trop volumineux (maximum ${Math.round(max / MB)} Mo).`);
    if (Number(req.headers.get("content-length") ?? 0) > max) throw tooBig();
    if (!req.body) throw new AppError("VALIDATION", "Aucun fichier reçu.");

    const assetId = crypto.randomUUID();
    const tmp = await stagingPath(`${kind}s/${assetId}/upload.bin`);
    const out = createWriteStream(tmp);
    const reader = req.body.getReader();
    let size = 0;
    let head = new Uint8Array(0);
    let detected: ReturnType<typeof sniff> = null;
    const outputs: string[] = [tmp];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) throw tooBig();
        if (!detected && head.length < 16) {
          head = new Uint8Array([...head, ...value.subarray(0, 16 - head.length)]);
          if (head.length >= 12) {
            detected = sniff(head);
            if (!detected || detected.kind !== kind) {
              throw new AppError(
                "VALIDATION",
                kind === "video" ? "Format non pris en charge : MP4, MOV ou WebM uniquement." : "Format non pris en charge : JPEG, PNG ou WebP uniquement.",
              );
            }
          }
        }
        if (!out.write(value)) await once(out, "drain");
      }
      out.end();
      await once(out, "finish");
      if (!detected || size === 0) throw new AppError("VALIDATION", "Fichier vide ou illisible.");

      if (kind === "image") {
        const key = `images/${assetId}/image.webp`;
        const target = await stagingPath(key);
        if (process.env.STORAGE_DRIVER === "s3") outputs.push(target);
        await normalizeImage(tmp, target).catch(() => {
          throw new AppError("VALIDATION", "Image illisible.");
        });
        await putFile(key, target, "image/webp");
        await db.insert(mediaAssets).values({ id: assetId, ownerId: viewer.id, kind, storageKey: key, mimeType: "image/webp", sizeBytes: size, status: "ready" });
        return Response.json({ assetId, status: "ready" }, { status: 201 });
      }

      const key = `videos/${assetId}/original.${detected.ext}`;
      await putFile(key, tmp, detected.mime);
      await db.insert(mediaAssets).values({ id: assetId, ownerId: viewer.id, kind, storageKey: key, mimeType: detected.mime, sizeBytes: size, status: "uploaded" });
      return Response.json({ assetId, status: "uploaded" }, { status: 201 });
    } catch (e) {
      out.destroy();
      await reader.cancel().catch(() => {});
      throw e;
    } finally {
      for (const f of outputs) await unlink(f).catch(() => {});
    }
  });
}
