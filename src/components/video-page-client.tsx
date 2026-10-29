"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { deleteVideo, updateVideo } from "@/server/actions/videos";
import type { VideoCard } from "@/server/services/videos";
import { VISIBILITIES } from "@/lib/validation";
import { useMuted } from "./feed";
import { VideoPlayer, type Me } from "./video-player";

export function StandalonePlayer({ video, me }: { video: VideoCard; me: Me }) {
  const [muted, toggle] = useMuted();
  return (
    <div className="h-[calc(100dvh-4rem)] bg-black md:h-[min(85dvh,900px)] md:rounded-3xl">
      <VideoPlayer video={video} active preload="auto" muted={muted} onToggleMute={toggle} me={me} standalone />
    </div>
  );
}

/** Modification et suppression par l'auteur. */
export function OwnerActions({ video }: { video: VideoCard }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState(video.caption);
  const [visibility, setVisibility] = useState(video.visibility);
  const [allowComments, setAllowComments] = useState(video.allowComments);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateVideo(video.id, { caption, visibility, allowComments, categoryId: "" });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Publication mise à jour.");
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await deleteVideo(video.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Vidéo supprimée définitivement.");
      router.push(`/u/${video.authorUsername}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="lg">
            <Pencil /> Modifier
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la publication</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="edit-caption">Légende</Label>
            <Textarea id="edit-caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} rows={4} />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Visibilité</legend>
            {VISIBILITIES.map((v) => (
              <label key={v.value} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-brand-soft">
                <input type="radio" name="edit-vis" value={v.value} checked={visibility === v.value} onChange={() => setVisibility(v.value)} className="mt-1 accent-primary" />
                <span>
                  <span className="block font-medium">{v.label}</span>
                  <span className="text-sm text-muted-foreground">{v.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-center justify-between gap-3">
            <span className="font-medium">Autoriser les commentaires</span>
            <Switch checked={allowComments} onCheckedChange={setAllowComments} />
          </label>
          <DialogFooter>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="lg">
            <Trash2 /> Supprimer
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette vidéo ?</AlertDialogTitle>
            <AlertDialogDescription>La vidéo, ses fichiers, ses j&apos;aime et ses commentaires seront supprimés. Cette action est définitive.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
