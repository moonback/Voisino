import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { jobs } from "./db/schema";
import { failVideoProcessing, processVideoAsset } from "./services/media";

type Job = { id: string; type: string; payload: Record<string, string>; attempts: number };

const MAX_ATTEMPTS = 3;

const handlers: Record<string, { run: (p: Record<string, string>) => Promise<void>; onGiveUp?: (p: Record<string, string>, err: string) => Promise<void> }> = {
  "video.process": {
    run: (p) => processVideoAsset(p.videoId!),
    onGiveUp: (p, err) => failVideoProcessing(p.videoId!, err),
  },
};

export async function enqueue(type: keyof typeof handlers, payload: Record<string, string>) {
  await db.insert(jobs).values({ type, payload });
}

/** Réserve une tâche (SKIP LOCKED : plusieurs workers peuvent tourner en parallèle). */
async function claim(): Promise<Job | null> {
  const rows = await db.execute<Job>(sql`
    update jobs set status = 'running', attempts = attempts + 1, updated_at = now()
    where id = (
      select id from jobs where status = 'pending' and run_at <= now()
      order by run_at for update skip locked limit 1
    )
    returning id, type, payload, attempts`);
  return rows[0] ?? null;
}

/** Traite les tâches en attente. Retourne le nombre de tâches exécutées. */
export async function processJobs(max = 10): Promise<number> {
  let done = 0;
  for (; done < max; done++) {
    const job = await claim();
    if (!job) break;
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`Type de tâche inconnu : ${job.type}`);
      await handler.run(job.payload);
      await db.execute(sql`update jobs set status = 'done', last_error = null, updated_at = now() where id = ${job.id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[jobs] ${job.type} ${job.id} tentative ${job.attempts} :`, message);
      if (job.attempts >= MAX_ATTEMPTS || !handler) {
        await db.execute(sql`update jobs set status = 'failed', last_error = ${message}, updated_at = now() where id = ${job.id}`);
        await handler?.onGiveUp?.(job.payload, message).catch((err) => console.error("[jobs] onGiveUp", err));
      } else {
        const delay = 30 * 2 ** job.attempts; // 60 s, 120 s…
        await db.execute(
          sql`update jobs set status = 'pending', last_error = ${message}, run_at = now() + make_interval(secs => ${delay}), updated_at = now() where id = ${job.id}`,
        );
      }
    }
  }
  return done;
}
