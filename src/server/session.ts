import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";
import { cityAdmins, profiles, user } from "./db/schema";
import { AppError } from "./errors";
import { canContribute, type Viewer } from "./permissions";

/** Charge l'utilisateur courant depuis la base (rôle et statut toujours à jour). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      role: user.role,
      status: user.status,
      username: profiles.username,
      cityId: profiles.cityId,
    })
    .from(user)
    .innerJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(user.id, s.user.id));
  if (!row || row.status === "suspended") return null;
  const adminCityIds =
    row.role === "local_admin"
      ? (await db.select({ id: cityAdmins.cityId }).from(cityAdmins).where(eq(cityAdmins.userId, row.id))).map((c) => c.id)
      : [];
  return { ...row, adminCityIds };
});

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new AppError("UNAUTHENTICATED", "Connectez-vous pour continuer.");
  return v;
}

/** Utilisateur pouvant publier : actif et e-mail vérifié. */
export async function requireContributor(): Promise<Viewer> {
  const v = await requireViewer();
  if (v.status === "restricted") throw new AppError("FORBIDDEN", "Votre compte est restreint : la publication est suspendue.");
  if (!canContribute(v)) throw new AppError("FORBIDDEN", "Confirmez votre adresse e-mail pour publier.");
  return v;
}

/** Pour les pages : redirige vers la connexion si nécessaire. */
export async function requireViewerPage(next: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/connexion?suite=${encodeURIComponent(next)}`);
  return v;
}
