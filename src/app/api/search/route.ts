import { z } from "zod";
import { runRoute } from "@/server/run";
import { getViewer } from "@/server/session";
import { getCityBySlug } from "@/server/services/cities";
import * as search from "@/server/services/search";

const params = z.object({
  q: z.string().trim().max(100).default(""),
  type: z.enum(search.SEARCH_TYPES).default("videos"),
  ville: z.string().max(80).optional(),
  categorie: z.string().max(80).optional(),
  page: z.coerce.number().int().min(0).max(500).default(0),
  suggest: z.literal("1").optional(),
});

/**
 * GET /api/search?q=&type=videos|commerces|evenements|actualites|lieux|comptes&ville=&categorie=&page=
 * GET /api/search?q=&suggest=1 — suggestions instantanées.
 */
export async function GET(req: Request) {
  return runRoute(async () => {
    const p = params.parse(Object.fromEntries(new URL(req.url).searchParams));
    const city = p.ville ? await getCityBySlug(p.ville) : null;
    if (p.suggest) return Response.json(await search.suggest(p.q, city?.id ?? null));
    const viewer = await getViewer();
    const filters = { q: p.q, cityId: city?.id ?? null, categorySlug: p.categorie ?? null, viewerId: viewer?.id ?? null, page: p.page };
    const run = {
      videos: search.searchVideos,
      commerces: search.searchBusinesses,
      evenements: search.searchEvents,
      actualites: search.searchNews,
      lieux: search.searchPlaces,
      comptes: search.searchAccounts,
    }[p.type];
    return Response.json(await run(filters));
  });
}
