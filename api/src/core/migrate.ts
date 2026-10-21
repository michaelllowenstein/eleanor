import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

/**
 * Migrations live in api/migrations. This file is api/src/core/migrate.ts in
 * development and api/dist/core/migrate.js in production, so the directory is
 * two levels up in both cases.
 */
export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

// Arbitrary constant; serialises concurrent `migrate` runs (e.g. two
// pre-deploy hooks racing) so a migration is never applied twice.
const ADVISORY_LOCK_KEY = 4_771_100;

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

export async function runMigrations(
  databaseUrl: string,
  log: (line: string) => void = console.log,
): Promise<MigrationResult> {
  const database = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await database.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const done = new Set(
      (
        await client.query<{ version: string }>(
          "SELECT version FROM schema_migrations",
        )
      ).rows.map((row) => row.version),
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (done.has(file)) {
        skipped.push(file);
        log(`skip     ${file}`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        applied.push(file);
        log(`applied  ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${String(error)}`);
      }
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY])
      .catch(() => undefined);
    client.release();
    await database.end();
  }

  return { applied, skipped };
}

// CLI entry point: `npm run migrate` / `npm run migrate:prod`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  runMigrations(databaseUrl).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
