import { CalendarDays, Hash, MapPin, Newspaper, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Cover, DemoBadge, EmptyState, EventDate, Page, Section, VerifiedBadge, VideoGrid } from "@/components/bits";
import { SearchBox, SearchResults } from "@/components/search-panel";
import { currentCity } from "@/server/current-city";
import { getViewer } from "@/server/session";
import { getCityBySlug, listCategories, listCities } from "@/server/services/cities";
import { popularVideos, searchBusinesses, searchEvents, searchNews, searchPlaces, trendingHashtags } from "@/server/services/search";
import { formatInZone } from "@/lib/text";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Explorer" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);

export default async function ExplorerPage({ searchParams }: PageProps<"/explorer">) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const home = await currentCity(viewer);
  const villeParam = str(sp.ville);
  const city = villeParam === "toutes" ? null : villeParam ? await getCityBySlug(villeParam) : home;
  const q = str(sp.q);
  const categorie = str(sp.categorie);
  const [cats, cities] = await Promise.all([listCategories(), listCities()]);
  const searching = Boolean(q || categorie || str(sp.type));

  const link = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    return `/explorer?${next}`;
  };
  const chip = (active: boolean) =>
    cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium", active ? "border-primary bg-brand-soft text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground");

  return (
    <Page wide>
      <h1 className="text-3xl font-extrabold md:text-4xl">Explorer</h1>
      <p className="mt-1 text-muted-foreground">{city ? `Ce qui se passe à ${city.name}` : "Toutes les villes Voisino"}</p>
      <div className="mt-5">
        <SearchBox citySlug={city?.slug ?? null} />
      </div>

      <nav aria-label="Filtrer par ville" className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={link({ ville: "toutes" })} className={chip(!city)} aria-current={!city ? "true" : undefined}>
          Toutes les villes
        </Link>
        {cities.map((c) => (
          <Link key={c.id} href={link({ ville: c.slug })} className={chip(city?.id === c.id)} aria-current={city?.id === c.id ? "true" : undefined}>
            <MapPin className="mr-1 inline size-3.5" aria-hidden="true" />
            {c.name}
          </Link>
        ))}
      </nav>
      <nav aria-label="Filtrer par catégorie" className="scrollbar-none -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={link({ categorie: null })} className={chip(!categorie)}>
          Toutes catégories
        </Link>
        {cats.map((c) => (
          <Link key={c.id} href={link({ categorie: c.slug })} className={chip(categorie === c.slug)} aria-current={categorie === c.slug ? "true" : undefined}>
            {c.name}
          </Link>
        ))}
      </nav>

      {searching ? (
        <SearchResults q={q ?? ""} citySlug={city?.slug ?? null} category={categorie} />
      ) : (
        <Discover cityId={city?.id ?? null} citySlug={city?.slug ?? null} viewerId={viewer?.id ?? null} />
      )}
    </Page>
  );
}

async function Discover({ cityId, citySlug, viewerId }: { cityId: string | null; citySlug: string | null; viewerId: string | null }) {
  const f = { q: "", cityId, categorySlug: null, viewerId, page: 0 };
  const [tags, popular, events, news, shops, places] = await Promise.all([
    trendingHashtags(cityId),
    popularVideos(cityId, viewerId),
    searchEvents(f),
    searchNews(f),
    searchBusinesses(f),
    searchPlaces(f),
  ]);
  const scope = citySlug ? `ville=${citySlug}` : "ville=toutes";
  return (
    <div className="mt-8">
      <Section title="Tendances de la semaine">
        {tags.length ? (
          <ul className="flex flex-wrap gap-2">
            {tags.map((t, i) => (
              <li key={t.tag}>
                <Link href={`/explorer?q=${encodeURIComponent(`#${t.tag}`)}&${scope}`} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-2 font-semibold hover:bg-brand-soft">
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                  <Hash className="size-4 text-primary" aria-hidden="true" />
                  {t.tag}
                  <span className="text-xs font-normal text-muted-foreground">
                    {t.uses} vidéo{t.uses > 1 ? "s" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Pas encore de tendance cette semaine.</p>
        )}
      </Section>

      <Section title="Vidéos populaires" href={`/explorer?type=videos&${scope}`}>
        <VideoGrid videos={popular} emptyLabel="Aucune vidéo populaire ce mois-ci. Soyez le premier à publier !" />
      </Section>

      <Section title="Événements à venir" href={`/evenements?${scope}`}>
        {events.items.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {events.items.slice(0, 4).map((e) => (
              <li key={e.id}>
                <Link href={`/evenements/${e.slug}`} className="flex gap-4 rounded-2xl border bg-card p-4 hover:bg-muted">
                  <EventDate startsAt={e.startsAt} timezone={e.timezone} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold">
                      {e.title} <DemoBadge show={e.isDemo} />
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {formatInZone(e.startsAt, e.timezone, { dateStyle: undefined, timeStyle: undefined, weekday: "long", hour: "2-digit", minute: "2-digit" })} ·{" "}
                      {e.venueName ?? e.cityName}
                    </span>
                    {e.going > 0 && (
                      <span className="text-sm text-accent">
                        {e.going} participant{e.going > 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={CalendarDays} title="Aucun événement à venir">
            Organisez une sortie, un atelier ou une fête de quartier.
          </EmptyState>
        )}
      </Section>

      <Section title="Actualités locales" href={`/actualites?${scope}`}>
        {news.items.length ? (
          <ul className="grid gap-4 sm:grid-cols-3">
            {news.items.slice(0, 3).map((n) => (
              <li key={n.id}>
                <Link href={`/actualites/${n.slug}`} className="block hover:opacity-90">
                  <Cover src={n.coverUrl} title={n.title} kind="news" />
                  <span className="mt-2 block font-semibold">{n.title}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{n.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Newspaper} title="Pas encore d'actualité" />
        )}
      </Section>

      <Section title="Commerces et professionnels" href={`/commerces?${scope}`}>
        {shops.items.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shops.items.slice(0, 6).map((s) => (
              <li key={s.id}>
                <Link href={`/commerces/${s.slug}`} className="flex items-center gap-3 rounded-2xl border bg-card p-3 hover:bg-muted">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft">
                    <Store className="size-6 text-primary" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{s.name}</span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      {s.categoryName} <VerifiedBadge status={s.verification} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Store} title="Aucun commerce référencé" />
        )}
      </Section>

      <Section title="Lieux à découvrir" href={`/explorer?type=lieux&${scope}`}>
        {places.items.length ? (
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {places.items.slice(0, 4).map((p) => (
              <li key={p.id}>
                <Link href={`/lieux/${p.slug}`} className="block hover:opacity-90">
                  <Cover src={p.coverUrl} title={p.name} kind="place" />
                  <span className="mt-1.5 block text-sm text-muted-foreground">
                    {p.videoCount} vidéo{p.videoCount > 1 ? "s" : ""} · {p.cityName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={MapPin} title="Aucun lieu pour le moment" />
        )}
      </Section>
    </div>
  );
}
