import { CalendarClock, ExternalLink, Info, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover, DemoBadge, Page, Section, VideoGrid } from "@/components/bits";
import { AttendanceButtons, CancelEventButton, ReportButton, SaveButton, ShareButton } from "@/components/content-actions";
import { getViewer } from "@/server/session";
import { getEvent } from "@/server/services/content";
import { isBookmarked } from "@/server/services/social";
import { formatInZone } from "@/lib/text";

export async function generateMetadata({ params }: PageProps<"/evenements/[slug]">): Promise<Metadata> {
  const e = await getEvent((await params).slug, null);
  return e ? { title: e.event.title, description: e.event.description.slice(0, 160) } : { title: "Événement introuvable" };
}

export default async function EventPage({ params }: PageProps<"/evenements/[slug]">) {
  const { slug } = await params;
  const viewer = await getViewer();
  const e = await getEvent(slug, viewer);
  if (!e) notFound();
  const ev = e.event;
  const saved = viewer ? await isBookmarked(viewer.id, { eventId: ev.id }) : false;
  const sameDay = formatInZone(ev.startsAt, e.timezone, { dateStyle: "short", timeStyle: undefined }) === formatInZone(ev.endsAt, e.timezone, { dateStyle: "short", timeStyle: undefined });
  const full = ev.capacity !== null && e.going >= ev.capacity;
  const closed = e.isPast || ev.status !== "published";

  return (
    <Page wide>
      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <article>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            {e.categoryName ?? "Événement"} · <Link href={`/evenements?ville=${e.citySlug}`}>{e.cityName}</Link> <DemoBadge show={ev.isDemo} />
          </p>
          <h1 className="mt-1 text-4xl font-extrabold">{ev.title}</h1>
          {ev.status === "cancelled" && <p className="mt-3 rounded-xl bg-destructive/10 p-3 font-semibold text-destructive">Cet événement est annulé.</p>}
          {e.isPast && ev.status === "published" && <p className="mt-3 rounded-xl bg-muted p-3 font-medium">Cet événement est terminé.</p>}
          {ev.coverUrl && <Cover src={ev.coverUrl} title={ev.title} kind="event" className="mt-6" />}
          <div className="mt-6 space-y-4 text-lg leading-relaxed">
            {ev.description.split(/\n{2,}/).map((p, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {p}
              </p>
            ))}
          </div>
          <Section title="Vidéos de l'événement">
            <VideoGrid videos={e.videos} emptyLabel="Pas encore de vidéo : partagez la vôtre depuis « Publier »." />
          </Section>
        </article>
        <aside className="grid content-start gap-4">
          <div className="grid gap-4 rounded-2xl border bg-card p-5">
            <p className="flex gap-3">
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <span className="block font-semibold">{formatInZone(ev.startsAt, e.timezone, { dateStyle: "full", timeStyle: undefined })}</span>
                <span className="text-muted-foreground">
                  {formatInZone(ev.startsAt, e.timezone, { dateStyle: undefined, timeStyle: "short" })} –{" "}
                  {sameDay ? formatInZone(ev.endsAt, e.timezone, { dateStyle: undefined, timeStyle: "short" }) : formatInZone(ev.endsAt, e.timezone, { dateStyle: "medium", timeStyle: "short" })}
                  <span className="block text-xs">Heure locale ({e.timezone})</span>
                </span>
              </span>
            </p>
            {(ev.venueName || ev.address || e.placeName) && (
              <p className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                <span>
                  {ev.venueName && <span className="block font-semibold">{ev.venueName}</span>}
                  {ev.address && <span className="block text-muted-foreground">{ev.address}</span>}
                  {e.placeSlug && (
                    <Link href={`/lieux/${e.placeSlug}`} className="text-sm text-primary underline">
                      {e.placeName}
                    </Link>
                  )}
                </span>
              </p>
            )}
            <p className="flex gap-3">
              <Users className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                {e.going} participant{e.going > 1 ? "s" : ""} · {e.interested} intéressé{e.interested > 1 ? "s" : ""}
                {ev.capacity !== null && <span className="block text-sm text-muted-foreground">{full ? "Complet" : `${ev.capacity - e.going} place(s) restante(s)`}</span>}
              </span>
            </p>
            {ev.conditions && (
              <p className="flex gap-3">
                <Info className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                <span>{ev.conditions}</span>
              </p>
            )}
            {ev.externalUrl && (
              <a href={ev.externalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-medium text-primary underline">
                <ExternalLink className="size-4" aria-hidden="true" /> Site de l&apos;événement
              </a>
            )}
            <p className="text-sm text-muted-foreground">
              Organisé par{" "}
              {e.businessSlug ? (
                <Link href={`/commerces/${e.businessSlug}`} className="font-medium underline">
                  {e.businessName}
                </Link>
              ) : e.organizerUsername ? (
                <Link href={`/u/${e.organizerUsername}`} className="font-medium underline">
                  @{e.organizerUsername}
                </Link>
              ) : (
                "un membre de Voisino"
              )}
            </p>
          </div>
          <AttendanceButtons eventId={ev.id} slug={ev.slug} initial={e.myStatus} disabled={closed || (full && e.myStatus !== "going")} signedIn={Boolean(viewer)} />
          <div className="flex flex-wrap gap-2">
            <SaveButton target={{ eventId: ev.id }} initial={saved} signedIn={Boolean(viewer)} />
            <ShareButton path={`/evenements/${ev.slug}`} title={ev.title} />
            {!e.canEdit && <ReportButton targetType="event" targetId={ev.id} signedIn={Boolean(viewer)} />}
          </div>
          {e.canEdit && ev.status === "published" && !e.isPast && <CancelEventButton eventId={ev.id} />}
        </aside>
      </div>
    </Page>
  );
}
