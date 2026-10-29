"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Film, Loader2, LocateFixed, RotateCcw, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { publishVideo, videoStatus } from "@/server/actions/videos";
import { extractHashtags } from "@/lib/text";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { VISIBILITIES } from "@/lib/validation";

type Option = { id: string; name: string };
type CityOpt = { id: string; name: string; zones: Option[] };

const ACCEPT = ["video/mp4", "video/quicktime", "video/webm"];

const formSchema = z.object({
  caption: z.string().max(500, "500 caractères maximum"),
  hashtags: z.string().max(300),
  cityId: z.uuid("Choisissez une ville"),
  zoneId: z.string(),
  categoryId: z.string(),
  businessId: z.string(),
  eventId: z.string(),
  placeId: z.string(),
  visibility: z.enum(["public", "followers", "private"]),
  allowComments: z.boolean(),
  shareLocation: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

const selectCls = "h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export function PublishForm({ cities, defaultCityId, categories, links, maxMb, maxSeconds }: {
  cities: CityOpt[];
  defaultCityId: string | null;
  categories: Option[];
  links: { cityId: string; businesses: Option[]; events: Option[]; places: Option[] } | null;
  maxMb: number;
  maxSeconds: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"edit" | "processing" | "done" | "failed">("edit");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      caption: "",
      hashtags: "",
      cityId: defaultCityId ?? "",
      zoneId: "",
      categoryId: "",
      businessId: "",
      eventId: "",
      placeId: "",
      visibility: "public",
      allowComments: true,
      shareLocation: false,
    },
  });
  const cityId = form.watch("cityId");
  const caption = form.watch("caption");
  const city = cities.find((c) => c.id === cityId);
  const linkOpts = links && links.cityId === cityId ? links : null;

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function choose(f: File | undefined) {
    if (!f) return;
    setUploadError(null);
    if (!ACCEPT.includes(f.type)) return setUploadError("Format non pris en charge : MP4, MOV ou WebM.");
    if (f.size > maxMb * 1024 * 1024) return setUploadError(`Fichier trop volumineux (maximum ${maxMb} Mo).`);
    const url = URL.createObjectURL(f);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      if (probe.duration > maxSeconds + 1) {
        URL.revokeObjectURL(url);
        setUploadError(`La vidéo dure ${Math.round(probe.duration)} s : maximum ${maxSeconds} s.`);
        return;
      }
      setFile(f);
      setPreview(url);
      start(f);
    };
    probe.onerror = () => {
      // Certains formats ne sont pas lisibles par le navigateur mais le serveur saura les convertir.
      setFile(f);
      setPreview(null);
      start(f);
    };
    probe.src = url;
  }

  function start(f: File) {
    setProgress(0);
    setAssetId(null);
    const { promise, abort } = uploadFile(f, "video", setProgress);
    abortRef.current = abort;
    promise.then(
      (r) => setAssetId(r.assetId),
      (e: Error) => setUploadError(e.message),
    );
  }

  function reset() {
    abortRef.current?.();
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setAssetId(null);
    setProgress(0);
    setUploadError(null);
  }

  async function locate(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 10000, maximumAge: 300000 },
      );
    });
  }

  async function onSubmit(values: FormValues) {
    if (!assetId) return void toast.error("Attendez la fin du téléversement.");
    const location = values.shareLocation ? await locate() : null;
    if (values.shareLocation && !location) toast.info("Position indisponible : la vidéo sera publiée sans position.");
    const res = await publishVideo({
      assetId,
      caption: values.caption,
      hashtags: values.hashtags.split(/[\s,]+/).filter(Boolean),
      cityId: values.cityId,
      zoneId: values.zoneId,
      categoryId: values.categoryId,
      businessId: linkOpts ? values.businessId : "",
      eventId: linkOpts ? values.eventId : "",
      placeId: linkOpts ? values.placeId : "",
      visibility: values.visibility,
      allowComments: values.allowComments,
      location,
    });
    if (!res.ok) {
      if (res.fieldErrors) for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as keyof FormValues, { message: v[0] });
      return void toast.error(res.error);
    }
    setVideoId(res.data.id);
    setPhase("processing");
  }

  // Suivi du traitement serveur.
  useEffect(() => {
    if (phase !== "processing" || !videoId) return;
    const t = setInterval(async () => {
      const res = await videoStatus(videoId);
      if (!res.ok) return;
      if (res.data.status === "published") setPhase("done");
      else if (res.data.status === "failed") setPhase("failed");
    }, 2000);
    return () => clearInterval(t);
  }, [phase, videoId]);

  if (phase !== "edit") {
    return (
      <div className="flex flex-col items-center rounded-3xl border bg-card px-6 py-14 text-center" role="status" aria-live="polite">
        {phase === "processing" && (
          <>
            <Loader2 className="size-10 animate-spin text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-bold">Traitement de votre vidéo…</h2>
            <p className="mt-1 max-w-sm text-muted-foreground">Nous l&apos;optimisons pour une lecture fluide sur tous les appareils. Vous pouvez quitter cette page : vous serez notifié.</p>
          </>
        )}
        {phase === "done" && (
          <>
            <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-bold">Votre vidéo est en ligne !</h2>
            <div className="mt-5 flex gap-2">
              <Button asChild size="lg">
                <Link href={`/v/${videoId}`}>Voir ma vidéo</Link>
              </Button>
              <Button size="lg" variant="outline" onClick={() => (reset(), form.reset(), setPhase("edit"))}>
                Publier une autre vidéo
              </Button>
            </div>
          </>
        )}
        {phase === "failed" && (
          <>
            <X className="size-12 text-destructive" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-bold">Le traitement a échoué</h2>
            <p className="mt-1 text-muted-foreground">Le fichier est peut-être corrompu ou trop long. Vous avez reçu une notification détaillée.</p>
            <Button className="mt-5" size="lg" onClick={() => (reset(), setPhase("edit"))}>
              <RotateCcw /> Réessayer avec un autre fichier
            </Button>
          </>
        )}
      </div>
    );
  }

  const err = form.formState.errors;
  const tagsPreview = [...new Set([...extractHashtags(caption), ...form.watch("hashtags").split(/[\s,]+/).filter(Boolean).map((t) => t.replace(/^#/, "").toLowerCase())])].slice(0, 10);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-8 md:grid-cols-[minmax(0,300px)_1fr]" noValidate>
      {/* Fichier et aperçu */}
      <div>
        {!file ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files[0]);
            }}
            className={cn("flex aspect-[9/16] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed p-6 text-center transition-colors", dragging ? "border-primary bg-brand-soft" : "bg-muted/50")}
          >
            <UploadCloud className="size-10 text-primary" aria-hidden="true" />
            <p className="font-semibold">Déposez votre vidéo ici</p>
            <p className="text-sm text-muted-foreground">
              MP4, MOV ou WebM · {maxSeconds} s · {maxMb} Mo max.
            </p>
            <Button type="button" onClick={() => inputRef.current?.click()}>
              Choisir un fichier
            </Button>
            <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="sr-only" onChange={(e) => choose(e.target.files?.[0])} aria-label="Fichier vidéo" />
          </div>
        ) : (
          <div className="relative aspect-[9/16] overflow-hidden rounded-3xl bg-black">
            {preview ? (
              <video src={preview} className="h-full w-full object-cover" controls muted playsInline aria-label="Aperçu de la vidéo" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-white">
                <Film className="size-8" aria-hidden="true" />
                <p className="px-4 text-center text-sm">Aperçu indisponible dans ce navigateur. La vidéo sera convertie à la publication.</p>
              </div>
            )}
            <button type="button" onClick={reset} className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Retirer cette vidéo">
              <X className="size-5" />
            </button>
          </div>
        )}
        {file && (
          <div className="mt-3" aria-live="polite">
            <div className="flex justify-between text-sm">
              <span className="truncate font-medium">{file.name}</span>
              <span className="text-muted-foreground">{assetId ? "Envoyé" : uploadError ? "Échec" : `${Math.round(progress * 100)} %`}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progression du téléversement" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full transition-[width]", assetId ? "bg-success" : "bg-primary")} style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        )}
        {uploadError && (
          <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {uploadError}{" "}
            {file && (
              <button type="button" className="font-semibold underline" onClick={() => start(file)}>
                Réessayer
              </button>
            )}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">L&apos;image de couverture est générée automatiquement à partir de la vidéo. Les métadonnées du fichier (dont la position GPS) sont supprimées.</p>
      </div>

      {/* Détails */}
      <div className="grid content-start gap-5">
        <div className="grid gap-1.5">
          <Label htmlFor="caption">Légende</Label>
          <Textarea id="caption" rows={4} maxLength={500} placeholder="Racontez ce qui se passe… #hashtags @mentions" {...form.register("caption")} aria-invalid={Boolean(err.caption)} aria-describedby="caption-help" />
          <p id="caption-help" className="flex justify-between text-xs text-muted-foreground">
            <span>{err.caption?.message}</span>
            <span>{caption.length}/500</span>
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hashtags">Hashtags supplémentaires</Label>
          <input id="hashtags" className={selectCls} placeholder="marché, croixrousse" {...form.register("hashtags")} />
          {tagsPreview.length > 0 && (
            <p className="flex flex-wrap gap-1.5 text-sm">
              {tagsPreview.map((t) => (
                <span key={t} className="rounded-full bg-secondary px-2 py-0.5">
                  #{t}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cityId">Ville</Label>
            <select id="cityId" className={selectCls} {...form.register("cityId")} aria-invalid={Boolean(err.cityId)}>
              <option value="">Choisir…</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {err.cityId && <p className="text-sm text-destructive">{err.cityId.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="zoneId">Quartier (facultatif)</Label>
            <select id="zoneId" className={selectCls} {...form.register("zoneId")} disabled={!city?.zones.length}>
              <option value="">Toute la ville</option>
              {city?.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="categoryId">Catégorie</Label>
            <select id="categoryId" className={selectCls} {...form.register("categoryId")}>
              <option value="">Aucune</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="grid gap-3 rounded-2xl border p-4">
          <legend className="px-1 text-sm font-semibold">Associer (facultatif)</legend>
          {linkOpts ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["businessId", "Commerce", linkOpts.businesses],
                  ["eventId", "Événement", linkOpts.events],
                  ["placeId", "Lieu", linkOpts.places],
                ] as const
              ).map(([name, label, opts]) => (
                <div key={name} className="grid gap-1.5">
                  <Label htmlFor={name}>{label}</Label>
                  <select id={name} className={selectCls} {...form.register(name)}>
                    <option value="">Aucun</option>
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Les associations sont proposées pour votre ville courante.</p>
          )}
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Visibilité</legend>
          {VISIBILITIES.map((v) => (
            <label key={v.value} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-checked:border-primary has-checked:bg-brand-soft">
              <input type="radio" value={v.value} {...form.register("visibility")} className="mt-1 accent-primary" />
              <span>
                <span className="block font-medium">{v.label}</span>
                <span className="text-sm text-muted-foreground">{v.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
          <span>
            <span className="block font-medium">Autoriser les commentaires</span>
          </span>
          <Switch checked={form.watch("allowComments")} onCheckedChange={(v) => form.setValue("allowComments", v)} />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <LocateFixed className="size-4" aria-hidden="true" /> Ajouter ma position approximative
            </span>
            <span className="text-sm text-muted-foreground">Arrondie à environ 100 m, jamais l&apos;adresse exacte. Désactivé par défaut.</span>
          </span>
          <Switch checked={form.watch("shareLocation")} onCheckedChange={(v) => form.setValue("shareLocation", v)} />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" className="h-12 px-6 text-base" disabled={!assetId || form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Publier
          </Button>
          {!file && <span className="text-sm text-muted-foreground">Choisissez d&apos;abord une vidéo.</span>}
          {file && !assetId && !uploadError && <span className="text-sm text-muted-foreground">Téléversement en cours…</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          En publiant, vous confirmez respecter les{" "}
          <Link href="/infos/regles" className="underline">
            règles de la communauté
          </Link>{" "}
          et avoir l&apos;accord des personnes identifiables.
        </p>
      </div>
    </form>
  );
}
