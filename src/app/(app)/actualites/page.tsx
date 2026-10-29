import { Newspaper, PenLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Cover, DemoBadge, EmptyState, Page, PageHeader, TimeAgo } from "@/components/bits";
import { CityScopeLinks, ListPager } from "@/components/list-nav";
import { Button } from "@/components/ui/button";
import { listScope } from "@/server/list-scope";
import { getViewer } from "@/server/session";
import { searchNews } from "@/server/services/search";

export const metadata: Metadata = { title: "Actualités locales" };

export default async function NewsListPage({ searchParams }: PageProps<"/actualites">) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const { city, filters } = await listScope(sp, viewer);
  const { items, hasMore } = await searchNews(filters);
  const [lead, ...rest] = filters.page === 0 ? items : [undefined, ...items];
  return (
    <Page wide>
      <PageHeader
        title="Actualités locales"
        description={<CityScopeLinks base="/actualites" cityName={city?.name ?? null} citySlug={city?.slug ?? null} />}
        actions={
          viewer && viewer.role !== "user" ? (
            <Button asChild size="lg">
              <Link href="/actualites/nouvelle">
                <PenLine /> Rédiger
              </Link>
            </Button>
          ) : undefined
        }
        className="mb-8"
      />
      {!items.length ? (
        <EmptyState icon={Newspaper} title="Aucune actualité publiée">
          Les actualités sont publiées par les administrateurs locaux et les professionnels vérifiés.
        </EmptyState>
      ) : (
        <>
          {lead && (
            <Link href={`/actualites/${lead.slug}`} className="group grid gap-5 md:grid-cols-[1.3fr_1fr] md:items-center">
              <Cover src={lead.coverUrl} title={lead.title} kind="news" className="md:aspect-[16/9]" />
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                  {lead.isBrief ? "Brève" : lead.categoryName ?? "Actualité"} <DemoBadge show={lead.isDemo} />
                </p>
                <h2 className="mt-1 text-3xl font-extrabold group-hover:underline">{lead.title}</h2>
                <p className="mt-2 text-lg text-muted-foreground">{lead.summary}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {lead.sourceName ?? "Voisino"} · {lead.publishedAt && <TimeAgo date={lead.publishedAt} />}
                </p>
              </div>
            </Link>
          )}
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.filter(Boolean).map((n) => (
              <li key={n!.id}>
                <Link href={`/actualites/${n!.slug}`} className="group block">
                  <Cover src={n!.coverUrl} title={n!.title} kind="news" />
                  <p className="mt-3 text-sm font-semibold text-primary">{n!.isBrief ? "Brève" : n!.categoryName ?? "Actualité"}</p>
                  <h2 className="mt-0.5 text-lg font-bold group-hover:underline">{n!.title}</h2>
                  <p className="line-clamp-2 text-muted-foreground">{n!.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n!.cityName} · {n!.publishedAt && <TimeAgo date={n!.publishedAt} />}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <ListPager base="/actualites" params={sp} page={filters.page} hasMore={hasMore} />
    </Page>
  );
}
