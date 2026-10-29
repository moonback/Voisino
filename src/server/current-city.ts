import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Viewer } from "./permissions";
import { CITY_COOKIE, getCityById, getCityBySlug, type City } from "./services/cities";

/** Ville courante : cookie de navigation, sinon ville principale du profil. */
export const currentCity = cache(async (viewer: Viewer | null): Promise<City | null> => {
  const slug = (await cookies()).get(CITY_COOKIE)?.value;
  const fromCookie = slug ? await getCityBySlug(slug) : null;
  if (fromCookie?.isActive) return fromCookie;
  if (viewer?.cityId) return getCityById(viewer.cityId);
  return null;
});
