import { z } from "zod";
import { runRoute } from "@/server/run";
import { requireViewer } from "@/server/session";
import { listNotifications, unreadCount } from "@/server/services/notifications";

/** GET /api/notifications?page=0 — notifications paginées + nombre de non lues. */
export async function GET(req: Request) {
  return runRoute(async () => {
    const viewer = await requireViewer();
    const page = z.coerce.number().int().min(0).max(1000).catch(0).parse(new URL(req.url).searchParams.get("page"));
    const [list, unread] = await Promise.all([listNotifications(viewer.id, page), unreadCount(viewer.id)]);
    return Response.json({ ...list, unread });
  });
}
