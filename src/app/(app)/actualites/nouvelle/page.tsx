import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, Page, PageHeader } from "@/components/bits";
import { NewsForm } from "@/components/content-forms";
import { currentCity } from "@/server/current-city";
import { canContribute } from "@/server/permissions";
import { requireViewerPage } from "@/server/session";
import { listCategories, listCities } from "@/server/services/cities";
import { myBusinesses } from "@/server/services/content";

export const metadata: Metadata = { title: "Rédiger une actualité" };

export default async function NewNewsPage() {
  const viewer = await requireViewerPage("/actualites/nouvelle");
  const owned = await myBusinesses(viewer);
  const canWrite = canContribute(viewer) && (viewer.role === "global_admin" || viewer.role === "local_admin" || (viewer.role === "pro" && owned.length > 0));
  if (!canWrite) {
    return (
      <Page>
        <EmptyState icon={ShieldAlert} title="Publication réservée">
          Les actualités sont rédigées par les administrateurs de la ville et les professionnels dont la fiche est vérifiée. Revendiquez votre commerce pour y accéder.
        </EmptyState>
      </Page>
    );
  }
  const [city, cities, categories] = await Promise.all([currentCity(viewer), listCities(), listCategories()]);
  const allowedCities = viewer.role === "global_admin" ? cities : viewer.role === "local_admin" ? cities.filter((c) => viewer.adminCityIds.includes(c.id)) : cities.filter((c) => owned.some((b) => b.cityId === c.id));
  return (
    <Page>
      <PageHeader title="Rédiger une actualité" description="Informations locales vérifiées : citez vos sources." className="mb-8" />
      <NewsForm cities={allowedCities} categories={categories} businesses={owned.filter((b) => b.verification === "verified")} defaultCityId={city && allowedCities.some((c) => c.id === city.id) ? city.id : null} />
    </Page>
  );
}
