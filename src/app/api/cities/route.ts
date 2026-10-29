import { z } from "zod";
import { runRoute } from "@/server/run";
import { listCities, nearestCity } from "@/server/services/cities";

/**
 * GET /api/cities?q= — villes actives.
 * GET /api/cities?lat=&lng= — ville la plus proche (position ni stockée ni journalisée).
 */
export async function GET(req: Request) {
  return runRoute(async () => {
    const sp = new URL(req.url).searchParams;
    if (sp.has("lat")) {
      const { lat, lng } = z
        .object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) })
        .parse({ lat: sp.get("lat"), lng: sp.get("lng") });
      return Response.json(await nearestCity(lat, lng));
    }
    return Response.json(await listCities(sp.get("q")?.slice(0, 80) ?? ""));
  });
}
