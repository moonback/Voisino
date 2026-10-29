import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/** Sonde de disponibilité (load balancer, Docker, supervision). */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
