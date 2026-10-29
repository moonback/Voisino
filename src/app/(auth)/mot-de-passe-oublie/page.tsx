import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold">Mot de passe oublié</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Indiquez votre adresse : nous vous enverrons un lien de réinitialisation.</p>
      <ForgotForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/connexion" className="font-semibold text-primary underline-offset-4 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </>
  );
}
