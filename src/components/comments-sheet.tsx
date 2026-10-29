"use client";

import { Flag, Loader2, MoreHorizontal, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { deleteComment, postComment } from "@/server/actions/social";
import type { CommentItem } from "@/server/services/comments";
import { TimeAgo } from "./bits";
import { ReportDialog } from "./report-dialog";
import { UserAvatar } from "./user-avatar";

type Me = { id: string; canContribute: boolean } | null;

export function CommentsSheet({ videoId, open, onOpenChange, commentsOpen, me, onCountChange }: {
  videoId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  commentsOpen: boolean;
  me: Me;
  onCountChange: (delta: number) => void;
}) {
  const [items, setItems] = useState<CommentItem[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(
    async (p: number) => {
      setError(false);
      try {
        const r = await fetch(`/api/videos/${videoId}/comments?page=${p}`);
        if (!r.ok) throw new Error();
        const data = (await r.json()) as { items: CommentItem[]; hasMore: boolean };
        setItems((prev) => (p === 0 ? data.items : [...(prev ?? []), ...data.items]));
        setHasMore(data.hasMore);
        setPage(p);
      } catch {
        setError(true);
      }
    },
    [videoId],
  );

  useEffect(() => {
    if (open && items === null) void load(0);
  }, [open, items, load]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const res = await postComment({ videoId, body: text, parentId: replyTo?.id ?? "" });
      if (!res.ok) return void toast.error(res.error);
      const c = { ...res.data, replies: [] } as unknown as CommentItem;
      setItems((prev) =>
        replyTo ? (prev ?? []).map((p) => (p.id === replyTo.id ? { ...p, replies: [...p.replies, c] } : p)) : [c, ...(prev ?? [])],
      );
      setBody("");
      setReplyTo(null);
      onCountChange(1);
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteComment(id);
      if (!res.ok) return void toast.error(res.error);
      setItems((prev) => (prev ?? []).filter((c) => c.id !== id).map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== id) })));
      onCountChange(-1);
      toast.success("Commentaire supprimé.");
    });
  }

  const renderComment = (c: CommentItem | CommentItem["replies"][number], isReply = false) => (
    <li key={c.id} className="flex gap-3">
      <Link href={`/u/${c.authorUsername}`} className="shrink-0">
        <UserAvatar name={c.authorName} image={c.authorImage} className={isReply ? "size-7" : "size-9"} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link href={`/u/${c.authorUsername}`} className="font-semibold hover:underline">
            @{c.authorUsername}
          </Link>{" "}
          <span className="text-muted-foreground">· <TimeAgo date={c.createdAt} /></span>
        </p>
        <p className="mt-0.5 text-[15px] break-words whitespace-pre-wrap">{c.body}</p>
        <div className="mt-1 flex items-center gap-2">
          {!isReply && me?.canContribute && commentsOpen && (
            <button
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => {
                setReplyTo(c as CommentItem);
                inputRef.current?.focus();
              }}
            >
              Répondre
            </button>
          )}
          {me && (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Plus d'actions sur le commentaire">
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {c.authorId === me.id ? (
                  <DropdownMenuItem onSelect={() => remove(c.id)} className="text-destructive">
                    <Trash2 /> Supprimer
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setReporting(c.id)}>
                    <Flag /> Signaler
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {"replies" in c && c.replies.length > 0 && <ul className="mt-3 flex flex-col gap-3">{c.replies.map((r) => renderComment(r, true))}</ul>}
      </div>
    </li>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto flex h-[78dvh] max-w-xl flex-col gap-0 rounded-t-3xl p-0 md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:rounded-none md:rounded-l-3xl">
        <SheetHeader className="border-b">
          <SheetTitle>Commentaires</SheetTitle>
          <SheetDescription className="sr-only">Lire et écrire des commentaires sur cette vidéo</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
          {items === null && !error && (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Chargement des commentaires" />
            </div>
          )}
          {error && (
            <div className="py-10 text-center">
              <p className="text-muted-foreground">Impossible de charger les commentaires.</p>
              <Button variant="outline" className="mt-3" onClick={() => load(page)}>
                Réessayer
              </Button>
            </div>
          )}
          {items?.length === 0 && <p className="py-10 text-center text-muted-foreground">Aucun commentaire pour l&apos;instant. Lancez la conversation !</p>}
          {items && <ul className="flex flex-col gap-5">{items.map((c) => renderComment(c))}</ul>}
          {hasMore && (
            <Button variant="ghost" className="mt-4 w-full" onClick={() => load(page + 1)}>
              Voir plus de commentaires
            </Button>
          )}
        </div>
        <div className="pb-safe border-t p-3">
          {!commentsOpen ? (
            <p className="py-2 text-center text-sm text-muted-foreground">Les commentaires sont désactivés pour cette vidéo.</p>
          ) : !me ? (
            <p className="py-2 text-center text-sm">
              <Link href="/connexion" className="font-semibold text-primary underline-offset-4 hover:underline">
                Connectez-vous
              </Link>{" "}
              pour commenter.
            </p>
          ) : !me.canContribute ? (
            <p className="py-2 text-center text-sm text-muted-foreground">Confirmez votre adresse e-mail pour commenter.</p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-2">
              {replyTo && (
                <p className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
                  Réponse à @{replyTo.authorUsername}
                  <button type="button" className="font-medium text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(null)}>
                    Annuler
                  </button>
                </p>
              )}
              <div className="flex items-end gap-2">
                <label htmlFor={`comment-${videoId}`} className="sr-only">
                  Votre commentaire
                </label>
                <Textarea
                  id={`comment-${videoId}`}
                  ref={inputRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Ajouter un commentaire…"
                  rows={1}
                  maxLength={1000}
                  className="max-h-32 min-h-11 resize-none text-base"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <Button type="submit" size="icon-lg" className="size-11" disabled={pending || !body.trim()} aria-label="Publier le commentaire">
                  {pending ? <Loader2 className="animate-spin" /> : <Send />}
                </Button>
              </div>
            </form>
          )}
        </div>
        {reporting && <ReportDialog open onOpenChange={(o) => !o && setReporting(null)} targetType="comment" targetId={reporting} />}
      </SheetContent>
    </Sheet>
  );
}
