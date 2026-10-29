import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { mediaAssets, videos } from "@/server/db/schema";
import { canModerate } from "@/server/permissions";
import { getViewer } from "@/server/session";
import { videoVisibleTo } from "@/server/services/visibility";
import { assertSafeKey, serveObject } from "@/server/storage";

const TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", jpg: "image/jpeg", webp: "image/webp", png: "image/png" };

/**
 * GET /api/media/{clé} — sert un média avec contrôle d'accès :
 * images publiques ; vidéos selon la visibilité de la publication ; originaux réservés à leur propriétaire.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/media/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  try {
    assertSafeKey(key);
  } catch {
    return new Response("Requête invalide", { status: 400 });
  }
  const assetId = parts[1];
  if (!assetId || !/^[0-9a-f-]{36}$/.test(assetId)) return new Response("Introuvable", { status: 404 });
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
  if (!asset) return new Response("Introuvable", { status: 404 });
  const type = TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream";

  if (asset.kind === "image") return serveObject(key, type, req.headers.get("range"));

  // shortcut: contrôle d'accès en base à chaque requête Range — ajouter un cache court si le trafic l'exige.
  const viewer = await getViewer();
  const isOwner = viewer?.id === asset.ownerId;
  if (key === asset.storageKey && !isOwner) return new Response("Accès refusé", { status: 403 });
  if (!isOwner && !(viewer && canModerate(viewer))) {
    const [visible] = await db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.assetId, assetId), videoVisibleTo(viewer?.id ?? null)));
    if (!visible) return new Response("Introuvable", { status: 404 });
  }
  return serveObject(key, type, req.headers.get("range"));
}
