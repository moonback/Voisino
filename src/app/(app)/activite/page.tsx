import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/bits";
import { FollowRequests, NotificationList } from "@/components/notification-list";
import { requireViewerPage } from "@/server/session";
import { listNotifications } from "@/server/services/notifications";
import { listFollowRequests } from "@/server/services/social";

export const metadata: Metadata = { title: "Activité" };

export default async function ActivityPage() {
  const viewer = await requireViewerPage("/activite");
  const [{ items, hasMore }, requests] = await Promise.all([listNotifications(viewer.id), listFollowRequests(viewer)]);
  return (
    <Page>
      <PageHeader title="Activité" description="Vos notifications et interactions." className="mb-6" />
      <FollowRequests requests={requests} />
      <NotificationList initial={items} hasMore={hasMore} />
    </Page>
  );
}
