"use client";

import { Clock, Hash, Loader2, Search, Store, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { VideoCard } from "@/server/services/videos";
import { formatInZone } from "@/lib/text";
import { cn } from "@/lib/utils";
import { Cover, DemoBadge, EventDate, VerifiedBadge, VideoGrid } from "./bits";
import { UserAvatar } from "./user-avatar";

const RECENT_KEY = "voisino:recherches";
const TYPES = [
  ["videos", "Vidéos"],
  ["commerces", "Commerces"],
  ["evenements", "Événements"],
  ["actualites", "Actualités"],
  ["lieux", "Lieux"],
  ["comptes", "Comptes"],
] as const;
type Type = (typeof TYPES)[number][0];
type Suggestion = { kind: "hashtag" | "compte" | "commerce"; label: string; hint?: string; href: string };

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Barre de recherche : suggestions instantanées et recherches récentes (stockées sur l'appareil uniquement). */
export function SearchBox({ citySlug }: { citySlug: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setRecent(readRecent()), []);
  useEffect(() => setQ(params.get("q") ?? ""), [params]);
  useEffect(() => {
    if (q.trim().length < 2) return setSuggestions([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?suggest=1&q=${encodeURIComponent(q)}${citySlug ? `&ville=${citySlug}` : ""}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(setSuggestions)
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, citySlug]);

  function submit(value: string) {
    const v = value.trim();
    setOpen(false);
    const next = new URLSearchParams(params);
    if (v) {
      next.set("q", v);
      const updated = [v, ...readRecent().filter((r) => r !== v)].slice(0, 8);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      } catch {}
      setRecent(updated);
    } else next.delete("q");
    router.push(`/explorer?${next.toString()}`);
  }

  function clearRecent() {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {}
    setRecent([]);
  }

  const showRecent = open && !q && recent.length > 0;
  const showSuggest = open && suggestions.length > 0;

  return (
    <div ref={box} className="relative" onBlur={(e) => !box.current?.contains(e.relatedTarget) && setOpen(false)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
      >
        <label htmlFor="explorer-q" className="sr-only">
          Rechercher sur Voisino
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="explorer-q"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Vidéos, #hashtags, commerces, événements…"
          className="h-13 rounded-2xl pr-12 pl-12 text-base shadow-sm"
          autoComplete="off"
          role="combobox"
          aria-expanded={showRecent || showSuggest}
          aria-controls={listId}
        />
        {q && (
          <button type="button" onClick={() => submit("")} className="absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full hover:bg-muted" aria-label="Effacer la recherche">
            <X className="size-4" />
          </button>
        )}
      </form>
      {(showRecent || showSuggest) && (
        <div id={listId} className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border bg-popover shadow-lg">
          {showRecent && (
            <>
              <div className="flex items-center justify-between px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase">
                Recherches récentes
                <button onClick={clearRecent} className="font-semibold normal-case hover:text-foreground">
                  Effacer
                </button>
              </div>
              <ul>
                {recent.map((r) => (
                  <li key={r}>
                    <button onClick={() => submit(r)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted">
                      <Clock className="size-4 text-muted-foreground" aria-hidden="true" /> {r}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {showSuggest && (
            <ul>
              {suggestions.map((s) => {
                const Icon = s.kind === "hashtag" ? Hash : s.kind === "compte" ? UserRound : Store;
                return (
                  <li key={s.href}>
                    <Link href={s.href} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted">
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">{s.label}</span>
                      {s.hint && <span className="text-sm text-muted-foreground">{s.hint}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

type AnyItem = Record<string, unknown> & { id: string };

/** Résultats paginés (chargement progressif) d'un type donné. */
export function SearchResults({ q, citySlug, category }: { q: string; citySlug: string | null; category: string | null }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const type = (params.get("type") as Type) ?? "videos";
  const [items, setItems] = useState<AnyItem[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load(p: number) {
    setLoading(true);
    setError(false);
    try {
      const sp = new URLSearchParams({ q, type, page: String(p) });
      if (citySlug) sp.set("ville", citySlug);
      if (category) sp.set("categorie", category);
      const r = await fetch(`/api/search?${sp}`);
      if (!r.ok) throw new Error();
      const data = (await r.json()) as { items: AnyItem[]; hasMore: boolean };
      setItems((prev) => (p === 0 ? data.items : [...(prev ?? []), ...data.items]));
      setHasMore(data.hasMore);
      setPage(p);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems(null);
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharge quand les critères changent
  }, [q, type, citySlug, category]);

  const tabHref = (t: Type) => {
    const sp = new URLSearchParams(params);
    sp.set("type", t);
    return `${pathname}?${sp}`;
  };

  return (
    <div className="mt-6">
      <nav aria-label="Type de résultats" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TYPES.map(([t, label]) => (
          <Link
            key={t}
            href={tabHref(t)}
            aria-current={type === t ? "page" : undefined}
            className={cn("shrink-0 rounded-full border px-4 py-2 text-sm font-semibold", type === t ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-5" aria-live="polite" aria-busy={loading}>
        {items === null && !error && (
          <div className="flex justify-center py-12">
            <Loader2 className="size-7 animate-spin text-muted-foreground" aria-label="Recherche en cours" />
          </div>
        )}
        {error && (
          <p className="rounded-2xl bg-muted p-6 text-center">
            La recherche n&apos;a pas abouti.{" "}
            <button onClick={() => load(page)} className="font-semibold text-primary underline">
              Réessayer
            </button>
          </p>
        )}
        {items?.length === 0 && (
          <div className="rounded-2xl bg-muted p-8 text-center">
            <p className="font-semibold">Aucun résultat{q ? ` pour « ${q} »` : ""}.</p>
            <p className="mt-1 text-sm text-muted-foreground">Essayez un autre mot-clé, un autre onglet{citySlug ? " ou d'autres villes" : ""}.</p>
            {citySlug && (
              <Link href={`/explorer?q=${encodeURIComponent(q)}&type=${type}&ville=toutes`} className="mt-3 inline-block font-semibold text-primary underline">
                Chercher dans toutes les villes
              </Link>
            )}
          </div>
        )}
        {items && items.length > 0 && <ResultList type={type} items={items} />}
        {hasMore && (
          <button onClick={() => load(page + 1)} disabled={loading} className="mt-6 w-full rounded-xl border py-3 font-semibold hover:bg-muted">
            {loading ? "Chargement…" : "Afficher plus de résultats"}
          </button>
        )}
      </div>
    </div>
  );
}

function ResultList({ type, items }: { type: Type; items: AnyItem[] }) {
  if (type === "videos") return <VideoGrid videos={items as unknown as VideoCard[]} />;
  const s = (v: unknown) => (v == null ? "" : String(v));
  if (type === "comptes")
    return (
      <ul className="divide-y rounded-2xl border">
        {items.map((u) => (
          <li key={u.id}>
            <Link href={`/u/${s(u.username)}`} className="flex items-center gap-3 p-4 hover:bg-muted">
              <UserAvatar name={s(u.name)} image={u.image as string | null} />
              <span className="min-w-0">
                <span className="block font-semibold">{s(u.name)}</span>
                <span className="block truncate text-sm text-muted-foreground">@{s(u.username)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  if (type === "evenements")
    return (
      <ul className="grid gap-3">
        {items.map((e) => (
          <li key={e.id}>
            <Link href={`/evenements/${s(e.slug)}`} className="flex gap-4 rounded-2xl border p-4 hover:bg-muted">
              <EventDate startsAt={s(e.startsAt)} timezone={s(e.timezone)} />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">
                  {s(e.title)} <DemoBadge show={Boolean(e.isDemo)} />
                </span>
                <span className="block text-sm text-muted-foreground">
                  {formatInZone(s(e.startsAt), s(e.timezone), { dateStyle: "medium", timeStyle: "short" })} · {s(e.venueName) || s(e.cityName)}
                </span>
                {e.status === "cancelled" && <span className="text-sm font-semibold text-destructive">Annulé</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  const base = type === "commerces" ? "commerces" : type === "actualites" ? "actualites" : "lieux";
  const kind = type === "commerces" ? "business" : type === "actualites" ? "news" : "place";
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => {
        const title = s(it.name ?? it.title);
        return (
          <li key={it.id}>
            <Link href={`/${base}/${s(it.slug)}`} className="block rounded-2xl hover:opacity-90">
              <Cover src={(it.coverUrl as string | null) ?? null} title={title} kind={kind} />
              <span className="mt-2 flex flex-wrap items-center gap-2 font-semibold">
                {title} {it.verification ? <VerifiedBadge status={s(it.verification)} /> : null} <DemoBadge show={Boolean(it.isDemo)} />
              </span>
              <span className="line-clamp-2 text-sm text-muted-foreground">{s(it.summary ?? it.description) || s(it.categoryName)}</span>
              <span className="text-xs text-muted-foreground">{s(it.cityName)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
