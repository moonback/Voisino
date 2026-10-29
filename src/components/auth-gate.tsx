"use client";

import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

/** Retourne `true` si l'utilisateur est connecté ; sinon propose la connexion sans bloquer la consultation. */
export function useAuthGate(signedIn: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  return (what = "interagir") => {
    if (signedIn) return true;
    toast(`Connectez-vous pour ${what}`, {
      description: "La consultation reste libre ; un compte est nécessaire pour participer.",
      action: { label: "Se connecter", onClick: () => router.push(`/connexion?suite=${encodeURIComponent(pathname)}`) },
    });
    return false;
  };
}
