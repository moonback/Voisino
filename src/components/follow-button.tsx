"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { followUser } from "@/server/actions/social";
import { useAuthGate } from "./auth-gate";

type State = "accepted" | "pending" | null;

export function FollowButton({ userId, initial, signedIn, size = "default", className, tone = "default" }: {
  userId: string;
  initial: State;
  signedIn: boolean;
  size?: "default" | "sm" | "lg";
  className?: string;
  tone?: "default" | "overlay";
}) {
  const [state, setState] = useState<State>(initial);
  const [pending, start] = useTransition();
  const gate = useAuthGate(signedIn);

  function toggle() {
    if (!gate("vous abonner")) return;
    const next = state ? null : "accepted";
    const prev = state;
    setState(next);
    start(async () => {
      const res = await followUser(userId, next !== null);
      if (!res.ok) {
        setState(prev);
        return void toast.error(res.error);
      }
      setState(res.data.state);
      if (res.data.state === "pending") toast.info("Demande envoyée : ce compte est privé.");
    });
  }

  const label = state === "accepted" ? "Abonné" : state === "pending" ? "Demande envoyée" : "S'abonner";
  return (
    <Button
      size={size}
      onClick={toggle}
      disabled={pending}
      aria-pressed={state !== null}
      variant={state ? "outline" : "default"}
      className={cn(tone === "overlay" && state && "border-white/40 bg-white/10 text-white hover:bg-white/20", className)}
    >
      {label}
    </Button>
  );
}
