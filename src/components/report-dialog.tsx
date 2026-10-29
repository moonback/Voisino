"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { reportContent } from "@/server/actions/social";
import { REPORT_REASONS } from "@/lib/validation";

type Target = "video" | "comment" | "user" | "business" | "event" | "news";
const NOUN: Record<Target, string> = {
  video: "cette vidéo",
  comment: "ce commentaire",
  user: "ce profil",
  business: "cette fiche commerce",
  event: "cet événement",
  news: "cette actualité",
};

export function ReportDialog({ open, onOpenChange, targetType, targetId }: { open: boolean; onOpenChange: (o: boolean) => void; targetType: Target; targetId: string }) {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!reason) return void toast.error("Choisissez un motif.");
    start(async () => {
      const res = await reportContent({ targetType, targetId, reason, details });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Merci. Votre signalement a été transmis à l'équipe de modération.");
      onOpenChange(false);
      setReason("");
      setDetails("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Signaler {NOUN[targetType]}</DialogTitle>
          <DialogDescription>Votre signalement est anonyme pour l&apos;auteur. En cas de danger immédiat, contactez le 17 ou le 112.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="grid gap-1" aria-label="Motif du signalement">
          {REPORT_REASONS.map((r) => (
            <Label key={r.value} htmlFor={`r-${r.value}`} className="flex cursor-pointer items-center gap-3 rounded-lg p-2.5 font-normal hover:bg-muted">
              <RadioGroupItem value={r.value} id={`r-${r.value}`} />
              {r.label}
            </Label>
          ))}
        </RadioGroup>
        <div className="grid gap-1.5">
          <Label htmlFor="report-details">Précisions (facultatif)</Label>
          <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Envoyer le signalement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
