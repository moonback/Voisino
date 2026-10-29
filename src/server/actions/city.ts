"use server";

import { cookies } from "next/headers";
import { AppError } from "../errors";
import { runAction } from "../run";
import { getViewer } from "../session";
import { CITY_COOKIE, getCityBySlug } from "../services/cities";
import { setHomeCity } from "../services/profiles";

/** Choix de la ville : cookie pour tous, et ville principale du profil si connecté. */
export async function chooseCity(slug: string) {
  return runAction(async () => {
    const city = await getCityBySlug(slug);
    if (!city || !city.isActive) throw new AppError("NOT_FOUND", "Ville inconnue.");
    (await cookies()).set(CITY_COOKIE, city.slug, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
    const viewer = await getViewer();
    if (viewer) await setHomeCity(viewer.id, city.id);
    return { slug: city.slug, name: city.name };
  });
}
