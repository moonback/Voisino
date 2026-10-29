"use client";

import { Ban, Flag, MoreHorizontal, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { blockUser } from "@/server/actions/social";
import { useAuthGate } from "./auth-gate";
import { ReportDialog } from "./report-dialog";

/** Menu d'un profil tiers : partager, signaler, bloquer (avec confirmation). */
export function ProfileActions({ userId, username, blocking, signedIn }: { userId: string; username: string; blocking: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState(false);
  const [pending, start] = useTransition();
  const gate = useAuthGate(signedIn);

  function toggleBlock() {
    start(async () => {
      const res = await blockUser(userId, !blocking);
      if (!res.ok) return void toast.error(res.error);
      toast.success(blocking ? `@${username} est débloqué.` : `@${username} est bloqué.`);
      setConfirm(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-lg" aria-label="Plus d'actions sur ce profil">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={async () => {
              await navigator.clipboard.writeText(`${location.origin}/u/${username}`);
              toast.success("Lien du profil copié.");
            }}
          >
            <Share2 /> Copier le lien du profil
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => gate("signaler ce profil") && setReport(true)}>
            <Flag /> Signaler
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => gate("bloquer ce compte") && setConfirm(true)} className="text-destructive">
            <Ban /> {blocking ? "Débloquer" : "Bloquer"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{blocking ? `Débloquer @${username} ?` : `Bloquer @${username} ?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {blocking
                ? "Vous pourrez à nouveau voir ses contenus et interagir."
                : "Vous ne verrez plus ses vidéos ni ses commentaires, et il ne pourra plus voir les vôtres. Vos abonnements mutuels seront supprimés."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={toggleBlock} disabled={pending}>
              {blocking ? "Débloquer" : "Bloquer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReportDialog open={report} onOpenChange={setReport} targetType="user" targetId={userId} />
    </>
  );
}
