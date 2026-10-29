import Link from "next/link";
import { cn } from "@/lib/utils";

/** Marque Voisino : un repère de carte stylisé qui forme un « V ». */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path d="M8.5 9.5 16 24l7.5-14.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground" />
      <circle cx="16" cy="11.5" r="2.4" className="fill-primary-foreground" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 rounded-lg font-heading text-xl font-bold tracking-tight", className)}>
      <LogoMark />
      {!compact && <span>Voisino</span>}
      <span className="sr-only">— accueil</span>
    </Link>
  );
}
