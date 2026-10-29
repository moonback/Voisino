import "server-only";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../db";
import { auditLogs, businesses, categories, cityAdmins, events, hashtags, newsArticles, profiles, reports, user, videos } from "../db/schema";
import { AppError } from "../errors";
import { audit } from "../audit";
import { canAccessAdmin, canAdministerPlatform, canAssignRole, type Role, type Viewer } from "../permissions";
import { slugify } from "@/lib/text";
import { isUniqueViolation } from "./profiles";
import { putSetting, SETTINGS, type SettingKey } from "./settings";
import { hydrateVideos } from "./videos";

function assertAdmin(viewer: Viewer) {
  if (!canAccessAdmin(viewer)) throw new AppError("FORBIDDEN", "Accès réservé à l'administration.");
}
function assertPlatformAdmin(viewer: Viewer) {
  if (!canAdministerPlatform(viewer)) throw new AppError("FORBIDDEN", "Réservé aux administrateurs globaux.");
}

/** Périmètre ville : un administrateur local ne voit que ses villes. */
const cityScope = (viewer: Viewer, col: AnyPgColumn) =>
  viewer.role === "local_admin" ? (viewer.adminCityIds.length ? sql`${col} in ${viewer.adminCityIds}` : sql`false`) : sql`true`;

export async function overview(viewer: Viewer) {
  assertAdmin(viewer);
  const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [users, newUsers, publishedVideos, openReports, verifiedBusinesses, upcomingEvents, publishedNews] = await Promise.all([
    one(db.select({ n: count() }).from(user)),
    one(db.select({ n: count() }).from(user).where(sql`${user.createdAt} > now() - interval '7 days'`)),
    one(db.select({ n: count() }).from(videos).where(and(eq(videos.status, "published"), cityScope(viewer, videos.cityId)))),
    one(db.select({ n: count() }).from(reports).where(and(eq(reports.status, "open"), cityScope(viewer, reports.cityId)))),
    one(db.select({ n: count() }).from(businesses).where(and(eq(businesses.verification, "verified"), cityScope(viewer, businesses.cityId)))),
    one(db.select({ n: count() }).from(events).where(and(sql`${events.endsAt} >= now()`, eq(events.status, "published"), cityScope(viewer, events.cityId)))),
    one(db.select({ n: count() }).from(newsArticles).where(and(eq(newsArticles.status, "published"), cityScope(viewer, newsArticles.cityId)))),
  ]);
  const growth = await db.execute<{ day: string; signups: number; uploads: number }>(sql`
    select to_char(d, 'YYYY-MM-DD') as day,
      (select count(*)::int from "user" u where u.created_at::date = d) as signups,
      (select count(*)::int from videos v where v.created_at::date = d) as uploads
    from generate_series(current_date - 29, current_date, interval '1 day') d order by d`);
  return { users, newUsers, publishedVideos, openReports, verifiedBusinesses, upcomingEvents, publishedNews, growth: [...growth] };
}

