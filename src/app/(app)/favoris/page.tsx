import { Bookmark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { EmptyState, EventDate, Page, PageHeader, Section, VideoGrid } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { bookmarks, cities, events, newsArticles } from "@/server/db/schema";
import { requireViewerPage } from "@/server/session";
import { listSavedVideos } from "@/server/services/videos";

export const metadata: Metadata = { title: "Favoris" };

/** Favoris privés : visibles uniquement par leur propriétaire. */
export default async function SavedPage() {
  const viewer = await requireViewerPage("/favoris");
  const [videos, savedEvents, savedNews] = await Promise.all([
    listSavedVideos(viewer, 0, 48),
    db
      .select({ slug: events.slug, title: events.title, startsAt: events.startsAt, timezone: cities.timezone })
      .from(bookmarks)
      .innerJoin(events, eq(events.id, bookmarks.eventId))
      .innerJoin(cities, eq(cities.id, events.cityId))
      .where(and(eq(bookmarks.userId, viewer.id), isNotNull(bookmarks.eventId)))
      .orderBy(desc(bookmarks.createdAt)),
    db
      .select({ slug: newsArticles.slug, title: newsArticles.title, summary: newsArticles.summary })
      .from(bookmarks)
      .innerJoin(newsArticles, eq(newsArticles.id, bookmarks.newsId))
      .where(and(eq(bookmarks.userId, viewer.id), eq(newsArticles.status, "published")))
      .orderBy(desc(bookmarks.createdAt)),
  ]);
  const empty = !videos.items.length && !savedEvents.length && !savedNews.length;

  return (
    <Page wide>
      <PageHeader title="Favoris" description="Visibles uniquement par vous." className="mb-8" />
      {empty ? (
        <EmptyState icon={Bookmark} title="Aucun favori pour l'instant" action={<Button asChild><Link href="/">Parcourir le flux</Link></Button>}>
          Enregistrez des vidéos, événements et actualités pour les retrouver ici.
        </EmptyState>
      ) : (
        <>
          {videos.items.length > 0 && (
            <Section title="Vidéos">
              <VideoGrid videos={videos.items} />
            </Section>
          )}
          {savedEvents.length > 0 && (
            <Section title="Événements">
              <ul className="grid gap-3 sm:grid-cols-2">
                {savedEvents.map((e) => (
                  <li key={e.slug}>
                    <Link href={`/evenements/${e.slug}`} className="flex items-center gap-4 rounded-2xl border p-4 hover:bg-muted">
                      <EventDate startsAt={e.startsAt} timezone={e.timezone} />
                      <span className="font-semibold">{e.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {savedNews.length > 0 && (
            <Section title="Actualités">
              <ul className="grid gap-3">
                {savedNews.map((n) => (
                  <li key={n.slug}>
                    <Link href={`/actualites/${n.slug}`} className="block rounded-2xl border p-4 hover:bg-muted">
                      <span className="font-semibold">{n.title}</span>
                      <span className="block text-sm text-muted-foreground">{n.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
