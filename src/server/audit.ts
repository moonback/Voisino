import "server-only";
import { db, type Tx } from "./db";
import { auditLogs } from "./db/schema";

/** Journalise une action sensible. Ne jamais y mettre de mot de passe, jeton ou e-mail brut. */
export async function audit(
  entry: { actorId: string | null; action: string; entityType: string; entityId?: string | null; metadata?: Record<string, unknown> },
  tx: Tx | typeof db = db,
) {
  await tx.insert(auditLogs).values({ ...entry, entityId: entry.entityId ?? null, metadata: entry.metadata ?? {} });
}
