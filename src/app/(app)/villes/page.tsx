import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { Page, PageHeader } from "@/components/bits";
import { CityPickerDialog } from "@/components/city-picker";
import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { currentCity } from "@/server/current-city";
import { getViewer } from "@/server/session";
import { listCities } from "@/server/services/cities";

export const metadata: Metadata = { title: "Villes" };

export default async function CitiesPage() {
  const viewer = await getViewer();
  const [current, cities, stats] = await Promise.all([
    currentCity(viewer),
    listCities(),
    db.execute<{ city_id: string; videos: number; businesses: number; events: number }>(sql`
      select c.id as city_id,
        (select count(*)::int from videos v where v.city_id = c.id and v.status = 'published' and v.deleted_at is null) as videos,
        (select count(*)::int from businesses b where b.city_id = c.id and not b.is_hidden) as businesses,
        (select count(*)::int from events e where e.city_id = c.id and e.status = 'published' and e.ends_at >= now()) as events
      from cities c where c.is_active`),
  ]);
  const byId = new Map([...stats].map((s) => [s.city_id, s]));

  return (
    <Page wide>
      <PageHeader
        title="Villes Voisino"
        description={current ? `Votre ville : ${current.name}` : "Choisissez la ville que vous voulez suivre."}
        actions={
          <CityPickerDialog current={current?.slug ?? null}>
            <Button size="lg">
              <MapPin /> Changer de ville
            </Button>
          </CityPickerDialog>
        }
        className="mb-8"
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cities.map((c) => {
          const s = byId.get(c.id);
          return (
            <li key={c.id} className="rounded-2xl border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold">{c.name}</h2>
                  <p className="text-sm text-muted-foreground">{c.region}</p>
                </div>
                {current?.id === c.id && <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold">Votre ville</span>}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {s?.videos ?? 0} vidéos · {s?.businesses ?? 0} commerces · {s?.events ?? 0} événements à venir
              </p>
              <Link href={`/explorer?ville=${c.slug}`} className="mt-4 inline-block font-semibold text-primary underline-offset-4 hover:underline">
                Découvrir {c.name} →
              </Link>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
