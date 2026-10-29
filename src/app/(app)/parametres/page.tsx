import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHeader } from "@/components/bits";
import { CityPickerDialog } from "@/components/city-picker";
import { ResendVerification } from "@/components/auth-forms";
import { AccountActions, BlockedList, ModerationDecisions, NotificationPrefsForm, PrivacyForm, ProfileForm } from "@/components/settings-forms";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { currentCity } from "@/server/current-city";
import { requireViewerPage } from "@/server/session";
import { myModerationDecisions } from "@/server/services/moderation";
import { CONFIGURABLE_TYPES, NOTIFICATION_LABELS } from "@/server/services/notifications";
import { getSettings } from "@/server/services/profiles";
import { listBlocked } from "@/server/services/social";

export const metadata: Metadata = { title: "Paramètres" };

function Block({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-6 border-t py-8 first:border-t-0 first:pt-0">
      <h2 id={`${id}-t`} className="text-xl font-bold">
        {title}
      </h2>
      {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

const SECTIONS = [
  ["profil", "Profil"],
  ["ville", "Ville"],
  ["confidentialite", "Confidentialité"],
  ["notifications", "Notifications"],
  ["blocages", "Comptes bloqués"],
  ["moderation", "Décisions de modération"],
  ["compte", "Compte et données"],
] as const;

export default async function SettingsPage() {
  const viewer = await requireViewerPage("/parametres");
  const [settings, city, blocked, decisions] = await Promise.all([getSettings(viewer.id), currentCity(viewer), listBlocked(viewer), myModerationDecisions(viewer)]);
  return (
    <Page>
      <PageHeader title="Paramètres" description={<Link href={`/u/${viewer.username}`} className="underline">Voir mon profil public</Link>} className="mb-6" />
      <nav aria-label="Sections" className="scrollbar-none -mx-4 mb-8 flex gap-2 overflow-x-auto px-4">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium hover:bg-muted">
            {label}
          </a>
        ))}
      </nav>
      {!viewer.emailVerified && (
        <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-primary bg-brand-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <p>Votre adresse e-mail n&apos;est pas encore confirmée : la publication est désactivée.</p>
          <ResendVerification email={viewer.email} />
        </div>
      )}
      <Block id="profil" title="Profil public">
        <ProfileForm initial={{ name: viewer.name, username: viewer.username, bio: settings.bio ?? "", image: viewer.image }} />
      </Block>
      <Block id="ville" title="Ville principale" description="Elle détermine votre flux et vos suggestions. Vous pouvez en changer à tout moment.">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 font-semibold">
            <MapPin className="size-4 text-accent" aria-hidden="true" /> {city?.name ?? "Aucune ville choisie"}
          </span>
          <CityPickerDialog current={city?.slug ?? null}>
            <Button variant="outline">Changer de ville</Button>
          </CityPickerDialog>
          <ThemeToggle withLabel={false} />
        </div>
      </Block>
      <Block id="confidentialite" title="Confidentialité">
        <PrivacyForm initial={{ isPrivate: settings.isPrivate, allowComments: settings.allowComments }} />
      </Block>
      <Block id="notifications" title="Notifications">
        <NotificationPrefsForm types={CONFIGURABLE_TYPES.map((k) => ({ key: k, label: NOTIFICATION_LABELS[k] }))} initial={settings.notificationPrefs as Record<string, boolean>} />
      </Block>
      <Block id="blocages" title="Comptes bloqués">
        <BlockedList users={blocked} />
      </Block>
      <Block id="moderation" title="Décisions de modération" description="Vous pouvez contester une décision qui vous concerne : elle sera réexaminée par un autre membre de l'équipe.">
        <ModerationDecisions decisions={decisions} />
      </Block>
      <Block id="compte" title="Compte et données personnelles" description={`Connecté en tant que ${viewer.email}. Conformément au RGPD, vous pouvez exporter ou supprimer vos données à tout moment.`}>
        <AccountActions />
      </Block>
    </Page>
  );
}
