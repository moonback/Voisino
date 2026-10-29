import { CalendarDays, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge, EmptyState, EventDate, Page, PageHeader } from "@/components/bits";
import { CityScopeLinks, ListPager } from "@/components/list-nav";
import { Button } from "@/components/ui/button";
import { listScope } from "@/server/list-scope";
import { getViewer } from "@/server/session";
import { searchEvents } from "@/server/services/search";
import { formatInZone } from "@/lib/text";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Événements et sorties" };

export default async function EventsPage({ searchParams }: PageProps<"/evenements">) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const { city, filters } = await listScope(sp, viewer);
  const past = sp.passes === "1";
  const { items, hasMore } = await searchEvents(filters, past);
  const tab = (active: boolean) => cn("rounded-full px-4 py-2 text-sm font-semibold", active ? "bg-foreground text-background" : "border hover:bg-muted");
  const scope = city ? `ville=${city.slug}` : "ville=toutes";
  return (
    <Page wide>
      <PageHeader
        title="Événements et sorties"
        description={<CityScopeLinks base="/evenements" cityName={city?.name ?? null} citySlug={city?.slug ?? null} />}
        actions={
          <Button asChild size="lg">
            <Link href="/evenements/nouveau">
              <Plus /> Créer un événement
            </Link>
          </Button>
        }
        className="mb-6"
      />
      <nav aria-label="Période" className="mb-6 flex gap-2">
        <Link href={`/evenements?${scope}`} className={tab(!past)} aria-current={!past ? "page" : undefined}>
          À venir
        </Link>
        <Link href={`/evenements?${scope}&passes=1`} className={tab(past)} aria-current={past ? "page" : undefined}>
          Passés
        </Link>
      </nav>
      {!items.length ? (
        <EmptyState icon={CalendarDays} title={past ? "Aucun événement passé" : "Aucun événement à venir"} action={<Button asChild><Link href="/evenements/nouveau">Proposer un événement</Link></Button>} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((e) => (
            <li key={e.id}>
              <Link href={`/evenements/${e.slug}`} className={cn("flex gap-4 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted", e.status === "cancelled" && "opacity-70")}>
                <EventDate startsAt={e.startsAt} timezone={e.timezone} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-lg font-bold">
                    {e.title} <DemoBadge show={e.isDemo} />
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {formatInZone(e.startsAt, e.timezone, { dateStyle: "full", timeStyle: "short" })}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {[e.venueName, e.cityName, e.categoryName].filter(Boolean).join(" · ")}
                  </span>
                  {e.status === "cancelled" ? (
                    <span className="text-sm font-semibold text-destructive">Annulé</span>
                  ) : (
                    e.going > 0 && (
                      <span className="text-sm font-medium text-accent">
                        {e.going} participant{e.going > 1 ? "s" : ""}
                      </span>
                    )
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ListPager base="/evenements" params={sp} page={filters.page} hasMore={hasMore} />
    </Page>
  );
}
