import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Connexion" };

export default function SignInPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold">Bon retour !</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Connectez-vous pour publier, commenter et suivre vos voisins.</p>
      <SignInForm />
      <p className="mt-6 text-center text-sm">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="font-semibold text-primary underline-offset-4 hover:underline">
          Créer un compte
        </Link>
      </p>
    </>
  );
}
