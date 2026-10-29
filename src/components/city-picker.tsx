"use client";

import { Check, Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { chooseCity } from "@/server/actions/city";
import { cn } from "@/lib/utils";

type CityOption = { id: string; slug: string; name: string; region: string | null; distanceKm?: number };

/** Liste + recherche de villes, avec géolocalisation facultative (jamais stockée). */
export function CityPicker({ current, onDone }: { current?: string | null; onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cities, setCities] = useState<CityOption[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [suggested, setSuggested] = useState<CityOption | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/cities?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(setCities)
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function pick(slug: string) {
    start(async () => {
      const res = await chooseCity(slug);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Bienvenue à ${res.data.name} !`);
      onDone?.();
      router.refresh();
    });
  }

  function locate() {
    if (!("geolocation" in navigator)) return void toast.error("La géolocalisation n'est pas disponible sur cet appareil.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`/api/cities?lat=${pos.coords.latitude.toFixed(3)}&lng=${pos.coords.longitude.toFixed(3)}`);
          const city = (await r.json()) as CityOption | null;
          if (city) setSuggested(city);
          else toast.info("Aucune ville Voisino à proximité pour le moment. Choisissez-en une dans la liste.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        toast.info("Localisation refusée : aucun souci, choisissez votre ville dans la liste.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="city-search" className="sr-only">
          Rechercher une ville
        </label>
        <Input id="city-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une ville…" className="h-11 pl-9 text-base" autoComplete="off" />
      </div>
      <Button type="button" variant="outline" size="lg" className="h-11 justify-start gap-2" onClick={locate} disabled={locating}>
        {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
        Me proposer la ville la plus proche
      </Button>
      <p className="-mt-2 text-xs text-muted-foreground">Facultatif. Votre position sert uniquement à suggérer une ville : elle n&apos;est ni enregistrée ni partagée.</p>
      {suggested && (
        <button
          onClick={() => pick(suggested.slug)}
          className="flex items-center gap-3 rounded-xl border-2 border-primary bg-brand-soft p-3 text-left"
          disabled={pending}
        >
          <LocateFixed className="size-5 text-primary" aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-semibold">{suggested.name}</span>
            <span className="text-sm text-muted-foreground">Ville la plus proche · {Math.round(suggested.distanceKm ?? 0)} km</span>
          </span>
          <span className="text-sm font-semibold text-primary">Choisir</span>
        </button>
      )}
      <ul className="flex max-h-[45dvh] flex-col gap-1 overflow-y-auto" aria-label="Villes disponibles" aria-busy={cities === null}>
        {cities === null &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        {cities?.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Aucune ville ne correspond à « {q} ».</li>}
        {cities?.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => pick(c.slug)}
              disabled={pending}
              className={cn("flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted", current === c.slug && "bg-muted")}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
                <MapPin className="size-5 text-accent" aria-hidden="true" />
              </span>
              <span className="flex-1">
                <span className="block font-medium">{c.name}</span>
                {c.region && <span className="text-sm text-muted-foreground">{c.region}</span>}
              </span>
              {current === c.slug && <Check className="size-5 text-primary" aria-label="Ville actuelle" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CityPickerDialog({ current, children }: { current: string | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Changer de ville</DialogTitle>
          <DialogDescription>Votre flux, vos actualités et vos sorties s&apos;adaptent à la ville choisie.</DialogDescription>
        </DialogHeader>
        <CityPicker current={current} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
