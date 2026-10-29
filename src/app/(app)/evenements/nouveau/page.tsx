import { MailWarning } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, Page, PageHeader } from "@/components/bits";
import { ResendVerification } from "@/components/auth-forms";
import { EventForm } from "@/components/content-forms";
import { currentCity } from "@/server/current-city";
import { requireViewerPage } from "@/server/session";
import { listCategories, listCities } from "@/server/services/cities";
import { myBusinesses } from "@/server/services/content";

export const metadata: Metadata = { title: "Créer un événement" };

export default async function NewEventPage() {
  const viewer = await requireViewerPage("/evenements/nouveau");
  if (!viewer.emailVerified) {
    return (
      <Page>
        <EmptyState icon={MailWarning} title="Confirmez votre adresse e-mail" action={<ResendVerification email={viewer.email} />}>
          La création d&apos;événements est réservée aux comptes confirmés.
        </EmptyState>
      </Page>
    );
  }
  const [city, cities, categories, owned] = await Promise.all([currentCity(viewer), listCities(), listCategories(), myBusinesses(viewer)]);
  return (
    <Page>
      <PageHeader title="Créer un événement" description="Atelier, fête de quartier, concert, marché…" className="mb-8" />
      <EventForm cities={cities} categories={categories} businesses={owned} defaultCityId={city?.id ?? null} />
    </Page>
  );
}
