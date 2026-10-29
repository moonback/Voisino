/**
 * Classement du flux — fonctions pures, testées dans tests/unit/ranking.test.ts.
 * Chaque signal est borné et lisible : on peut ajuster un poids sans réécrire le reste.
 */
export type Candidate = {
  id: string;
  authorId: string;
  categoryId: string | null;
  publishedAt: Date;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  /** Nombre de vidéos publiées par l'auteur : favorise les nouveaux créateurs. */
  authorVideoCount: number;
  openReports: number;
  /** Nombre de fois où ce lecteur a déjà vu la vidéo. */
  seenCount: number;
  followsAuthor: boolean;
  followsCategory: boolean;
  /** J'aime récents du lecteur dans cette catégorie. */
  categoryAffinity: number;
};

export const WEIGHTS = {
  freshness: 1.2,
  quality: 0.8,
  popularity: 0.4,
  followsAuthor: 0.9,
  followsCategory: 0.5,
  affinity: 0.3,
  newCreator: 0.35,
  seen: -0.7,
  reports: -0.6,
} as const;

const HALF_LIFE_HOURS = 36;

export function scoreBreakdown(c: Candidate, now: Date) {
  const ageHours = Math.max(0, (now.getTime() - c.publishedAt.getTime()) / 3_600_000);
  const engagement = c.likeCount + 2 * c.commentCount + 3 * c.shareCount;
  return {
    freshness: Math.pow(0.5, ageHours / HALF_LIFE_HOURS),
    // Taux d'engagement lissé : une vidéo peu vue n'est ni favorisée ni pénalisée.
    quality: Math.min(1, ((engagement + 1) / (c.viewCount + 20)) * 4),
    popularity: Math.min(1, Math.log1p(engagement) / 6),
    followsAuthor: c.followsAuthor ? 1 : 0,
    followsCategory: c.followsCategory ? 1 : 0,
    affinity: Math.min(1, c.categoryAffinity / 5),
    newCreator: c.authorVideoCount <= 3 ? 1 : 0,
    seen: Math.min(3, c.seenCount),
    reports: Math.min(3, c.openReports),
  };
}

export function score(c: Candidate, now: Date) {
  const b = scoreBreakdown(c, now);
  return (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce((sum, k) => sum + WEIGHTS[k] * b[k], 0);
}

/**
 * Sélection gloutonne avec diversité : chaque vidéo déjà retenue d'un même auteur
 * divise le score par deux, et une même catégorie consécutive est pénalisée.
 */
export function rankWithDiversity(candidates: Candidate[], now: Date, limit: number): Candidate[] {
  const pool = candidates.map((c) => ({ c, s: score(c, now) }));
  const picked: Candidate[] = [];
  const perAuthor = new Map<string, number>();
  while (picked.length < limit && pool.length) {
    let bestIdx = 0;
    let best = -Infinity;
    const prevCategory = picked.at(-1)?.categoryId ?? null;
    pool.forEach(({ c, s }, i) => {
      let adjusted = s * Math.pow(0.5, perAuthor.get(c.authorId) ?? 0);
      if (prevCategory && c.categoryId === prevCategory) adjusted -= 0.15;
      if (adjusted > best) {
        best = adjusted;
        bestIdx = i;
      }
    });
    const [{ c }] = pool.splice(bestIdx, 1) as [{ c: Candidate; s: number }];
    picked.push(c);
    perAuthor.set(c.authorId, (perAuthor.get(c.authorId) ?? 0) + 1);
  }
  return picked;
}
