"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createBusiness, saveEvent, saveNews, updateBusiness } from "@/server/actions/content";
import { uploadFile } from "@/lib/upload";
import { businessSchema, DAY_LABELS, eventSchema, newsSchema } from "@/lib/validation";

type Option = { id: string; name: string };
const control = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive";

function F<T extends FieldValues>({ form, name, label, hint, as = "input", type = "text", options, rows = 4 }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- seules les valeurs saisies (entrée) nous intéressent
  form: UseFormReturn<T, any, any>;
  name: Path<T>;
  label: string;
  hint?: string;
  as?: "input" | "textarea" | "select";
  type?: string;
  options?: Option[];
  rows?: number;
}) {
  const error = form.formState.errors[name]?.message as string | undefined;
  const id = `c-${name}`;
  const common = { id, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-e` : hint ? `${id}-h` : undefined, className: control, ...form.register(name) };
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {as === "textarea" ? (
        <textarea rows={rows} {...common} />
      ) : as === "select" ? (
        <select {...common}>
          <option value="">—</option>
          {options?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : (
        <input type={type} {...common} />
      )}
      {error ? (
        <p id={`${id}-e`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-h`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** Image de couverture : téléversée, réencodée et nettoyée de ses métadonnées par le serveur. */
function CoverInput({ onUploaded }: { onUploaded: (assetId: string) => void }) {
  const [state, setState] = useState<"idle" | "uploading" | "done">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Image (facultative)</span>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 hover:bg-muted">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu local
          <img src={preview} alt="" className="size-16 rounded-lg object-cover" />
        ) : (
          <ImagePlus className="size-6 text-primary" aria-hidden="true" />
        )}
        <span className="text-sm">{state === "uploading" ? "Envoi…" : state === "done" ? "Image prête" : "JPEG, PNG ou WebP · 8 Mo max."}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setPreview(URL.createObjectURL(f));
            setState("uploading");
            try {
              const { assetId } = await uploadFile(f, "image", () => {}).promise;
              onUploaded(assetId);
              setState("done");
            } catch (err) {
              toast.error((err as Error).message);
              setState("idle");
            }
          }}
        />
      </label>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- formulaire générique
function useSubmit<T>(fn: (v: T) => Promise<{ ok: true; data: { slug: string } } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }>, base: string, form: UseFormReturn<any, any, any>) {
  const router = useRouter();
  return async (v: T) => {
    const res = await fn(v);
    if (!res.ok) {
      for (const [k, msgs] of Object.entries(res.fieldErrors ?? {})) form.setError(k, { message: msgs[0] });
      return void toast.error(res.error);
    }
    toast.success("Enregistré.");
    router.push(`${base}/${res.data.slug}`);
    router.refresh();
  };
}

export function BusinessForm({ cities, categories, defaultCityId, initial }: {
  cities: Option[];
  categories: Option[];
  defaultCityId: string | null;
  initial?: { id: string; values: z.input<typeof businessSchema>; slug: string };
}) {
  const form = useForm<z.input<typeof businessSchema>, unknown, z.output<typeof businessSchema>>({
    resolver: zodResolver(businessSchema),
    defaultValues: initial?.values ?? { name: "", cityId: defaultCityId ?? "", categoryId: "", description: "", address: "", phone: "", email: "", website: "", hours: {} },
  });
  const router = useRouter();
  const submit = async (v: z.input<typeof businessSchema>) => {
    const res = initial ? await updateBusiness(initial.id, v) : await createBusiness(v);
    if (!res.ok) return void toast.error(res.error);
    toast.success(initial ? "Fiche mise à jour." : "Fiche créée : elle sera vérifiée par l'équipe locale.");
    router.push(`/commerces/${initial ? initial.slug : (res.data as { slug: string }).slug}`);
    router.refresh();
  };
  return (
    <form onSubmit={form.handleSubmit(() => submit(form.getValues()))} className="grid gap-5" noValidate>
      <F form={form} name="name" label="Nom du commerce" />
      <div className="grid gap-4 sm:grid-cols-2">
        {!initial && <F form={form} name="cityId" label="Ville" as="select" options={cities} />}
        <F form={form} name="categoryId" label="Catégorie" as="select" options={categories} />
      </div>
      <F form={form} name="description" label="Présentation" as="textarea" />
      <F form={form} name="address" label="Adresse professionnelle" hint="Adresse publique de l'établissement (jamais une adresse personnelle)." />
      <div className="grid gap-4 sm:grid-cols-3">
        <F form={form} name="phone" label="Téléphone" type="tel" />
        <F form={form} name="email" label="E-mail public" type="email" />
        <F form={form} name="website" label="Site web" type="url" />
      </div>
      <fieldset className="grid gap-2 rounded-2xl border p-4">
        <legend className="px-1 text-sm font-semibold">Horaires</legend>
        {(Object.keys(DAY_LABELS) as (keyof typeof DAY_LABELS)[]).map((d) => (
          <div key={d} className="grid grid-cols-[110px_1fr] items-center gap-3">
            <Label htmlFor={`h-${d}`}>{DAY_LABELS[d]}</Label>
            <input id={`h-${d}`} className={control} placeholder="Ex. : 9h – 19h (vide = fermé)" {...form.register(`hours.${d}`)} />
          </div>
        ))}
      </fieldset>
      <Button type="submit" size="lg" className="justify-self-start" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
        {initial ? "Enregistrer" : "Créer la fiche"}
      </Button>
    </form>
  );
}

