import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page } from "@/components/bits";
import { getSetting } from "@/server/services/settings";

const DOCS = {
  regles: "Règles de la communauté",
  confidentialite: "Confidentialité et données personnelles",
} as const;

export async function generateMetadata({ params }: PageProps<"/infos/[doc]">): Promise<Metadata> {
  const doc = (await params).doc as keyof typeof DOCS;
  return { title: DOCS[doc] ?? "Information" };
}

/**
 * Pages d'information. Le texte de confidentialité décrit le fonctionnement réel de l'application ;
 * il doit être relu par un juriste et complété (responsable de traitement, DPO, hébergeur) avant la mise en production.
 */
export default async function InfoPage({ params }: PageProps<"/infos/[doc]">) {
  const doc = (await params).doc;
  if (!(doc in DOCS)) notFound();
  const rules = doc === "regles" ? await getSetting("community_rules") : null;
  return (
    <Page>
      <h1 className="text-4xl font-extrabold">{DOCS[doc as keyof typeof DOCS]}</h1>
      <div className="mt-6 space-y-4 text-lg leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
        {doc === "regles" ? (
          <>
            <p className="whitespace-pre-wrap">{String(rules)}</p>
            <h2>Signaler un contenu</h2>
            <p>Chaque vidéo, commentaire, profil, commerce, événement et actualité peut être signalé. L&apos;équipe de modération examine les signalements et peut masquer, retirer ou restreindre. Au-delà d&apos;un certain nombre de signalements, un contenu est masqué automatiquement en attendant l&apos;examen.</p>
            <h2>Contester une décision</h2>
            <p>Les décisions vous concernant sont listées dans Paramètres → Décisions de modération, où vous pouvez les contester.</p>
          </>
        ) : (
          <>
            <p>Cette page décrit les données traitées par Voisino et vos droits.</p>
            <h2>Données collectées</h2>
            <ul>
              <li>Compte : nom affiché, pseudonyme, adresse e-mail, mot de passe (stocké haché), photo et biographie facultatives.</li>
              <li>Contenus : vidéos, légendes, commentaires, j&apos;aime, favoris, abonnements, réponses aux événements.</li>
              <li>Ville choisie. La géolocalisation est facultative : utilisée pour suggérer une ville, elle n&apos;est pas enregistrée. Une position approximative (≈ 100 m) n&apos;est associée à une vidéo que si vous l&apos;activez explicitement.</li>
              <li>Les métadonnées des fichiers téléversés (dont les coordonnées GPS) sont supprimées lors du traitement.</li>
              <li>Sécurité : sessions (adresse IP, navigateur) et journal d&apos;audit des actions sensibles de l&apos;équipe.</li>
            </ul>
            <h2>Conservation</h2>
            <ul>
              <li>Sessions : 30 jours d&apos;inactivité maximum.</li>
              <li>Comptes et contenus : jusqu&apos;à leur suppression par vous ou par la modération.</li>
              <li>Les fichiers d&apos;une vidéo supprimée par son auteur sont effacés immédiatement.</li>
            </ul>
            <h2>Vos droits</h2>
            <p>Depuis Paramètres → Compte et données : export complet de vos données (JSON) et suppression définitive de votre compte. Vous pouvez aussi rendre votre compte privé et désactiver chaque type de notification.</p>
            <h2>Ce que Voisino ne fait pas</h2>
            <ul>
              <li>Pas de revente de données ni de publicité ciblée.</li>
              <li>Les contenus sponsorisés sont toujours signalés comme tels.</li>
            </ul>
          </>
        )}
      </div>
    </Page>
  );
}
