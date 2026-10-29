import { redirect } from "next/navigation";
import { requireViewerPage } from "@/server/session";

/** « Profil » de la navigation : redirige vers le profil public de l'utilisateur connecté. */
export default async function MyProfile() {
  const v = await requireViewerPage("/profil");
  redirect(`/u/${v.username}`);
}