export function EventForm({ cities, categories, businesses, defaultCityId }: { cities: Option[]; categories: Option[]; businesses: Option[]; defaultCityId: string | null }) {
  const form = useForm<z.input<typeof eventSchema>, unknown, z.output<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: { title: "", description: "", cityId: defaultCityId ?? "", categoryId: "", businessId: "", venueName: "", address: "", startsAtLocal: "", endsAtLocal: "", conditions: "", externalUrl: "", capacity: null, coverAssetId: "" },
  });
  const submit = useSubmit((v: z.input<typeof eventSchema>) => saveEvent(v), "/evenements", form);
  return (
    <form onSubmit={form.handleSubmit(() => submit(form.getValues()))} className="grid gap-5" noValidate>
      <F form={form} name="title" label="Titre" />
      <F form={form} name="description" label="Description" as="textarea" rows={5} />
      <div className="grid gap-4 sm:grid-cols-2">
        <F form={form} name="cityId" label="Ville" as="select" options={cities} />
        <F form={form} name="categoryId" label="Catégorie" as="select" options={categories} />
        <F form={form} name="startsAtLocal" label="Début" type="datetime-local" hint="Heure locale de la ville." />
        <F form={form} name="endsAtLocal" label="Fin" type="datetime-local" />
        <F form={form} name="venueName" label="Lieu" />
        <F form={form} name="address" label="Adresse" />
      </div>
      <F form={form} name="conditions" label="Conditions de participation" hint="Gratuit, sur inscription, tarif, accessibilité…" />
      <div className="grid gap-4 sm:grid-cols-3">
        <F form={form} name="capacity" label="Places (facultatif)" type="number" />
        <F form={form} name="externalUrl" label="Lien externe" type="url" />
        {businesses.length > 0 && <F form={form} name="businessId" label="Organisé par mon commerce" as="select" options={businesses} />}
      </div>
      <CoverInput onUploaded={(id) => form.setValue("coverAssetId", id)} />
      <Button type="submit" size="lg" className="justify-self-start" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Publier l&apos;événement
      </Button>
    </form>
  );
}

export function NewsForm({ cities, categories, businesses, defaultCityId }: { cities: Option[]; categories: Option[]; businesses: Option[]; defaultCityId: string | null }) {
  const form = useForm<z.input<typeof newsSchema>, unknown, z.output<typeof newsSchema>>({
    resolver: zodResolver(newsSchema),
    defaultValues: { title: "", summary: "", body: "", cityId: defaultCityId ?? "", categoryId: "", businessId: "", sourceName: "", isBrief: false, status: "published", coverAssetId: "" },
  });
  const submit = useSubmit((v: z.input<typeof newsSchema>) => saveNews(v), "/actualites", form);
  return (
    <form onSubmit={form.handleSubmit(() => submit(form.getValues()))} className="grid gap-5" noValidate>
      <F form={form} name="title" label="Titre" />
      <F form={form} name="summary" label="Résumé" as="textarea" rows={2} />
      <F form={form} name="body" label="Contenu" as="textarea" rows={10} />
      <div className="grid gap-4 sm:grid-cols-2">
        <F form={form} name="cityId" label="Ville" as="select" options={cities} />
        <F form={form} name="categoryId" label="Catégorie" as="select" options={categories} />
        <F form={form} name="sourceName" label="Source / signature" />
        {businesses.length > 0 && <F form={form} name="businessId" label="Au nom de mon commerce" as="select" options={businesses} />}
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
        <span className="font-medium">Brève (format court)</span>
        <Switch checked={form.watch("isBrief")} onCheckedChange={(v) => form.setValue("isBrief", v)} />
      </label>
      <CoverInput onUploaded={(id) => form.setValue("coverAssetId", id)} />
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting} onClick={() => form.setValue("status", "published")}>
          Publier
        </Button>
        <Button type="submit" size="lg" variant="outline" disabled={form.formState.isSubmitting} onClick={() => form.setValue("status", "draft")}>
          Enregistrer en brouillon
        </Button>
      </div>
    </form>
  );
}
