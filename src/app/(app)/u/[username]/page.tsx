import { Lock, Settings, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Page, VerifiedBadge, VideoGrid } from "@/components/bits";
import { FollowButton } from "@/components/follow-button";
import { ProfileActions } from "@/components/profile-actions";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/server/permissions";
import { getViewer } from "@/server/session";
import { getProfile, listConnections } from "@/server/services/profiles";
import { listUserVideos } from "@/server/services/videos";
import { formatCount } from "@/lib/text";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  return { title: `@${(await params).username}` };
}

export default async function ProfilePage({ params, searchParams }: PageProps<"/u/[username]">) {
  const [{ username }, sp] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  const p = await getProfile(decodeURIComponent(username), viewer);
  if (!p) notFound();
  const list = sp.liste === "abonnes" ? "followers" : sp.liste === "abonnements" ? "following" : null;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);

  const tabs = [
    { key: null, label: "Vidéos", count: p.counts.videos },
    { key: "abonnes", label: "Abonnés", count: p.counts.followers },
    { key: "abonnements", label: "Abonnements", count: p.counts.following },
  ];

  return (
    <Page wide>
      <header className="flex flex-col gap-5 md:flex-row md:items-center">
        <UserAvatar name={p.name} image={p.image} className="size-24 text-2xl md:size-28" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl font-extrabold">
            {p.name}
            {p.isPrivate && <Lock className="size-5 text-muted-foreground" aria-label="Compte privé" />}
          </h1>
          <p className="text-muted-foreground">
            @{p.username}
            {p.role !== "user" && <span className="ml-2 rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold">{ROLE_LABELS[p.role]}</span>}
          </p>
          {p.bio && <p className="mt-3 max-w-xl whitespace-pre-wrap">{p.bio}</p>}
          {p.businesses.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {p.businesses.map((b) => (
                <li key={b.slug}>
                  <Link href={`/commerces/${b.slug}`} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium hover:bg-muted">
                    <Store className="size-4 text-primary" aria-hidden="true" /> {b.name} <VerifiedBadge status={b.verification} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          {p.isSelf ? (
            <Button asChild variant="outline" size="lg">
              <Link href="/parametres">
                <Settings /> Modifier le profil
              </Link>
            </Button>
          ) : (
            <>
              {!p.relation?.blocking && <FollowButton userId={p.id} initial={p.relation?.follow ?? null} signedIn={Boolean(viewer)} size="lg" />}
              <ProfileActions userId={p.id} username={p.username} blocking={Boolean(p.relation?.blocking)} signedIn={Boolean(viewer)} />
            </>
          )}
        </div>
      </header>

      <nav aria-label="Sections du profil" className="mt-8 flex gap-1 border-b">
        {tabs.map((t) => {
          const active = (list === "followers" ? "abonnes" : list === "following" ? "abonnements" : null) === t.key;
          return (
            <Link
              key={t.label}
              href={t.key ? `/u/${p.username}?liste=${t.key}` : `/u/${p.username}`}
              aria-current={active ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-4 py-3 font-semibold", active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {formatCount(t.count)} <span className="font-normal">{t.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        {p.relation?.blocking ? (
          <EmptyState icon={Lock} title="Vous avez bloqué ce compte">Débloquez-le pour voir ses contenus.</EmptyState>
        ) : !p.canSeeContent ? (
          <EmptyState icon={Lock} title="Ce compte est privé">
            Abonnez-vous pour voir ses vidéos. Votre demande devra être acceptée.
          </EmptyState>
        ) : list ? (
          <Connections userId={p.id} kind={list} page={page} base={`/u/${p.username}?liste=${list === "followers" ? "abonnes" : "abonnements"}`} />
        ) : (
          <Videos userId={p.id} page={page} isSelf={p.isSelf} username={p.username} />
        )}
      </div>
    </Page>
  );
}

async function Videos({ userId, page, isSelf, username }: { userId: string; page: number; isSelf: boolean; username: string }) {
  const viewer = await getViewer();
  const { items, hasMore } = await listUserVideos(userId, viewer, page);
  if (!items.length && page === 0) {
    return isSelf ? (
      <EmptyState icon={Store} title="Vous n'avez encore rien publié" action={<Button asChild><Link href="/publier">Publier ma première vidéo</Link></Button>}>
        Partagez une bonne adresse, un événement ou une info utile de votre quartier.
      </EmptyState>
    ) : (
      <EmptyState icon={Store} title="Aucune vidéo publiée" />
    );
  }
  return (
    <>
      <VideoGrid videos={items} />
      <Pager base={`/u/${username}?`} page={page} hasMore={hasMore} />
    </>
  );
}

async function Connections({ userId, kind, page, base }: { userId: string; kind: "followers" | "following"; page: number; base: string }) {
  const { items, hasMore } = await listConnections(userId, kind, page);
  if (!items.length && page === 0) return <p className="rounded-2xl bg-muted p-6 text-center text-muted-foreground">{kind === "followers" ? "Aucun abonné pour le moment." : "Aucun abonnement pour le moment."}</p>;
  return (
    <>
      <ul className="divide-y rounded-2xl border">
        {items.map((u) => (
          <li key={u.id}>
            <Link href={`/u/${u.username}`} className="flex items-center gap-3 p-4 hover:bg-muted">
              <UserAvatar name={u.name} image={u.image} />
              <span className="min-w-0">
                <span className="block font-semibold">{u.name}</span>
                <span className="block truncate text-sm text-muted-foreground">@{u.username}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Pager base={`${base}&`} page={page} hasMore={hasMore} />
    </>
  );
}

function Pager({ base, page, hasMore }: { base: string; page: number; hasMore: boolean }) {
  if (!hasMore && page === 0) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex justify-between">
      {page > 0 ? (
        <Link href={`${base}page=${page - 1}`} className="rounded-xl border px-4 py-2 font-semibold hover:bg-muted">
          ← Précédent
        </Link>
      ) : (
        <span />
      )}
      {hasMore && (
        <Link href={`${base}page=${page + 1}`} className="rounded-xl border px-4 py-2 font-semibold hover:bg-muted">
          Suivant →
        </Link>
      )}
    </nav>
  );
}
