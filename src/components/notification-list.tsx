"use client";

import { AtSign, Bell, CheckCheck, Film, Heart, MessageCircle, ShieldAlert, Store, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAllNotificationsRead, markNotificationRead } from "@/server/actions/account";
import { answerFollowRequest } from "@/server/actions/social";
import { cn } from "@/lib/utils";
import { TimeAgo } from "./bits";
import { UserAvatar } from "./user-avatar";

type Item = {
  id: string;
  type: string;
  message: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
  href: string;
  actorName: string | null;
  actorImage: string | null;
  actorUsername: string | null;
  businessName: string | null;
  videoCaption: string | null;
};

const ICONS: Record<string, typeof Bell> = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
  reply: MessageCircle,
  mention: AtSign,
  new_video: Film,
  video_ready: Film,
  video_failed: Film,
  business_claim: Store,
  moderation: ShieldAlert,
};

function text(n: Item) {
  const who = n.actorUsername ? `@${n.actorUsername}` : "";
  const what = n.videoCaption ? ` « ${n.videoCaption.slice(0, 50)} »` : "";
  switch (n.type) {
    case "follow":
      return n.message ? `${who} ${n.message}` : `${who} s'est abonné à votre compte.`;
    case "like":
      return `${who} aime votre vidéo${what}.`;
    case "comment":
      return `${who} a commenté votre vidéo${what}.`;
    case "reply":
      return `${who} a répondu à votre commentaire.`;
    case "mention":
      return `${who} vous a mentionné dans un commentaire.`;
    case "new_video":
      return `${who} a publié une nouvelle vidéo${what}.`;
    default:
      return n.message ?? "Nouvelle notification";
  }
}

export function NotificationList({ initial, hasMore: initialHasMore }: { initial: Item[]; hasMore: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, start] = useTransition();
  const unread = items.filter((n) => !n.readAt).length;

  function readAll() {
    start(async () => {
      const res = await markAllNotificationsRead();
      if (!res.ok) return void toast.error(res.error);
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      router.refresh();
    });
  }

  function open(n: Item) {
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      void markNotificationRead(n.id);
    }
  }

  async function more() {
    const r = await fetch(`/api/notifications?page=${page + 1}`);
    if (!r.ok) return void toast.error("Chargement impossible.");
    const data = (await r.json()) as { items: Item[]; hasMore: boolean };
    setItems((prev) => [...prev, ...data.items]);
    setHasMore(data.hasMore);
    setPage(page + 1);
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center rounded-3xl border border-dashed px-6 py-12 text-center">
        <Bell className="size-10 text-primary" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-bold">Rien de nouveau</h2>
        <p className="text-muted-foreground">Les j&apos;aime, commentaires et nouveaux abonnés apparaîtront ici.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {unread ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout est lu"}
        </p>
        <Button variant="ghost" onClick={readAll} disabled={!unread || pending}>
          <CheckCheck /> Tout marquer comme lu
        </Button>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border">
        {items.map((n) => {
          const Icon = ICONS[n.type] ?? Bell;
          return (
            <li key={n.id}>
              <Link href={n.href} onClick={() => open(n)} className={cn("flex items-start gap-3 p-4 hover:bg-muted", !n.readAt && "bg-brand-soft/50")}>
                <span className="relative">
                  {n.actorName ? (
                    <UserAvatar name={n.actorName} image={n.actorImage} />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                  )}
                  {n.actorName && <Icon className="absolute -right-1 -bottom-1 size-5 rounded-full bg-background p-0.5 text-primary" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{text(n)}</span>
                  <TimeAgo date={n.createdAt} className="text-sm text-muted-foreground" />
                </span>
                {!n.readAt && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" aria-label="Non lue" />}
              </Link>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <Button variant="outline" className="mt-4 w-full" onClick={more}>
          Charger plus
        </Button>
      )}
    </div>
  );
}

export function FollowRequests({ requests }: { requests: { id: string; name: string; image: string | null; username: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!requests.length) return null;
  const answer = (id: string, accept: boolean) =>
    start(async () => {
      const res = await answerFollowRequest(id, accept);
      if (!res.ok) return void toast.error(res.error);
      toast.success(accept ? "Demande acceptée." : "Demande refusée.");
      router.refresh();
    });
  return (
    <section className="mb-8" aria-labelledby="requests">
      <h2 id="requests" className="mb-3 text-lg font-bold">
        Demandes d&apos;abonnement
      </h2>
      <ul className="divide-y rounded-2xl border">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center gap-3 p-4">
            <UserAvatar name={r.name} image={r.image} />
            <Link href={`/u/${r.username}`} className="min-w-0 flex-1 font-semibold hover:underline">
              @{r.username}
            </Link>
            <Button size="sm" onClick={() => answer(r.id, true)} disabled={pending}>
              Accepter
            </Button>
            <Button size="sm" variant="outline" onClick={() => answer(r.id, false)} disabled={pending}>
              Refuser
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
