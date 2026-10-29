import { BadgeCheck, CalendarDays, Eye, Heart, Lock, MapPin, Newspaper, Play, Store, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { VideoCard } from "@/server/services/videos";
import { formatCount, formatInZone, timeAgo } from "@/lib/text";
import { cn } from "@/lib/utils";

/** Petits composants d'affichage partagés (serveur et client). */

export function PageHeader({ title, description, actions, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold md:text-4xl">{title}</h1>
        {description && <p className="mt-1.5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Page({ children, className, wide = false }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 py-6 md:px-8 md:py-10", wide ? "max-w-6xl" : "max-w-3xl", className)}>{children}</div>;
}

export function Section({ title, href, linkLabel = "Tout voir", children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {href && (
          <Link href={href} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
            {linkLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft">
        <Icon className="size-7 text-primary" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      {children && <p className="mt-1 max-w-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-secondary-foreground uppercase" title="Donnée de démonstration">
      Démo
    </span>
  );
}

export function VerifiedBadge({ status }: { status: string }) {
  if (status !== "verified") return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
      <BadgeCheck className="size-4" aria-hidden="true" /> Vérifié
    </span>
  );
}

const COVER_ICONS = { business: Store, event: CalendarDays, news: Newspaper, place: MapPin } as const;
const HUES = ["from-orange-200 to-amber-100", "from-teal-200 to-emerald-100", "from-rose-200 to-orange-100", "from-sky-200 to-teal-100", "from-amber-200 to-lime-100"];

/** Visuel de couverture : image si fournie, sinon composition typographique (pas d'image inventée). */
export function Cover({ src, title, kind, className }: { src: string | null | undefined; title: string; kind: keyof typeof COVER_ICONS; className?: string }) {
  const Icon = COVER_ICONS[kind];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- médias servis par notre API avec contrôle d'accès
    return <img src={src} alt="" loading="lazy" className={cn("aspect-[16/10] w-full rounded-2xl object-cover", className)} />;
  }
  const hue = HUES[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return (
    <div className={cn("relative flex aspect-[16/10] w-full items-end overflow-hidden rounded-2xl bg-gradient-to-br p-4 dark:opacity-80", hue, className)} aria-hidden="true">
      <Icon className="absolute -top-3 -right-3 size-28 text-black/10" />
      <span className="line-clamp-2 font-heading text-lg leading-tight font-bold text-stone-900">{title}</span>
    </div>
  );
}

export function VideoGrid({ videos, emptyLabel = "Aucune vidéo pour le moment." }: { videos: VideoCard[]; emptyLabel?: string }) {
  if (!videos.length) return <p className="rounded-2xl bg-muted p-6 text-center text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {videos.map((v) => (
        <li key={v.id}>
          <Link href={`/v/${v.id}`} className="group relative block aspect-[9/16] overflow-hidden rounded-xl bg-stone-900">
            {v.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- miniature générée par le pipeline vidéo
              <img src={v.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
            ) : (
              <span className="flex h-full items-center justify-center p-3 text-center text-sm text-white/80">
                {v.status === "failed" ? "Échec du traitement" : "En traitement…"}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 text-white">
              <span className="line-clamp-2 text-sm leading-snug font-medium">{v.caption || `@${v.authorUsername}`}</span>
              <span className="mt-1 flex items-center gap-2 text-xs text-white/85">
                <span className="inline-flex items-center gap-0.5">
                  <Heart className="size-3" aria-hidden="true" />
                  {formatCount(v.likeCount)}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <Eye className="size-3" aria-hidden="true" />
                  {formatCount(v.viewCount)}
                </span>
                {v.visibility !== "public" && <Lock className="size-3" aria-label="Visibilité restreinte" />}
              </span>
            </span>
            {v.sponsorName && <span className="absolute top-2 left-2 rounded bg-amber-300 px-1.5 text-[11px] font-bold text-black">Sponsorisé</span>}
            <Play className="absolute top-2 right-2 size-4 text-white/90" fill="currentColor" aria-hidden="true" />
            <span className="sr-only">Voir la vidéo de @{v.authorUsername}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EventDate({ startsAt, timezone, className }: { startsAt: Date | string; timezone: string; className?: string }) {
  const d = new Date(startsAt);
  const day = new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, day: "numeric" }).format(d);
  const month = new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, month: "short" }).format(d).replace(".", "");
  return (
    <time dateTime={d.toISOString()} title={formatInZone(d, timezone)} className={cn("flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-soft leading-none", className)}>
      <span className="text-xl font-extrabold">{day}</span>
      <span className="text-xs font-semibold text-primary uppercase">{month}</span>
    </time>
  );
}

/** Date relative (« il y a 3 heures ») : dépend de l'heure courante, donc tolérée à l'hydratation. */
export function TimeAgo({ date, className }: { date: Date | string; className?: string }) {
  return (
    <time dateTime={new Date(date).toISOString()} className={className} suppressHydrationWarning>
      {timeAgo(date)}
    </time>
  );
}

export function LoadingBlock({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label={label}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}
