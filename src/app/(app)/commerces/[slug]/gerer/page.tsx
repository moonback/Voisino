import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, PageHeader } from "@/components/bits";
import { BusinessForm } from "@/components/content-forms";
import { canManageCity } from "@/server/permissions";
import { requireViewerPage } from "@/server/session";
import { listCategories, listCities } from "@/server/services/cities";
import { getBusiness } from "@/server/services/content";

export const metadata: Metadata = { title: "Gérer la fiche" };

/** Outils du propriétaire : modification de la fiche (contrôle d'accès refait côté serveur à l'enregistrement). */
export default async function ManageBusinessPage({ params }: PageProps<"/commerces/[slug]/gerer">) {
  const { slug } = await params;
  const viewer = await requireViewerPage(`/commerces/${slug}/gerer`);
  const b = await getBusiness(slug, viewer);
  if (!b || (!b.memberRole && !canManageCity(viewer, b.business.cityId))) notFound();
  const biz = b.business;
  const [cities, categories] = await Promise.all([listCities(), listCategories()]);
  return (
    <Page>
      <PageHeader title={`Gérer « ${biz.name} »`} description={<Link href={`/commerces/${slug}`} className="underline">Voir la fiche publique</Link>} className="mb-8" />
      {biz.verification === "verified" && (
        <p className="mb-6 rounded-xl bg-muted p-3 text-sm">Modifier le nom d&apos;une fiche vérifiée relance la vérification (protection contre l&apos;usurpation).</p>
      )}
      <BusinessForm
        cities={cities}
        categories={categories}
        defaultCityId={biz.cityId}
        initial={{
          id: biz.id,
          slug: biz.slug,
          values: {
            name: biz.name,
            cityId: biz.cityId,
            categoryId: biz.categoryId ?? "",
            description: biz.description ?? "",
            address: biz.address ?? "",
            phone: biz.phone ?? "",
            email: biz.email ?? "",
            website: biz.website ?? "",
            hours: biz.hours,
          },
        }}
      />
    </Page>
  );
}
