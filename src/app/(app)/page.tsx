import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { CityPicker } from "@/components/city-picker";
import { Feed } from "@/components/feed";
import { LogoMark } from "@/components/logo";
import { canContribute } from "@/server/permissions";
import { currentCity } from "@/server/current-city";
import { getViewer } from "@/server/session";
import { getFeed } from "@/server/services/feed";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100dvh-4rem)] items-center justify-center bg-black md:h-dvh">
          <Loader2 className="size-8 animate-spin text-white" aria-label="Chargement du flux" />
        </div>
      }
    >
      <Home searchParams={searchParams} />
    </Suspense>
  );
}

async function Home({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const city = await currentCity(viewer);
  if (!city) return <Welcome />;
  const mode = sp.flux === "abonnements" ? "following" : "local";
  const initial = await getFeed({ viewerId: viewer?.id ?? null, cityId: city.id, mode, exclude: [] });
  return <Feed city={{ slug: city.slug, name: city.name }} mode={mode} initial={initial} me={viewer && { id: viewer.id, canContribute: canContribute(viewer) }} />;
}

/** Premier lancement : choix de la ville, sans compte obligatoire. */
function Welcome() {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-5xl items-center gap-10 px-4 py-10 md:min-h-dvh md:grid-cols-[1.1fr_1fr] md:px-8">
      <section>
        <LogoMark className="size-12" />
        <h1 className="mt-6 text-4xl leading-[1.05] font-extrabold md:text-6xl">
          Ce qui se passe <span className="text-primary">près de chez vous</span>, en vidéo.
        </h1>
        <p className="mt-5 max-w-md text-lg text-muted-foreground">
          Les habitants, commerces et associations de votre ville partagent ce qui fait la vie du quartier : bonnes adresses, sorties, infos utiles.
        </p>
        <ul className="mt-6 grid gap-2 text-sm text-muted-foreground">
          <li>• Aucun compte nécessaire pour regarder.</li>
          <li>• La géolocalisation est facultative.</li>
          <li>• Vous pouvez changer de ville à tout moment.</li>
        </ul>
      </section>
      <section className="rounded-3xl border bg-card p-5 shadow-sm md:p-6" aria-labelledby="choose-city">
        <h2 id="choose-city" className="mb-4 text-xl font-bold">
          Choisissez votre ville
        </h2>
        <CityPicker />
      </section>
    </div>
  );
}
