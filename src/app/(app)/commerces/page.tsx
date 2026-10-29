import { Plus, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge, EmptyState, Page, PageHeader, VerifiedBadge } from "@/components/bits";
import { CityScopeLinks, ListPager } from "@/components/list-nav";
import { Button } from "@/components/ui/button";
import { listScope } from "@/server/list-scope";
import { getViewer } from "@/server/session";
import { searchBusinesses } from "@/server/services/search";

export const metadata: Metadata = { title: "Commerces et professionnels" };

export default async function BusinessesPage({ searchParams }: PageProps<"/commerces">) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const { city, filters } = await listScope(sp, viewer);
  const { items, hasMore } = await searchBusinesses(filters);
  return (
    <Page wide>
      <PageHeader
        title="Commerces et pros"
        description={<CityScopeLinks base="/commerces" cityName={city?.name ?? null} citySlug={city?.slug ?? null} />}
        actions={
          <Button asChild size="lg" variant="outline">
            <Link href="/commerces/nouveau">
              <Plus /> Référencer mon commerce
            </Link>
          </Button>
        }
        className="mb-8"
      />
      {!items.length ? (
        <EmptyState icon={Store} title="Aucun commerce référencé ici">
          Vous tenez un commerce ? Créez sa fiche gratuitement.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((b) => (
            <li key={b.id}>
              <Link href={`/commerces/${b.slug}`} className="flex h-full flex-col rounded-2xl border bg-card p-5 transition-colors hover:bg-muted">
                <span className="flex items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft">
                    <Store className="size-6 text-primary" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold">{b.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {b.categoryName ?? "Commerce"} · {b.cityName}
                    </span>
                  </span>
                </span>
                <span className="mt-3 line-clamp-2 flex-1 text-sm text-muted-foreground">{b.description}</span>
                <span className="mt-3 flex items-center gap-2">
                  <VerifiedBadge status={b.verification} />
                  {b.verification === "pending" && <span className="text-xs text-muted-foreground">Vérification en cours</span>}
                  <DemoBadge show={b.isDemo} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ListPager base="/commerces" params={sp} page={filters.page} hasMore={hasMore} />
    </Page>
  );
}
