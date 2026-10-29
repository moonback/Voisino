import { z } from "zod";
import { AppError } from "@/server/errors";
import { runRoute } from "@/server/run";
import { getViewer } from "@/server/session";
import { getCityBySlug } from "@/server/services/cities";
import { getFeed } from "@/server/services/feed";

const body = z.object({
  city: z.string().min(1).max(80),
  mode: z.enum(["local", "following"]).default("local"),
  exclude: z.array(z.uuid()).max(300).default([]),
});

/** POST /api/feed — page suivante du flux. Corps : { city, mode, exclude[] }. */
export async function POST(req: Request) {
  return runRoute(async () => {
    const input = body.parse(await req.json());
    const city = await getCityBySlug(input.city);
    if (!city) throw new AppError("NOT_FOUND", "Ville inconnue.");
    const viewer = await getViewer();
    return Response.json(await getFeed({ viewerId: viewer?.id ?? null, cityId: city.id, mode: input.mode, exclude: input.exclude }));
  });
}
