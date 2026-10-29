"use client";

import { Bookmark, CalendarPlus, Check, Flag, Share2, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cancelEvent, claimBusiness } from "@/server/actions/content";
import { followBusiness, saveItem, setAttendance } from "@/server/actions/social";
import { cn } from "@/lib/utils";
import { useAuthGate } from "./auth-gate";
import { ReportDialog } from "./report-dialog";

export function ShareButton({ path, title }: { path: string; title: string }) {
  return (
    <Button
      variant="outline"
      size="lg"
      onClick={async () => {
        const url = `${location.origin}${path}`;
        try {
          if (navigator.share) await navigator.share({ title, url });
          else {
            await navigator.clipboard.writeText(url);
            toast.success("Lien copié.");
          }
        } catch {}
      }}
    >
      <Share2 /> Partager
    </Button>
  );
}

export function SaveButton({ target, initial, signedIn }: { target: { newsId: string } | { eventId: string }; initial: boolean; signedIn: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const gate = useAuthGate(signedIn);
  return (
    <Button
      variant="outline"
      size="lg"
      aria-pressed={saved}
      disabled={pending}
      onClick={() => {
        if (!gate("enregistrer")) return;
        const next = !saved;
        setSaved(next);
        start(async () => {
          const res = await saveItem(target, next);
          if (!res.ok) {
            setSaved(!next);
            toast.error(res.error);
          }
        });
      }}
    >
      <Bookmark className={cn(saved && "fill-current")} /> {saved ? "Enregistré" : "Enregistrer"}
    </Button>
  );
}

export function ReportButton({ targetType, targetId, signedIn }: { targetType: "business" | "event" | "news"; targetId: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const gate = useAuthGate(signedIn);
  return (
    <>
      <Button variant="ghost" size="lg" onClick={() => gate("signaler") && setOpen(true)}>
        <Flag /> Signaler
      </Button>
      <ReportDialog open={open} onOpenChange={setOpen} targetType={targetType} targetId={targetId} />
    </>
  );
}

export function FollowBusinessButton({ businessId, initial, signedIn }: { businessId: string; initial: boolean; signedIn: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const gate = useAuthGate(signedIn);
  return (
    <Button
      size="lg"
      variant={on ? "outline" : "default"}
      aria-pressed={on}
      disabled={pending}
      onClick={() => {
        if (!gate("suivre ce commerce")) return;
        const next = !on;
        setOn(next);
        start(async () => {
          const res = await followBusiness(businessId, next);
          if (!res.ok) {
            setOn(!next);
            toast.error(res.error);
          }
        });
      }}
    >
      {on ? <Check /> : <Star />} {on ? "Suivi" : "Suivre"}
    </Button>
  );
}

/** Revendication d'une fiche : justificatif obligatoire, examinée par l'administration locale. */
export function ClaimDialog({ businessId, name, signedIn }: { businessId: string; name: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [proof, setProof] = useState("");
  const [pending, start] = useTransition();
  const gate = useAuthGate(signedIn);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={(o) => (!o || gate("revendiquer cette fiche")) && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          C&apos;est mon commerce
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revendiquer « {name} »</DialogTitle>
          <DialogDescription>
            Notre équipe vérifie chaque demande avant d&apos;attribuer la gestion d&apos;une fiche, pour éviter l&apos;usurpation d&apos;identité. Une fois validée, la fiche affichera le badge « Vérifié ».
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="claim-msg">Votre lien avec ce commerce</Label>
          <Textarea id="claim-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} placeholder="Ex. : je suis la gérante depuis 2019." />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="claim-proof">Justificatif vérifiable</Label>
          <Input id="claim-proof" value={proof} onChange={(e) => setProof(e.target.value)} maxLength={500} placeholder="SIRET, site officiel, adresse e-mail professionnelle…" />
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await claimBusiness({ businessId, message, proof });
                if (!res.ok) return void toast.error(res.error);
                toast.success("Demande envoyée. Vous serez notifié de la décision.");
                setOpen(false);
                router.refresh();
              })
            }
          >
            Envoyer la demande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AttendanceButtons({ eventId, initial, disabled, signedIn, slug }: { eventId: string; initial: "going" | "interested" | null; disabled: boolean; signedIn: boolean; slug: string }) {
  const [status, setStatus] = useState(initial);
  const [pending, start] = useTransition();
  const gate = useAuthGate(signedIn);
  const router = useRouter();
  function set(next: "going" | "interested") {
    if (!gate("répondre à cet événement")) return;
    const value = status === next ? null : next;
    start(async () => {
      const res = await setAttendance(eventId, value);
      if (!res.ok) return void toast.error(res.error);
      setStatus(value);
      toast.success(value === "going" ? "Vous participez !" : value === "interested" ? "Ajouté à vos intérêts." : "Réponse retirée.");
      router.refresh();
    });
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" onClick={() => set("going")} disabled={disabled || pending} aria-pressed={status === "going"} variant={status === "going" ? "default" : "outline"}>
        <Check /> {status === "going" ? "Je participe" : "Participer"}
      </Button>
      <Button size="lg" onClick={() => set("interested")} disabled={disabled || pending} aria-pressed={status === "interested"} variant={status === "interested" ? "secondary" : "outline"}>
        <Star /> Intéressé
      </Button>
      <Button asChild size="lg" variant="outline">
        <a href={`/api/events/${slug}/ics`} download>
          <CalendarPlus /> Ajouter à l&apos;agenda
        </a>
      </Button>
    </div>
  );
}

export function CancelEventButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="destructive"
      size="lg"
      disabled={pending}
      onClick={() => {
        if (!confirm("Annuler cet événement ? Les participants verront qu'il est annulé.")) return;
        start(async () => {
          const res = await cancelEvent(eventId);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Événement annulé.");
          router.refresh();
        });
      }}
    >
      Annuler l&apos;événement
    </Button>
  );
}
