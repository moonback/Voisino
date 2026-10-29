"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { forgotSchema, resetSchema, signInSchema, signUpSchema } from "@/lib/validation";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Adresse e-mail ou mot de passe incorrect.",
  USER_ALREADY_EXISTS: "Un compte existe déjà avec cette adresse. Connectez-vous ou réinitialisez votre mot de passe.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec cette adresse.",
  PASSWORD_TOO_SHORT: "Mot de passe trop court (10 caractères minimum).",
  INVALID_TOKEN: "Ce lien n'est plus valide. Demandez un nouveau lien.",
  SIGNUP_CLOSED: "Les inscriptions sont temporairement fermées.",
};
const errorText = (e: { code?: string; message?: string; status?: number } | null) =>
  (e?.code && MESSAGES[e.code]) || (e?.status === 429 ? "Trop de tentatives. Patientez quelques minutes." : e?.message) || "Une erreur est survenue. Réessayez.";

/** Sécurise la redirection « suite » : chemin interne uniquement. */
const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/");

function Field<T extends FieldValues>({ form, name, label, type = "text", autoComplete, hint }: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  const error = form.formState.errors[name]?.message as string | undefined;
  const id = `f-${name}`;
  const isPassword = type === "password";
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={isPassword && show ? "text" : type}
          autoComplete={autoComplete}
          className="h-11 text-base"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          {...form.register(name)}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-err`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

export function SignInForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("suite"));
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const { error } = await authClient.signIn.email({ email: v.email, password: v.password });
    if (error) return setError(errorText(error));
    router.push(next);
    router.refresh();
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={error} />
      <Field form={form} name="email" label="Adresse e-mail" type="email" autoComplete="email" />
      <Field form={form} name="password" label="Mot de passe" type="password" autoComplete="current-password" />
      <Link href="/mot-de-passe-oublie" className="-mt-2 justify-self-end text-sm font-medium text-primary underline-offset-4 hover:underline">
        Mot de passe oublié ?
      </Link>
      <Submit pending={form.formState.isSubmitting}>Se connecter</Submit>
    </form>
  );
}

export function SignUpForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(signUpSchema), defaultValues: { name: "", email: "", password: "", terms: false as unknown as true } });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const { error } = await authClient.signUp.email({ name: v.name, email: v.email, password: v.password, callbackURL: "/" });
    if (error) return setError(errorText(error));
    setSentTo(v.email);
  });
  if (sentTo) {
    return (
      <div className="flex flex-col items-center text-center" role="status">
        <MailCheck className="size-12 text-primary" aria-hidden="true" />
        <h2 className="mt-3 text-xl font-bold">Vérifiez votre boîte e-mail</h2>
        <p className="mt-1 text-muted-foreground">
          Un lien de confirmation a été envoyé à <strong>{sentTo}</strong>. Vous êtes déjà connecté et pouvez parcourir Voisino ; la confirmation est nécessaire pour publier.
        </p>
        <Button asChild className="mt-5" size="lg">
          <Link href="/">Découvrir le flux</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={error} />
      <Field form={form} name="name" label="Nom affiché" autoComplete="name" hint="Visible sur votre profil. Vous pourrez choisir votre pseudonyme ensuite." />
      <Field form={form} name="email" label="Adresse e-mail" type="email" autoComplete="email" />
      <Field form={form} name="password" label="Mot de passe" type="password" autoComplete="new-password" hint="10 caractères minimum. Une phrase de passe est idéale." />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" {...form.register("terms")} aria-invalid={Boolean(form.formState.errors.terms)} />
        <span>
          J&apos;accepte les{" "}
          <Link href="/infos/regles" className="font-medium underline">
            règles de la communauté
          </Link>{" "}
          et la{" "}
          <Link href="/infos/confidentialite" className="font-medium underline">
            politique de confidentialité
          </Link>
          .
        </span>
      </label>
      {form.formState.errors.terms && (
        <p className="-mt-2 text-sm text-destructive" role="alert">
          {form.formState.errors.terms.message}
        </p>
      )}
      <Submit pending={form.formState.isSubmitting}>Créer mon compte</Submit>
    </form>
  );
}

export function ForgotForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email: v.email, redirectTo: "/reinitialiser" });
    if (error && error.status === 429) return setError(errorText(error));
    setDone(true); // même message que le compte existe ou non (pas d'énumération)
  });
  if (done) {
    return (
      <p className="rounded-xl bg-muted p-4" role="status">
        Si un compte est associé à cette adresse, vous allez recevoir un lien pour choisir un nouveau mot de passe (valable 1 heure).
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={error} />
      <Field form={form} name="email" label="Adresse e-mail" type="email" autoComplete="email" />
      <Submit pending={form.formState.isSubmitting}>Envoyer le lien</Submit>
    </form>
  );
}

export function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(params.get("error") ? MESSAGES.INVALID_TOKEN! : null);
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  const onSubmit = form.handleSubmit(async (v) => {
    if (!token) return setError(MESSAGES.INVALID_TOKEN!);
    const { error } = await authClient.resetPassword({ newPassword: v.password, token });
    if (error) return setError(errorText(error));
    toast.success("Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.");
    router.push("/connexion");
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={error} />
      <Field form={form} name="password" label="Nouveau mot de passe" type="password" autoComplete="new-password" hint="10 caractères minimum." />
      <Field form={form} name="confirm" label="Confirmez le mot de passe" type="password" autoComplete="new-password" />
      <Submit pending={form.formState.isSubmitting}>Enregistrer</Submit>
    </form>
  );
}

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  return (
    <Button
      size="lg"
      disabled={state !== "idle"}
      onClick={async () => {
        setState("sending");
        const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/publier" });
        if (error) {
          toast.error(errorText(error));
          return setState("idle");
        }
        setState("sent");
        toast.success("E-mail de confirmation renvoyé.");
      }}
    >
      {state === "sending" && <Loader2 className="animate-spin" />}
      {state === "sent" ? "E-mail envoyé" : "Renvoyer l'e-mail de confirmation"}
    </Button>
  );
}
