import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { platformSettings } from "../db/schema";

/** Paramètres généraux modifiables depuis l'administration, avec leurs valeurs par défaut. */
export const SETTINGS = {
  auto_hide_threshold: { label: "Masquage automatique après N signalements (0 = désactivé)", default: 5, type: "number" },
  signup_open: { label: "Inscriptions ouvertes", default: true, type: "boolean" },
  community_rules: {
    label: "Règles de la communauté (affichées sur /regles)",
    default:
      "Respectez vos voisins. Pas de harcèlement, de discours haineux, de contenus illégaux ni d'atteinte à la vie privée d'autrui. Ne filmez pas des personnes identifiables sans leur accord. Les contenus sponsorisés doivent être déclarés.",
    type: "text",
  },
} as const;
export type SettingKey = keyof typeof SETTINGS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTINGS)[K]["default"]> {
  const [row] = await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, key));
  return (row?.value ?? SETTINGS[key].default) as (typeof SETTINGS)[K]["default"];
}

export async function getAllSettings() {
  const rows = await db.select().from(platformSettings);
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  return (Object.keys(SETTINGS) as SettingKey[]).map((key) => ({ key, ...SETTINGS[key], value: stored.get(key) ?? SETTINGS[key].default }));
}

export async function putSetting(key: SettingKey, value: unknown) {
  await db.insert(platformSettings).values({ key, value }).onConflictDoUpdate({ target: platformSettings.key, set: { value } });
}
