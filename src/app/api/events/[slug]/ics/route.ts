import { getViewer } from "@/server/session";
import { getEvent, toIcs } from "@/server/services/content";

/** GET /api/events/{slug}/ics — fichier agenda (iCalendar). */
export async function GET(_req: Request, ctx: RouteContext<"/api/events/[slug]/ics">) {
  const { slug } = await ctx.params;
  const e = await getEvent(slug, await getViewer());
  if (!e) return new Response("Introuvable", { status: 404 });
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/evenements/${slug}`;
  return new Response(toIcs(e.event, url), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.ics"` },
  });
}
