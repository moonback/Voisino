import { z } from "zod";
import { USERNAME_RE } from "./text";

/** Schémas partagés : validés dans le navigateur (retour immédiat) ET revalidés sur le serveur. */

const uuid = z.uuid("Identifiant invalide");
const optionalUuid = z.union([uuid, z.literal("")]).optional().transform((v) => v || null);
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "Adresse web invalide (http:// ou https://)")
  .transform((v) => v || null);

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Au moins 2 caractères").max(50, "50 caractères maximum"),
  email: z.email("Adresse e-mail invalide").trim().toLowerCase(),
  password: z.string().min(10, "Au moins 10 caractères").max(128),
  terms: z.literal(true, { error: "Vous devez accepter les conditions d'utilisation" }),
});

export const signInSchema = z.object({
  email: z.email("Adresse e-mail invalide").trim().toLowerCase(),
  password: z.string().min(1, "Mot de passe requis"),
});

export const forgotSchema = z.object({ email: z.email("Adresse e-mail invalide").trim().toLowerCase() });
export const resetSchema = z
  .object({ password: z.string().min(10, "Au moins 10 caractères").max(128), confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] });

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Au moins 2 caractères").max(50),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, "3 à 30 caractères : lettres minuscules, chiffres, point ou tiret bas"),
  bio: z.string().trim().max(300, "300 caractères maximum").default(""),
  imageAssetId: optionalUuid,
});

export const privacySchema = z.object({
  isPrivate: z.boolean(),
  allowComments: z.boolean(),
});

export const VISIBILITIES = [
  { value: "public", label: "Public", hint: "Visible par tout le monde dans votre ville" },
  { value: "followers", label: "Abonnés", hint: "Visible uniquement par vos abonnés" },
  { value: "private", label: "Privé", hint: "Visible uniquement par vous" },
] as const;

export const videoSchema = z.object({
  assetId: uuid,
  caption: z.string().trim().max(500, "500 caractères maximum").default(""),
  cityId: uuid,
  zoneId: optionalUuid,
  categoryId: optionalUuid,
  businessId: optionalUuid,
  eventId: optionalUuid,
  placeId: optionalUuid,
  visibility: z.enum(["public", "followers", "private"]),
  allowComments: z.boolean().default(true),
  hashtags: z.array(z.string()).max(10).default([]),
  /** Position approximative, uniquement si l'utilisateur l'a explicitement partagée. */
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().default(null),
});

export const videoUpdateSchema = z.object({
  caption: z.string().trim().max(500).default(""),
  visibility: z.enum(["public", "followers", "private"]),
  allowComments: z.boolean(),
  categoryId: optionalUuid,
});

export const commentSchema = z.object({
  videoId: uuid,
  parentId: optionalUuid,
  body: z.string().trim().min(1, "Le commentaire est vide").max(1000, "1 000 caractères maximum"),
});

export const REPORT_REASONS = [
  { value: "spam", label: "Spam ou arnaque" },
  { value: "harassment", label: "Harcèlement ou intimidation" },
  { value: "hate", label: "Discours haineux" },
  { value: "violence", label: "Violence ou menace" },
  { value: "sexual", label: "Contenu sexuel" },
  { value: "illegal", label: "Activité illégale" },
  { value: "misinformation", label: "Fausse information" },
  { value: "impersonation", label: "Usurpation d'identité" },
  { value: "privacy", label: "Atteinte à la vie privée" },
  { value: "other", label: "Autre" },
] as const;

export const reportSchema = z.object({
  targetType: z.enum(["video", "comment", "user", "business", "event", "news"]),
  targetId: uuid,
  reason: z.enum(REPORT_REASONS.map((r) => r.value) as [string, ...string[]]),
  details: z.string().trim().max(1000).optional().transform((v) => v || null),
});

export const claimSchema = z.object({
  businessId: uuid,
  message: z.string().trim().min(20, "Présentez votre lien avec ce commerce (20 caractères minimum)").max(1000),
  proof: z.string().trim().min(5, "Indiquez un justificatif vérifiable (SIRET, site officiel…)").max(500),
});

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  mon: "Lundi",
  tue: "Mardi",
  wed: "Mercredi",
  thu: "Jeudi",
  fri: "Vendredi",
  sat: "Samedi",
  sun: "Dimanche",
};

export const businessSchema = z.object({
  name: z.string().trim().min(2).max(80),
  cityId: uuid,
  categoryId: optionalUuid,
  description: z.string().trim().max(2000).default(""),
  address: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(30).default(""),
  email: z.union([z.email("E-mail invalide"), z.literal("")]).default(""),
  website: httpUrl,
  hours: z.partialRecord(z.enum(DAY_KEYS), z.string().trim().max(60)).default({}),
});

export const eventSchema = z
  .object({
    title: z.string().trim().min(3, "Au moins 3 caractères").max(120),
    description: z.string().trim().min(10, "Décrivez l'événement (10 caractères minimum)").max(4000),
    cityId: uuid,
    categoryId: optionalUuid,
    businessId: optionalUuid,
    venueName: z.string().trim().max(120).default(""),
    address: z.string().trim().max(200).default(""),
    /** Date et heure locales de la ville, format « AAAA-MM-JJTHH:mm ». */
    startsAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Date de début invalide"),
    endsAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Date de fin invalide"),
    conditions: z.string().trim().max(500).default(""),
    externalUrl: httpUrl,
    capacity: z.coerce.number().int().positive().max(100000).nullable().default(null),
    coverAssetId: optionalUuid,
  })
  .refine((d) => d.endsAtLocal >= d.startsAtLocal, { message: "La fin doit suivre le début", path: ["endsAtLocal"] });

export const newsSchema = z.object({
  title: z.string().trim().min(5).max(160),
  summary: z.string().trim().min(10).max(300),
  body: z.string().trim().min(20).max(20000),
  cityId: uuid,
  categoryId: optionalUuid,
  businessId: optionalUuid,
  sourceName: z.string().trim().max(120).default(""),
  isBrief: z.boolean().default(false),
  status: z.enum(["draft", "published"]),
  coverAssetId: optionalUuid,
});

export const citySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, "Minuscules, chiffres et tirets"),
  region: z.string().trim().max(80).default(""),
  timezone: z.string().trim().min(3).default("Europe/Paris"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().int().min(1).max(200).default(15),
  description: z.string().trim().max(500).default(""),
  isActive: z.boolean().default(true),
});
