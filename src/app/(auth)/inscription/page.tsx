import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Créer un compte" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold">Rejoindre Voisino</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Gratuit, sans publicité ciblée. Votre position n&apos;est jamais requise.</p>
      <SignUpForm />
      <p className="mt-6 text-center text-sm">
        Déjà inscrit ?{" "}
        <Link href="/connexion" className="font-semibold text-primary underline-offset-4 hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
