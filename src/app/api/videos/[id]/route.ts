import { z } from "zod";
import { AppError } from "@/server/errors";
import { runRoute } from "@/server/run";
import { rateLimit } from "@/server/rate-limit";
import { getViewer } from "@/server/session";
import { getVideo, recordShare, recordView } from "@/server/services/videos";

/** GET /api/videos/{id} — carte vidéo (visibilité vérifiée). */
export async function GET(_req: Request, ctx: RouteContext<"/api/videos/[id]">) {
  return runRoute(async () => {
    const { id } = await ctx.params;
    const video = await getVideo(z.uuid().parse(id), await getViewer());
    if (!video) throw new AppError("NOT_FOUND", "Vidéo introuvable.");
    return Response.json(video);
  });
}

/** POST /api/videos/{id} — { event: "view" | "share" } : compteurs de lecture et de partage. */
export async function POST(req: Request, ctx: RouteContext<"/api/videos/[id]">) {
  return runRoute(async () => {
    const { id } = await ctx.params;
    const videoId = z.uuid().parse(id);
    const { event } = z.object({ event: z.enum(["view", "share"]) }).parse(await req.json());
    const viewer = await getViewer();
    const who = viewer?.id ?? req.headers.get("x-forwarded-for") ?? "anonyme";
    rateLimit(`${event}:${who}:${videoId}`, event === "view" ? 20 : 5, 3_600_000);
    if (event === "view") await recordView(viewer?.id ?? null, videoId);
    else await recordShare(viewer?.id ?? null, videoId);
    return new Response(null, { status: 204 });
  });
}
