import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Applique les migrations SQL de ./drizzle. Crée la base cible si elle n'existe pas. */
export async function runMigrations(url: string) {
  const dbName = new URL(url).pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = ${dbName}`;
  if (!exists) await admin.unsafe(`create database "${dbName.replace(/"/g, "")}"`);
  await admin.end();

  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/migrate.ts")) {
  const url = process.argv[2] === "--test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error("URL de base de données manquante");
  runMigrations(url)
    .then(() => console.log("✓ Migrations appliquées"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
