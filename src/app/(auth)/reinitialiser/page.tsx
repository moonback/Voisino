import type { Metadata } from "next";
import { ResetForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function ResetPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold">Nouveau mot de passe</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Vos autres sessions seront déconnectées par sécurité.</p>
      <ResetForm />
    </>
  );
}
