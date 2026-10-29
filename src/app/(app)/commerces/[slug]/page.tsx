import { CalendarDays, Clock, Globe, Mail, MapPin, Pencil, Phone, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoBadge, Page, Section, VerifiedBadge, VideoGrid } from "@/components/bits";
import { ClaimDialog, FollowBusinessButton, ReportButton, ShareButton } from "@/components/content-actions";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/server/session";
import { getBusiness } from "@/server/services/content";
import { formatInZone } from "@/lib/text";
import { DAY_LABELS } from "@/lib/validation";

export async function generateMetadata({ params }: PageProps<"/commerces/[slug]">): Promise<Metadata> {
  const b = await getBusiness((await params).slug, null);
  return b ? { title: b.business.name, description: b.business.description ?? undefined } : { title: "Commerce introuvable" };
}

export default async function BusinessPage({ params }: PageProps<"/commerces/[slug]">) {
  const { slug } = await params;
  const viewer = await getViewer();
  const b = await getBusiness(slug, viewer);
  if (!b) notFound();
  const biz = b.business;
  const hours = Object.entries(biz.hours).filter(([, v]) => v);
  const contact = biz.phone ? `tel:${biz.phone.replace(/\s/g, "")}` : biz.email ? `mailto:${biz.email}` : biz.website;

  return (
    <Page wide>
      {biz.isHidden && <p className="mb-4 rounded-xl bg-secondary p-3 text-sm font-medium">Cette fiche est masquée par la modération.</p>}
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            {b.categoryName ?? "Commerce"} · <Link href={`/commerces?ville=${b.citySlug}`}>{b.cityName}</Link> <DemoBadge show={biz.isDemo} />
          </p>
          <h1 className="mt-1 text-4xl font-extrabold">{biz.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <VerifiedBadge status={biz.verification} />
            {biz.verification === "pending" && <span>Vérification en cours</span>}
            {biz.verification === "unverified" && <span>Fiche non revendiquée</span>}
            <span>
              {b.followers} abonné{b.followers > 1 ? "s" : ""}
            </span>
            {biz.plan === "premium" && <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold">Compte pro premium</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FollowBusinessButton businessId={biz.id} initial={b.isFollowing} signedIn={Boolean(viewer)} />
          {contact && (
            <Button asChild size="lg" variant="outline">
              <a href={contact} rel="noopener noreferrer" target={contact.startsWith("http") ? "_blank" : undefined}>
                Contacter
              </a>
            </Button>
          )}
          <ShareButton path={`/commerces/${biz.slug}`} title={biz.name} />
          {b.memberRole ? (
            <Button asChild size="lg">
              <Link href={`/commerces/${biz.slug}/gerer`}>
                <Pencil /> Gérer la fiche
              </Link>
            </Button>
          ) : biz.verification !== "verified" && !b.hasPendingClaim ? (
            <ClaimDialog businessId={biz.id} name={biz.name} signedIn={Boolean(viewer)} />
          ) : null}
          {b.hasPendingClaim && <span className="self-center text-sm text-muted-foreground">Votre demande est en cours d&apos;examen</span>}
          {!b.memberRole && <ReportButton targetType="business" targetId={biz.id} signedIn={Boolean(viewer)} />}
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          {biz.description && <p className="text-lg leading-relaxed whitespace-pre-wrap">{biz.description}</p>}
          <Section title="Vidéos">
            <VideoGrid videos={b.videos} emptyLabel="Aucune vidéo associée à ce commerce pour l'instant." />
          </Section>
          {b.news.length > 0 && (
            <Section title="Actualités et offres">
              <ul className="grid gap-3">
                {b.news.map((n) => (
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
          {b.upcoming.length > 0 && (
            <Section title="Prochains événements">
              <ul className="grid gap-2">
                {b.upcoming.map((e) => (
                  <li key={e.slug}>
                    <Link href={`/evenements/${e.slug}`} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted">
                      <CalendarDays className="size-5 text-primary" aria-hidden="true" />
                      <span className="font-medium">{e.title}</span>
                      <span className="ml-auto text-sm text-muted-foreground">{formatInZone(e.startsAt, b.timezone, { dateStyle: "medium", timeStyle: "short" })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <aside className="grid content-start gap-4">
          <dl className="grid gap-3 rounded-2xl border bg-card p-5">
            {biz.address && (
              <div className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                <div>
                  <dt className="sr-only">Adresse</dt>
                  <dd>{biz.address}</dd>
                  {b.lat !== null && b.lng !== null && (
                    <a href={`https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.lng}#map=17/${b.lat}/${b.lng}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline">
                      Voir sur la carte
                    </a>
                  )}
                </div>
              </div>
            )}
            {biz.phone && (
              <div className="flex gap-3">
                <Phone className="size-5 text-accent" aria-hidden="true" />
                <dt className="sr-only">Téléphone</dt>
                <dd>
                  <a href={`tel:${biz.phone.replace(/\s/g, "")}`} className="hover:underline">
                    {biz.phone}
                  </a>
                </dd>
              </div>
            )}
            {biz.email && (
              <div className="flex gap-3">
                <Mail className="size-5 text-accent" aria-hidden="true" />
                <dt className="sr-only">E-mail</dt>
                <dd>
                  <a href={`mailto:${biz.email}`} className="hover:underline">
                    {biz.email}
                  </a>
                </dd>
              </div>
            )}
            {biz.website && (
              <div className="flex gap-3">
                <Globe className="size-5 text-accent" aria-hidden="true" />
                <dt className="sr-only">Site web</dt>
                <dd className="min-w-0 truncate">
                  <a href={biz.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {biz.website.replace(/^https?:\/\//, "")}
                  </a>
                </dd>
              </div>
            )}
            {biz.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline">
                {l.label}
              </a>
            ))}
          </dl>
          {hours.length > 0 && (
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-bold">
                <Clock className="size-5 text-accent" aria-hidden="true" /> Horaires
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {(Object.keys(DAY_LABELS) as (keyof typeof DAY_LABELS)[]).map((d) => (
                  <div key={d} className="contents">
                    <dt className="text-muted-foreground">{DAY_LABELS[d]}</dt>
                    <dd>{biz.hours[d] || "Fermé"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {biz.verification === "verified" && (
            <p className="flex gap-2 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              <ShieldCheck className="size-5 shrink-0 text-accent" aria-hidden="true" />
              Le gérant de cette fiche a été vérifié par l&apos;équipe Voisino de {b.cityName}.
            </p>
          )}
        </aside>
      </div>
    </Page>
  );
}
