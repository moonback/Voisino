"use client";

import {
  Bell,
  Bookmark,
  CalendarDays,
  Compass,
  Home,
  LogIn,
  LogOut,
  MapPin,
  Newspaper,
  Plus,
  Settings,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { UserAvatar } from "./user-avatar";

export type NavViewer = { username: string; name: string; image: string | null; unread: number; canAdmin: boolean } | null;

const PRIMARY = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/explorer", label: "Explorer", icon: Compass },
  { href: "/publier", label: "Publier", icon: Plus },
  { href: "/activite", label: "Activité", icon: Bell },
  { href: "/profil", label: "Profil", icon: UserRound },
] as const;

const SECONDARY = [
  { href: "/actualites", label: "Actualités", icon: Newspaper },
  { href: "/commerces", label: "Commerces", icon: Store },
  { href: "/evenements", label: "Événements", icon: CalendarDays },
  { href: "/villes", label: "Villes", icon: MapPin },
  { href: "/favoris", label: "Favoris", icon: Bookmark },
] as const;

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1 -right-1.5 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-bold text-primary-foreground">
      {n > 99 ? "99+" : n}
      <span className="sr-only"> notifications non lues</span>
    </span>
  );
}

/**
 * Navigation : barre latérale (tablette : icônes, ordinateur : libellés) et barre inférieure sur mobile.
 * `viewer === undefined` pendant le chargement de la session.
 */
export function AppNav({ viewer }: { viewer: NavViewer | undefined }) {
  return <NavView viewer={viewer} pathname={usePathname()} />;
}

/** Version statique (sans URL) affichée pendant le chargement de la session. */
export function NavShell() {
  return <NavView viewer={undefined} pathname="" />;
}

function NavView({ viewer, pathname }: { viewer: NavViewer | undefined; pathname: string }) {
  const router = useRouter();
  const immersive = pathname === "/";

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  const item = (href: string, label: string, Icon: typeof Home, badge = 0) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors md:justify-center lg:justify-start",
          active ? "bg-brand-soft text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span className="relative">
          <Icon className={cn("size-[22px]", active && "text-primary")} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
          <Badge n={badge} />
        </span>
        <span className="md:sr-only lg:not-sr-only">{label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Barre latérale : tablette et ordinateur */}
      <nav aria-label="Navigation principale" className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col border-r bg-background/95 px-3 py-4 backdrop-blur md:flex lg:w-60">
        <div className="mb-6 px-1">
          <Logo className="hidden lg:inline-flex" />
          <Link href="/" className="lg:hidden" aria-label="Voisino — accueil">
            <LogoMark />
          </Link>
        </div>
        <div className="flex flex-col gap-1">
          {PRIMARY.map((p) =>
            p.href === "/publier" ? (
              <Link
                key={p.href}
                href={p.href}
                aria-current={isActive(pathname, p.href) ? "page" : undefined}
                className="my-1 flex h-11 items-center gap-3 rounded-xl bg-primary px-3 font-semibold text-primary-foreground shadow-sm transition-transform hover:brightness-110 active:scale-[0.98] md:justify-center lg:justify-start"
              >
                <Plus className="size-[22px]" aria-hidden="true" />
                <span className="md:sr-only lg:not-sr-only">Publier</span>
              </Link>
            ) : (
              item(p.href, p.label, p.icon, p.href === "/activite" ? (viewer?.unread ?? 0) : 0)
            ),
          )}
        </div>
        <div className="mt-5 flex flex-col gap-1 border-t pt-4">
          <p className="mb-1 hidden px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:block">Près de chez vous</p>
          {SECONDARY.map((s) => item(s.href, s.label, s.icon))}
          {viewer?.canAdmin && item("/admin", "Administration", ShieldCheck)}
        </div>
        <div className="mt-auto flex flex-col gap-1">
          <ThemeToggle withLabel />
          {viewer && item("/parametres", "Paramètres", Settings)}
          {viewer === null && (
            <Link href="/connexion" className="flex h-11 items-center gap-3 rounded-xl border px-3 font-medium hover:bg-muted md:justify-center lg:justify-start">
              <LogIn className="size-5" aria-hidden="true" />
              <span className="md:sr-only lg:not-sr-only">Se connecter</span>
            </Link>
          )}
          {viewer && (
            <div className="flex items-center gap-2 rounded-xl p-1.5 md:justify-center lg:justify-start">
              <Link href={`/u/${viewer.username}`} className="flex min-w-0 items-center gap-2 rounded-lg" aria-label="Mon profil">
                <UserAvatar name={viewer.name} image={viewer.image} className="size-9" />
                <span className="hidden min-w-0 lg:block">
                  <span className="block truncate text-sm font-semibold">{viewer.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">@{viewer.username}</span>
                </span>
              </Link>
              <button onClick={signOut} className="ml-auto hidden size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:flex" aria-label="Se déconnecter">
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Barre inférieure : mobile */}
      <nav
        aria-label="Navigation principale"
        className={cn(
          "pb-safe fixed inset-x-0 bottom-0 z-40 border-t md:hidden",
          immersive ? "border-white/10 bg-black text-white" : "bg-background/95 backdrop-blur",
        )}
      >
        <ul className="grid h-16 grid-cols-5">
          {PRIMARY.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            if (href === "/publier") {
              return (
                <li key={href} className="flex items-center justify-center">
                  <Link href={href} aria-label="Publier une vidéo" className="flex h-10 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md active:scale-95">
                    <Plus className="size-6" strokeWidth={2.6} aria-hidden="true" />
                  </Link>
                </li>
              );
            }
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                    active ? (immersive ? "text-white" : "text-primary") : immersive ? "text-white/70" : "text-muted-foreground",
                  )}
                >
                  <span className="relative">
                    <Icon className="size-6" strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
                    {href === "/activite" && <Badge n={viewer?.unread ?? 0} />}
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
