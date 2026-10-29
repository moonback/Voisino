import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between" aria-hidden="true">
        <span className="font-heading text-2xl font-bold">Voisino</span>
        <div>
          <p className="font-heading text-5xl leading-[1.05] font-extrabold">
            Votre quartier
            <br />a des choses à raconter.
          </p>
          <p className="mt-4 max-w-sm text-lg opacity-90">Bonnes adresses, sorties, infos utiles : partagées par celles et ceux qui y vivent.</p>
        </div>
        <svg viewBox="0 0 400 400" className="absolute -right-24 -bottom-24 size-[28rem] opacity-15">
          <path d="M60 80 200 360 340 80" fill="none" stroke="currentColor" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">
            Continuer sans compte
          </Link>
        </p>
      </main>
    </div>
  );
}
