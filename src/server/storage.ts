import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Stockage des médias. Deux pilotes :
 *  - local : disque (STORAGE_DIR) — développement ou serveur unique ;
 *  - s3    : tout service compatible S3 (AWS, R2, Scaleway, MinIO).
 */
const driver = () => (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3";
const root = () => path.resolve(process.env.STORAGE_DIR ?? "./storage/media");

/** Les clés sont générées par le serveur ; on refuse tout chemin suspect. */
export function assertSafeKey(key: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(key) || key.includes("..")) throw new Error("Clé de stockage invalide");
}

const localPath = (key: string) => {
  assertSafeKey(key);
  return path.join(root(), key);
};

async function s3() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const bucket = process.env.S3_BUCKET;
  if (!bucket || !process.env.S3_ACCESS_KEY_ID) throw new Error("STORAGE_DRIVER=s3 : S3_BUCKET et S3_ACCESS_KEY_ID requis");
  const client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  return { client, bucket };
}

/** Enregistre un fichier local sous une clé. */
export async function putFile(key: string, filePath: string, contentType: string) {
  if (driver() === "local") {
    const dest = localPath(key);
    if (path.resolve(filePath) === dest) return;
    await mkdir(path.dirname(dest), { recursive: true });
    await pipeline(createReadStream(filePath), createWriteStream(dest));
    return;
  }
  const { client, bucket } = await s3();
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { size } = await stat(filePath);
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(filePath), ContentType: contentType, ContentLength: size }),
  );
}

/** Chemin local temporaire où écrire un téléversement avant `putFile`. */
export async function stagingPath(key: string) {
  if (driver() === "local") {
    const p = localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    return p;
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "voisino-"));
  return path.join(dir, path.basename(key));
}

/** Donne un chemin local lisible pour une clé (télécharge depuis S3 si besoin). */
export async function withLocalFile<T>(key: string, fn: (p: string) => Promise<T>): Promise<T> {
  if (driver() === "local") return fn(localPath(key));
  const { client, bucket } = await s3();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const dir = await mkdtemp(path.join(os.tmpdir(), "voisino-"));
  const p = path.join(dir, path.basename(key));
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    await pipeline(obj.Body as Readable, createWriteStream(p));
    return await fn(p);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function deleteObject(key: string) {
  if (driver() === "local") {
    await unlink(localPath(key)).catch(() => {});
    return;
  }
  const { client, bucket } = await s3();
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Supprime toutes les variantes d'un dossier d'actif (ex. videos/<id>/). */
export async function deletePrefix(prefix: string) {
  assertSafeKey(prefix);
  if (driver() === "local") {
    await rm(path.join(root(), prefix), { recursive: true, force: true });
    return;
  }
  const { client, bucket } = await s3();
  const { ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
  const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
  if (keys.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
}

/**
 * Réponse HTTP pour servir un média : flux local avec prise en charge de Range
 * (indispensable pour la lecture vidéo), ou redirection vers une URL S3 signée.
 */
export async function serveObject(key: string, contentType: string, range: string | null): Promise<Response> {
  const cache = "private, max-age=3600";
  if (driver() === "s3") {
    const { client, bucket } = await s3();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
    return Response.redirect(url, 302);
  }
  const p = localPath(key);
  const info = await stat(p).catch(() => null);
  if (!info) return new Response("Introuvable", { status: 404 });
  const size = info.size;
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(p, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": cache,
      },
    });
  }
  const stream = Readable.toWeb(createReadStream(p)) as ReadableStream;
  return new Response(stream, {
    headers: { "Content-Type": contentType, "Content-Length": String(size), "Accept-Ranges": "bytes", "Cache-Control": cache },
  });
}

export const mediaUrl = (key: string | null | undefined) => (key ? `/api/media/${key}` : null);