export async function listUsers(viewer: Viewer, q = "", page = 0, pageSize = 25) {
  assertAdmin(viewer);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      status: user.status,
      isDemo: user.isDemo,
      createdAt: user.createdAt,
      username: profiles.username,
      cityIds: sql<string[]>`coalesce((select array_agg(ca.city_id) from city_admins ca where ca.user_id = ${user.id}), '{}')`,
    })
    .from(user)
    .innerJoin(profiles, eq(profiles.userId, user.id))
    .where(q ? or(ilike(user.name, like), ilike(user.email, like), ilike(profiles.username, like)) : sql`true`)
    .orderBy(desc(user.createdAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  // Les e-mails ne sont visibles que des administrateurs globaux (minimisation des données).
  const items = rows.slice(0, pageSize).map((r) => (canAdministerPlatform(viewer) ? r : { ...r, email: "—" }));
  return { items, hasMore: rows.length > pageSize };
}

export async function setUserRole(viewer: Viewer, userId: string, role: Role, cityIds: string[] = []) {
  if (!canAssignRole(viewer, userId)) throw new AppError("FORBIDDEN", "Seul un administrateur global peut modifier les rôles (et jamais le sien).");
  if (role === "local_admin" && !cityIds.length) throw new AppError("VALIDATION", "Choisissez au moins une ville pour un administrateur local.");
  await db.transaction(async (tx) => {
    const res = await tx.update(user).set({ role }).where(eq(user.id, userId)).returning({ id: user.id });
    if (!res.length) throw new AppError("NOT_FOUND", "Utilisateur introuvable.");
    await tx.delete(cityAdmins).where(eq(cityAdmins.userId, userId));
    if (role === "local_admin") await tx.insert(cityAdmins).values(cityIds.map((cityId) => ({ cityId, userId })));
    await audit({ actorId: viewer.id, action: "user.role", entityType: "user", entityId: userId, metadata: { role, cityIds } }, tx);
  });
}

export async function listVideosAdmin(viewer: Viewer, status: string | null, page = 0, pageSize = 24) {
  assertAdmin(viewer);
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(cityScope(viewer, videos.cityId), status ? sql`${videos.status} = ${status}` : sql`${videos.deletedAt} is null`))
    .orderBy(desc(videos.createdAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  return { items: await hydrateVideos(rows.slice(0, pageSize).map((r) => r.id), viewer.id), hasMore: rows.length > pageSize };
}

export async function listContent(viewer: Viewer, kind: "businesses" | "events" | "news", page = 0, pageSize = 30) {
  assertAdmin(viewer);
  if (kind === "businesses") {
    const rows = await db
      .select({ id: businesses.id, title: businesses.name, slug: businesses.slug, state: businesses.verification, hidden: businesses.isHidden, createdAt: businesses.createdAt })
      .from(businesses)
      .where(cityScope(viewer, businesses.cityId))
      .orderBy(sql`${businesses.verification} = 'pending' desc`, desc(businesses.createdAt))
      .limit(pageSize)
      .offset(page * pageSize);
    return rows.map((r) => ({ ...r, href: `/commerces/${r.slug}`, state: r.hidden ? "masqué" : r.state }));
  }
  if (kind === "events") {
    const rows = await db
      .select({ id: events.id, title: events.title, slug: events.slug, state: events.status, createdAt: events.startsAt })
      .from(events)
      .where(cityScope(viewer, events.cityId))
      .orderBy(desc(events.startsAt))
      .limit(pageSize)
      .offset(page * pageSize);
    return rows.map((r) => ({ ...r, href: `/evenements/${r.slug}` }));
  }
  const rows = await db
    .select({ id: newsArticles.id, title: newsArticles.title, slug: newsArticles.slug, state: newsArticles.status, createdAt: newsArticles.createdAt })
    .from(newsArticles)
    .where(cityScope(viewer, newsArticles.cityId))
    .orderBy(desc(newsArticles.createdAt))
    .limit(pageSize)
    .offset(page * pageSize);
  return rows.map((r) => ({ ...r, href: `/actualites/${r.slug}` }));
}

export async function listAllCategories(viewer: Viewer) {
  assertAdmin(viewer);
  return db.select().from(categories).orderBy(categories.sortOrder, categories.name);
}

export async function saveCategory(viewer: Viewer, input: { id?: string; name: string; icon: string; sortOrder: number; isActive: boolean }) {
  assertPlatformAdmin(viewer);
  const name = input.name.trim();
  if (name.length < 2) throw new AppError("VALIDATION", "Nom trop court.");
  try {
    if (input.id) {
      await db.update(categories).set({ name, icon: input.icon, sortOrder: input.sortOrder, isActive: input.isActive }).where(eq(categories.id, input.id));
    } else {
      await db.insert(categories).values({ name, slug: slugify(name), icon: input.icon || "sparkles", sortOrder: input.sortOrder, isActive: input.isActive });
    }
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "Cette catégorie existe déjà.");
    throw e;
  }
  await audit({ actorId: viewer.id, action: input.id ? "category.update" : "category.create", entityType: "category", entityId: input.id ?? name });
}

export async function listHashtags(viewer: Viewer, q = "") {
  assertAdmin(viewer);
  return db
    .select({
      id: hashtags.id,
      tag: hashtags.tag,
      isBlocked: hashtags.isBlocked,
      uses: sql<number>`(select count(*) from video_hashtags vh where vh.hashtag_id = ${hashtags.id})`.mapWith(Number),
    })
    .from(hashtags)
    .where(q ? ilike(hashtags.tag, `%${q.replace(/^#/, "")}%`) : sql`true`)
    .orderBy(sql`4 desc`)
    .limit(100);
}

export async function setHashtagBlocked(viewer: Viewer, id: string, blocked: boolean) {
  assertAdmin(viewer);
  await db.update(hashtags).set({ isBlocked: blocked }).where(eq(hashtags.id, id));
  await audit({ actorId: viewer.id, action: blocked ? "hashtag.block" : "hashtag.unblock", entityType: "hashtag", entityId: id });
}

export async function updateSetting(viewer: Viewer, key: SettingKey, raw: string) {
  assertPlatformAdmin(viewer);
  const def = SETTINGS[key];
  if (!def) throw new AppError("VALIDATION", "Paramètre inconnu.");
  const value = def.type === "number" ? Number(raw) : def.type === "boolean" ? raw === "true" : raw.slice(0, 5000);
  if (def.type === "number" && (!Number.isInteger(value) || (value as number) < 0)) throw new AppError("VALIDATION", "Nombre entier positif attendu.");
  await putSetting(key, value);
  await audit({ actorId: viewer.id, action: "settings.update", entityType: "setting", entityId: key });
}

export async function listAudit(viewer: Viewer, page = 0, pageSize = 50) {
  assertPlatformAdmin(viewer);
  const rows = await db
    .select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actor: profiles.username })
    .from(auditLogs)
    .leftJoin(profiles, eq(profiles.userId, auditLogs.actorId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}
