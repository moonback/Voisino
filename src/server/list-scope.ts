import "server-only";
import { currentCity } from "./current-city";
import type { Viewer } from "./permissions";
import { getCityBySlug } from "./services/cities";

/** Filtres communs des pages de liste : ?ville=slug|toutes, ?categorie=, ?page=, ?q=. */
export async function listScope(sp: Record<string, string | string[] | undefined>, viewer: Viewer | null) {
  const s = (k: string) => (typeof sp[k] === "string" && (sp[k] as string).trim() ? (sp[k] as string).trim() : null);
  const ville = s("ville");
  const city = ville === "toutes" ? null : ville ? await getCityBySlug(ville) : await currentCity(viewer);
  return {
    city,
    filters: { q: s("q") ?? "", cityId: city?.id ?? null, categorySlug: s("categorie"), viewerId: viewer?.id ?? null, page: Math.max(0, Number(s("page") ?? 0) || 0) },
  };
}
