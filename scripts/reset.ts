/**
 * Réinitialisation CONTRÔLÉE de l'environnement de développement :
 * supprime toutes les tables et médias locaux, réapplique les migrations, recrée la démo.
 * Garde-fous : refuse en production, hors base locale, ou sans --yes.
 */
import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { runMigrations } from "./migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const host = new URL(url).hostname;
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "db"].includes(host)) {
    throw new Error(`Refus : réinitialisation autorisée uniquement sur une base locale (hôte actuel : ${host}).`);
  }
  if (!process.argv.includes("--yes")) {
    console.log("Cette commande EFFACE toutes les données locales. Relancez avec : npm run db:reset -- --yes");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await sql.end();
  if ((process.env.STORAGE_DRIVER ?? "local") === "local") {
    await rm(path.resolve(process.env.STORAGE_DIR ?? "./storage/media"), { recursive: true, force: true });
  }
  await rm(path.resolve("storage/dev-mail"), { recursive: true, force: true });
  await runMigrations(url);
  console.log("✓ Base réinitialisée");
  const { seed } = await import("./seed");
  await seed();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
