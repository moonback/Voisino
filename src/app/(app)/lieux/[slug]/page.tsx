import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoBadge, Page, Section, VideoGrid } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/server/session";
import { getPlace } from "@/server/services/content";

export async function generateMetadata({ params }: PageProps<"/lieux/[slug]">): Promise<Metadata> {
  const p = await getPlace((await params).slug, null);
  return { title: p?.place.name ?? "Lieu introuvable" };
}

export default async function PlacePage({ params }: PageProps<"/lieux/[slug]">) {
  const { slug } = await params;
  const p = await getPlace(slug, await getViewer());
  if (!p) notFound();
  return (
    <Page wide>
      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
        {p.categoryName ?? "Lieu"} · <Link href={`/explorer?ville=${p.citySlug}&type=lieux`}>{p.cityName}</Link> <DemoBadge show={p.place.isDemo} />
      </p>
      <h1 className="mt-1 text-4xl font-extrabold">{p.place.name}</h1>
      {p.place.description && <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{p.place.description}</p>}
      {p.place.address && <p className="mt-2">{p.place.address}</p>}
      <Section title="Vidéos tournées ici">
        <VideoGrid videos={p.videos} emptyLabel="Aucune vidéo pour ce lieu pour l'instant." />
      </Section>
      <Button asChild className="mt-6" size="lg">
        <Link href="/publier">Partager une vidéo de ce lieu</Link>
      </Button>
    </Page>
  );
}
