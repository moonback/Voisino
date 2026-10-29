import { z } from "zod";
import { runRoute } from "@/server/run";
import { getViewer } from "@/server/session";
import { listComments } from "@/server/services/comments";

/** GET /api/videos/{id}/comments?page=0 — commentaires et réponses, paginés. */
export async function GET(req: Request, ctx: RouteContext<"/api/videos/[id]/comments">) {
  return runRoute(async () => {
    const { id } = await ctx.params;
    const page = z.coerce.number().int().min(0).max(1000).catch(0).parse(new URL(req.url).searchParams.get("page"));
    return Response.json(await listComments(z.uuid().parse(id), await getViewer(), page));
  });
}
