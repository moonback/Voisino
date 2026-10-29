"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Download, Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { appealDecision, updateNotificationPrefs, updatePrivacy, updateProfile } from "@/server/actions/account";
import { blockUser } from "@/server/actions/social";
import { authClient } from "@/lib/auth-client";
import { uploadFile } from "@/lib/upload";
import { profileSchema } from "@/lib/validation";
import { TimeAgo } from "./bits";
import { UserAvatar } from "./user-avatar";

export function ProfileForm({ initial }: { initial: { name: string; username: string; bio: string; image: string | null } }) {
  const router = useRouter();
  const [image, setImage] = useState(initial.image);
  const [uploading, setUploading] = useState(false);
  const form = useForm<z.input<typeof profileSchema>, unknown, z.output<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: initial.name, username: initial.username, bio: initial.bio, imageAssetId: "" },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async () => {
    const res = await updateProfile(form.getValues());
    if (!res.ok) {
      if (res.code === "CONFLICT") form.setError("username", { message: res.error });
      return void toast.error(res.error);
    }
    toast.success("Profil enregistré.");
    router.refresh();
  });
  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <div className="flex items-center gap-4">
        <UserAvatar name={form.watch("name")} image={image} className="size-20" />
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          Changer la photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={async (ev) => {
              const f = ev.target.files?.[0];
              if (!f) return;
              setUploading(true);
              try {
                const { assetId } = await uploadFile(f, "image", () => {}).promise;
                form.setValue("imageAssetId", assetId);
                setImage(URL.createObjectURL(f));
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-name">Nom affiché</Label>
        <Input id="p-name" className="h-11" {...form.register("name")} aria-invalid={Boolean(e.name)} />
        {e.name && <p className="text-sm text-destructive">{e.name.message}</p>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-username">Pseudonyme</Label>
        <div className="relative">
          <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">@</span>
          <Input id="p-username" className="h-11 pl-7" {...form.register("username")} aria-invalid={Boolean(e.username)} autoCapitalize="off" />
        </div>
        {e.username ? <p className="text-sm text-destructive">{e.username.message}</p> : <p className="text-xs text-muted-foreground">Lettres minuscules, chiffres, point et tiret bas.</p>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-bio">Biographie</Label>
        <Textarea id="p-bio" rows={3} maxLength={300} {...form.register("bio")} />
      </div>
      <Button type="submit" size="lg" className="justify-self-start" disabled={form.formState.isSubmitting || uploading}>
        {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Enregistrer
      </Button>
    </form>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function PrivacyForm({ initial }: { initial: { isPrivate: boolean; allowComments: boolean } }) {
  const [values, setValues] = useState(initial);
  const [, start] = useTransition();
  const set = (patch: Partial<typeof values>) => {
    const next = { ...values, ...patch };
    setValues(next);
    start(async () => {
      const res = await updatePrivacy(next);
      if (!res.ok) {
        setValues(values);
        return void toast.error(res.error);
      }
      toast.success("Préférences de confidentialité enregistrées.");
    });
  };
  return (
    <div className="grid gap-3">
      <Toggle label="Compte privé" hint="Seuls vos abonnés acceptés voient vos vidéos ; les nouvelles demandes doivent être validées." checked={values.isPrivate} onChange={(v) => set({ isPrivate: v })} />
      <Toggle label="Autoriser les commentaires" hint="S'applique à toutes vos vidéos." checked={values.allowComments} onChange={(v) => set({ allowComments: v })} />
    </div>
  );
}

export function NotificationPrefsForm({ types, initial }: { types: { key: string; label: string }[]; initial: Record<string, boolean> }) {
  const [prefs, setPrefs] = useState(initial);
  const [, start] = useTransition();
  return (
    <div className="grid gap-3">
      {types.map((t) => (
        <Toggle
          key={t.key}
          label={t.label}
          checked={prefs[t.key] !== false}
          onChange={(v) => {
            const next = { ...prefs, [t.key]: v };
            setPrefs(next);
            start(async () => {
              const res = await updateNotificationPrefs(next);
              if (!res.ok) toast.error(res.error);
            });
          }}
        />
      ))}
      <p className="text-sm text-muted-foreground">Les notifications administratives (modération, comptes professionnels, échec de traitement) restent toujours actives.</p>
    </div>
  );
}

export function BlockedList({ users }: { users: { id: string; name: string; username: string; image: string | null }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!users.length) return <p className="text-muted-foreground">Vous n&apos;avez bloqué personne.</p>;
  return (
    <ul className="divide-y rounded-2xl border">
      {users.map((u) => (
        <li key={u.id} className="flex items-center gap-3 p-3">
          <UserAvatar name={u.name} image={u.image} className="size-9" />
          <span className="flex-1 font-medium">@{u.username}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await blockUser(u.id, false);
                if (!res.ok) return void toast.error(res.error);
                toast.success(`@${u.username} est débloqué.`);
                router.refresh();
              })
            }
          >
            Débloquer
          </Button>
        </li>
      ))}
    </ul>
  );
}

const ACTION_LABELS: Record<string, string> = {
  hide: "Contenu masqué",
  remove: "Contenu retiré",
  restore: "Contenu rétabli",
  warn: "Avertissement",
  restrict: "Compte restreint",
  suspend: "Compte suspendu",
  reactivate: "Compte réactivé",
};

export function ModerationDecisions({ decisions }: { decisions: { id: string; action: string; reason: string; createdAt: Date | string; appealStatus: string | null }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!decisions.length) return <p className="text-muted-foreground">Aucune décision de modération ne vous concerne.</p>;
  return (
    <ul className="grid gap-3">
      {decisions.map((d) => (
        <li key={d.id} className="rounded-2xl border p-4">
          <p className="font-semibold">{ACTION_LABELS[d.action] ?? d.action}</p>
          <p className="text-sm text-muted-foreground">
            Motif : {d.reason} · <TimeAgo date={d.createdAt} />
          </p>
          {d.appealStatus ? (
            <p className="mt-2 text-sm font-medium">Contestation : {d.appealStatus === "pending" ? "en cours d'examen" : d.appealStatus === "approved" ? "acceptée" : "refusée"}</p>
          ) : ["hide", "remove", "warn", "restrict"].includes(d.action) && open !== d.id ? (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setOpen(d.id)}>
              Contester cette décision
            </Button>
          ) : null}
          {open === d.id && (
            <div className="mt-3 grid gap-2">
              <Label htmlFor={`appeal-${d.id}`}>Expliquez pourquoi cette décision vous semble injustifiée</Label>
              <Textarea id={`appeal-${d.id}`} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await appealDecision(d.id, message);
                      if (!res.ok) return void toast.error(res.error);
                      toast.success("Contestation envoyée.");
                      setOpen(null);
                      setMessage("");
                      router.refresh();
                    })
                  }
                >
                  Envoyer
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AccountActions() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="lg">
          <a href="/api/me/export" download>
            <Download /> Télécharger mes données (JSON)
          </a>
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={async () => {
            await authClient.signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut /> Se déconnecter
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={async () => {
            const { error } = await authClient.revokeOtherSessions();
            if (error) toast.error("Impossible de fermer les autres sessions.");
            else toast.success("Vos autres appareils ont été déconnectés.");
          }}
        >
          Déconnecter mes autres appareils
        </Button>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="lg" className="justify-self-start">
            Supprimer mon compte
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement votre compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vos vidéos (et leurs fichiers), commentaires, j&apos;aime, favoris et abonnements seront effacés. Cette action est irréversible. Pensez à télécharger vos données avant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="del-pw">Confirmez avec votre mot de passe</Label>
            <Input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!password || pending}
              onClick={async () => {
                setPending(true);
                const { error } = await authClient.deleteUser({ password });
                setPending(false);
                if (error) return void toast.error(error.code === "INVALID_PASSWORD" ? "Mot de passe incorrect." : "La suppression a échoué.");
                toast.success("Votre compte a été supprimé.");
                router.push("/");
                router.refresh();
              }}
            >
              {pending && <Loader2 className="animate-spin" />} Supprimer définitivement
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
