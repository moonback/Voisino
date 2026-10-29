import { runRoute } from "@/server/run";
import { rateLimit } from "@/server/rate-limit";
import { requireViewer } from "@/server/session";
import { exportUserData } from "@/server/services/profiles";

/** GET /api/me/export — export RGPD (droit d'accès et à la portabilité), JSON téléchargeable. */
export async function GET() {
  return runRoute(async () => {
    const viewer = await requireViewer();
    rateLimit(`export:${viewer.id}`, 5, 3_600_000);
    const data = await exportUserData(viewer.id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="voisino-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
