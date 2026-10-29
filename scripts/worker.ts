/** Worker de traitement asynchrone (vidéos). Lancer : npm run worker. Plusieurs instances possibles. */
import "dotenv/config";
import { processJobs } from "../src/server/jobs";

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function loop() {
  console.log("Worker Voisino démarré (Ctrl+C pour arrêter)");
  while (!stopping) {
    const n = await processJobs(5).catch((e) => {
      console.error("[worker]", e);
      return 0;
    });
    if (n === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  process.exit(0);
}

void loop();
