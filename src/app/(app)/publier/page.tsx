import { MailWarning, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, Page, PageHeader } from "@/components/bits";
import { PublishForm } from "@/components/publish-form";
import { ResendVerification } from "@/components/auth-forms";
import { currentCity } from "@/server/current-city";
import { requireViewerPage } from "@/server/session";
import { listCategories, listCities, listZones } from "@/server/services/cities";
import { linkOptions } from "@/server/services/content";

export const metadata: Metadata = { title: "Publier" };

export default async function PublishPage() {
  const viewer = await requireViewerPage("/publier");
  if (viewer.status === "restricted") {
    return (
      <Page>
        <EmptyState icon={ShieldAlert} title="Publication suspendue">
          Votre compte est restreint suite à une décision de modération. Vous pouvez la contester depuis vos paramètres.
        </EmptyState>
      </Page>
    );
  }
  if (!viewer.emailVerified) {
    return (
      <Page>
        <EmptyState icon={MailWarning} title="Confirmez votre adresse e-mail" action={<ResendVerification email={viewer.email} />}>
          Pour protéger la communauté, la publication est réservée aux comptes dont l&apos;adresse e-mail est confirmée.
        </EmptyState>
      </Page>
    );
  }
  const city = await currentCity(viewer);
  const [cities, categories, links] = await Promise.all([listCities(), listCategories(), city ? linkOptions(city.id) : null]);
  const withZones = await Promise.all(cities.map(async (c) => ({ id: c.id, name: c.name, zones: await listZones(c.id) })));
  return (
    <Page wide>
      <PageHeader title="Publier une vidéo" description="Partagez ce qui se passe près de chez vous." className="mb-8" />
      <PublishForm
        cities={withZones}
        defaultCityId={city?.id ?? null}
        categories={categories}
        links={links && city ? { cityId: city.id, ...links } : null}
        maxMb={Number(process.env.MAX_UPLOAD_MB ?? 200)}
        maxSeconds={Number(process.env.MAX_VIDEO_SECONDS ?? 180)}
      />
    </Page>
  );
}
