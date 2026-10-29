import { MailWarning } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, Page, PageHeader } from "@/components/bits";
import { BusinessForm } from "@/components/content-forms";
import { ResendVerification } from "@/components/auth-forms";
import { currentCity } from "@/server/current-city";
import { requireViewerPage } from "@/server/session";
import { listCategories, listCities } from "@/server/services/cities";

export const metadata: Metadata = { title: "Référencer mon commerce" };

export default async function NewBusinessPage() {
  const viewer = await requireViewerPage("/commerces/nouveau");
  if (!viewer.emailVerified) {
    return (
      <Page>
        <EmptyState icon={MailWarning} title="Confirmez votre adresse e-mail" action={<ResendVerification email={viewer.email} />} />
      </Page>
    );
  }
  const [city, cities, categories] = await Promise.all([currentCity(viewer), listCities(), listCategories()]);
  return (
    <Page>
      <PageHeader
        title="Référencer mon commerce"
        description="La fiche est créée immédiatement ; le badge « Vérifié » n'apparaît qu'après contrôle par l'équipe locale. Si votre commerce existe déjà, revendiquez plutôt sa fiche."
        className="mb-8"
      />
      <BusinessForm cities={cities} categories={categories} defaultCityId={city?.id ?? null} />
    </Page>
  );
}
