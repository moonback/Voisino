import Link from "next/link";

/** Pagination par liens (préserve les autres paramètres). */
export function ListPager({ base, params, page, hasMore }: { base: string; params: Record<string, string | string[] | undefined>; page: number; hasMore: boolean }) {
  if (!hasMore && page === 0) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    sp.set("page", String(p));
    return `${base}?${sp}`;
  };
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between">
      {page > 0 ? (
        <Link href={href(page - 1)} className="rounded-xl border px-4 py-2 font-semibold hover:bg-muted">
          ← Précédent
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">Page {page + 1}</span>
      {hasMore ? (
        <Link href={href(page + 1)} className="rounded-xl border px-4 py-2 font-semibold hover:bg-muted">
          Suivant →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function CityScopeLinks({ base, cityName, citySlug }: { base: string; cityName: string | null; citySlug: string | null }) {
  return (
    <p className="text-sm text-muted-foreground">
      {cityName ? (
        <>
          À {cityName} ·{" "}
          <Link href={`${base}?ville=toutes`} className="font-semibold text-primary underline-offset-4 hover:underline">
            voir toutes les villes
          </Link>
        </>
      ) : (
        <>
          Toutes les villes
          {citySlug === null && (
            <>
              {" "}
              ·{" "}
              <Link href={base} className="font-semibold text-primary underline-offset-4 hover:underline">
                revenir à ma ville
              </Link>
            </>
          )}
        </>
      )}
    </p>
  );
}
