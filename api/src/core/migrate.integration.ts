import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "./migrate.js";

/**
 * Runs only when TEST_DATABASE_URL points at a disposable database
 * (CI provides one; see .github/workflows/ci.yml). Never point it at a
 * database you care about: the suite drops the public schema.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("migrations (integration)", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies every migration on an empty database", async () => {
    const result = await runMigrations(url!, () => undefined);
    expect(result.applied.length).toBeGreaterThanOrEqual(4);
  });

  it("is idempotent", async () => {
    const result = await runMigrations(url!, () => undefined);
    expect(result.applied).toEqual([]);
  });

  it("cascades user deletion to owned rows", async () => {
    await pool.query("INSERT INTO users (id) VALUES ('u1')");
    await pool.query(
      "INSERT INTO assistant_profiles (user_id, profile_metric) VALUES ('u1', 1131380)",
    );
    await pool.query("DELETE FROM users WHERE id = 'u1'");
    const { rowCount } = await pool.query(
      "SELECT 1 FROM assistant_profiles WHERE user_id = 'u1'",
    );
    expect(rowCount).toBe(0);
  });

  it("enforces the v1 metric range", async () => {
    await pool.query("INSERT INTO users (id) VALUES ('u2')");
    await expect(
      pool.query("INSERT INTO assistant_profiles (user_id, profile_metric) VALUES ('u2', 42)"),
    ).rejects.toThrow();
  });
});
