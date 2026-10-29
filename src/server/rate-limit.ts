import { AppError } from "./errors";

const hits = new Map<string, number[]>();

/**
 * Fenêtre glissante en mémoire.
 * shortcut: compteur local à une instance — passer à Redis/PostgreSQL dès qu'il y a plusieurs instances.
 */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    throw new AppError("RATE_LIMITED", "Vous allez un peu vite. Patientez quelques instants avant de réessayer.");
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 50_000) hits.clear(); // garde-fou mémoire
}

export const LIMITS = {
  comment: [10, 60_000],
  like: [60, 60_000],
  follow: [30, 60_000],
  report: [10, 3_600_000],
  upload: [10, 3_600_000],
  claim: [3, 86_400_000],
  generic: [30, 60_000],
} as const satisfies Record<string, readonly [number, number]>;

export function limit(kind: keyof typeof LIMITS, userId: string) {
  const [max, windowMs] = LIMITS[kind];
  rateLimit(`${kind}:${userId}`, max, windowMs);
}
