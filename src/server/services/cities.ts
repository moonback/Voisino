import "server-only";
import { asc, eq, ilike, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db";
import { categories, cities, zones } from "../db/schema";
import { AppError } from "../errors";
import { canAdministerPlatform, canManageCity, type Viewer } from "../permissions";
import { audit } from "../audit";
import { citySchema } from "@/lib/validation";
import { slugify } from "@/lib/text";
import { isUniqueViolation } from "./profiles";

export const CITY_COOKIE = "voisino_ville";

const publicCity = {
  id: cities.id,
  slug: cities.slug,
  name: cities.name,
  region: cities.region,
  timezone: cities.timezone,
  description: cities.description,
  lat: sql<number>`st_y(${cities.center})`,
  lng: sql<number>`st_x(${cities.center})`,
  radiusKm: cities.radiusKm,
  isActive: cities.isActive,
};
export type City = { id: string; slug: string; name: string; region: string | null; timezone: string; description: string | null; lat: number; lng: number; radiusKm: number; isActive: boolean };

export async function listCities(query = "", includeInactive = false): Promise<City[]> {
  const q = query.trim();
  return db
    .select(publicCity)
    .from(cities)
    .where(
      sql`${includeInactive ? sql`true` : eq(cities.isActive, true)} and ${q ? or(ilike(cities.name, `%${q}%`), ilike(cities.region, `%${q}%`)) : sql`true`}`,
    )
    .orderBy(asc(cities.name))
    .limit(100);
}

export async function getCityBySlug(slug: string): Promise<City | null> {
  const [c] = await db.select(publicCity).from(cities).where(eq(cities.slug, slug));
  return c ?? null;
}

export async function getCityById(id: string): Promise<City | null> {
  const [c] = await db.select(publicCity).from(cities).where(eq(cities.id, id));
  return c ?? null;
}

/**
 * Ville active la plus proche d'une position. La position n'est ni stockée ni journalisée :
 * elle sert uniquement à proposer une ville.
 */
export async function nearestCity(lat: number, lng: number) {
  const [c] = await db
    .select({ ...publicCity, distanceKm: sql<number>`st_distance(${cities.center}::geography, st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography) / 1000` })
    .from(cities)
    .where(eq(cities.isActive, true))
    .orderBy(sql`${cities.center} <-> st_setsrid(st_makepoint(${lng}, ${lat}), 4326)`)
    .limit(1);
  return c ?? null;
}

export async function listZones(cityId: string) {
  return db.select({ id: zones.id, name: zones.name, slug: zones.slug }).from(zones).where(eq(zones.cityId, cityId)).orderBy(asc(zones.name));
}

export async function listCategories() {
  return db
    .select({ id: categories.id, slug: categories.slug, name: categories.name, icon: categories.icon })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function saveCity(viewer: Viewer, input: z.input<typeof citySchema>, id?: string) {
  const d = citySchema.parse(input);
  if (id ? !canManageCity(viewer, id) : !canAdministerPlatform(viewer)) {
    throw new AppError("FORBIDDEN", "Vous ne pouvez pas gérer cette ville.");
  }
  const values = {
    name: d.name,
    slug: d.slug,
    region: d.region || null,
    timezone: d.timezone,
    center: { x: d.lng, y: d.lat },
    radiusKm: d.radiusKm,
    description: d.description || null,
    isActive: d.isActive,
  };
  try {
    const [row] = id
      ? await db.update(cities).set(values).where(eq(cities.id, id)).returning({ id: cities.id })
      : await db.insert(cities).values(values).returning({ id: cities.id });
    if (!row) throw new AppError("NOT_FOUND", "Ville introuvable.");
    await audit({ actorId: viewer.id, action: id ? "city.update" : "city.create", entityType: "city", entityId: row.id, metadata: { slug: d.slug } });
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "Cet identifiant de ville existe déjà.");
    throw e;
  }
}

export async function addZone(viewer: Viewer, cityId: string, name: string) {
  if (!canManageCity(viewer, cityId)) throw new AppError("FORBIDDEN", "Vous ne pouvez pas gérer cette ville.");
  const clean = name.trim();
  if (clean.length < 2) throw new AppError("VALIDATION", "Nom de zone trop court.");
  try {
    await db.insert(zones).values({ cityId, name: clean, slug: slugify(clean) });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "Cette zone existe déjà.");
    throw e;
  }
}
