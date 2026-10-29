/**
 * Matrice des rôles et permissions — source unique de vérité, appliquée côté serveur.
 * Fonctions pures : testées dans tests/unit/permissions.test.ts.
 */
export type Role = "user" | "pro" | "moderator" | "local_admin" | "global_admin";
export type AccountStatus = "active" | "restricted" | "suspended";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: Role;
  status: AccountStatus;
  username: string;
  cityId: string | null;
  /** Villes administrées (administrateurs locaux uniquement). */
  adminCityIds: string[];
};

export const ROLE_LABELS: Record<Role, string> = {
  user: "Utilisateur",
  pro: "Compte professionnel",
  moderator: "Modérateur",
  local_admin: "Administrateur local",
  global_admin: "Administrateur global",
};

const RANK: Record<Role, number> = { user: 0, pro: 1, moderator: 2, local_admin: 3, global_admin: 4 };
export const atLeast = (v: Pick<Viewer, "role">, role: Role) => RANK[v.role] >= RANK[role];

/** Peut publier du contenu (vidéo, commentaire, événement) : compte actif et e-mail vérifié. */
export const canContribute = (v: Viewer) => v.status === "active" && v.emailVerified;

/** Accès à la file de modération. */
export const canModerate = (v: Viewer) => v.status === "active" && atLeast(v, "moderator");

/** Accès à l'espace d'administration (vue limitée à la modération pour les modérateurs). */
export const canAccessAdmin = canModerate;

/** Peut agir sur un contenu rattaché à une ville donnée. */
export function canModerateCity(v: Viewer, cityId: string | null) {
  if (!canModerate(v)) return false;
  if (v.role === "global_admin" || v.role === "moderator") return true; // modérateurs : périmètre global
  return v.role === "local_admin" && cityId !== null && v.adminCityIds.includes(cityId);
}

/** Gestion d'une ville (paramètres, zones). */
export const canManageCity = (v: Viewer, cityId: string) =>
  v.status === "active" && (v.role === "global_admin" || (v.role === "local_admin" && v.adminCityIds.includes(cityId)));

/** Création de villes, rôles, paramètres généraux : administrateurs globaux uniquement. */
export const canAdministerPlatform = (v: Viewer) => v.status === "active" && v.role === "global_admin";

/** Publication d'actualités : professionnels (pour leur commerce) et administrateurs de la ville. */
export const canPublishNews = (v: Viewer, cityId: string, isBusinessMember: boolean) =>
  canContribute(v) && (canManageCity(v, cityId) || (v.role === "pro" && isBusinessMember));

/** Un rôle ne peut être attribué que par un administrateur global, jamais à soi-même. */
export const canAssignRole = (v: Viewer, targetUserId: string) => canAdministerPlatform(v) && v.id !== targetUserId;
