/** Utilitaires de texte purs, utilisables côté client et serveur. */

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** #hashtags (lettres accentuées comprises), normalisés en minuscules, sans doublon. */
export function extractHashtags(text: string, max = 10) {
  const tags = [...text.matchAll(/(?:^|\s)#([\p{L}\p{N}_]{2,40})/gu)].map((m) => m[1]!.toLowerCase());
  return [...new Set(tags)].slice(0, max);
}

/** @mentions de pseudonymes. */
export function extractMentions(text: string, max = 10) {
  const names = [...text.matchAll(/(?:^|\s)@([a-z0-9_.]{3,30})/gi)].map((m) => m[1]!.toLowerCase());
  return [...new Set(names)].slice(0, max);
}

const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
export const formatCount = (n: number) => compact.format(n);

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
export function timeAgo(date: Date | string, now = Date.now()) {
  const s = Math.round((new Date(date).getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return "à l'instant";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** Formate une date dans le fuseau de la ville (et non celui du serveur). */
export function formatInZone(date: Date | string, timeZone: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, dateStyle: "full", timeStyle: "short", ...opts }).format(new Date(date));
}

/** Pseudonyme valide : 3 à 30 caractères, lettres minuscules, chiffres, point, tiret bas. */
export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

export function usernameFrom(seed: string) {
  const base = slugify(seed).replace(/-/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 20);
  return base.length >= 3 ? base : `voisin_${base}`;
}
