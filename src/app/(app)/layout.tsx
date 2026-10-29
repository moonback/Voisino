import { Suspense } from "react";
import { AppNav, NavShell } from "@/components/app-nav";
import { canAccessAdmin } from "@/server/permissions";
import { getViewer } from "@/server/session";
import { unreadCount } from "@/server/services/notifications";

async function NavWithViewer() {
  const v = await getViewer();
  const unread = v ? await unreadCount(v.id) : 0;
  return <AppNav viewer={v && { username: v.username, name: v.name, image: v.image, unread, canAdmin: canAccessAdmin(v) }} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a href="#contenu" className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Aller au contenu
      </a>
      <Suspense fallback={<NavShell />}>
        <NavWithViewer />
      </Suspense>
      <main id="contenu" className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-[76px] lg:pl-60">
        {children}
      </main>
    </>
  );
}
