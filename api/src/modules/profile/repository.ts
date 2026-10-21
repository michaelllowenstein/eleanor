import type { Pool } from "pg";

export interface StoredAssistantProfile {
  readonly metric: string;
  readonly schemaVersion: number;
  readonly updatedAt: string;
}

interface Row {
  readonly profile_metric: string;
  readonly schema_version: number;
  readonly updated_at: Date;
}

export interface AssistantProfileRepository {
  find(userId: string): Promise<StoredAssistantProfile | null>;
  upsert(
    userId: string,
    metric: bigint,
    schemaVersion: number,
  ): Promise<StoredAssistantProfile>;
}

export function createAssistantProfileRepository(
  database: Pool,
): AssistantProfileRepository {
  return {
    async find(userId) {
      const result = await database.query<Row>(
        `
          SELECT profile_metric, schema_version, updated_at
          FROM assistant_profiles
          WHERE user_id = $1
        `,
        [userId],
      );

      const row = result.rows[0];

      return row
        ? {
            metric: row.profile_metric,
            schemaVersion: row.schema_version,
            updatedAt: row.updated_at.toISOString(),
          }
        : null;
    },

    async upsert(userId, metric, schemaVersion) {
      const result = await database.query<Row>(
        `
          INSERT INTO assistant_profiles (
            user_id, profile_metric, schema_version
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id)
          DO UPDATE SET
            profile_metric = EXCLUDED.profile_metric,
            schema_version = EXCLUDED.schema_version,
            updated_at = NOW()
          RETURNING profile_metric, schema_version, updated_at
        `,
        [userId, metric.toString(), schemaVersion],
      );

      const row = result.rows[0];

      if (!row) {
        throw new Error("Database did not return the saved profile.");
      }

      return {
        metric: row.profile_metric,
        schemaVersion: row.schema_version,
        updatedAt: row.updated_at.toISOString(),
      };
    },
  };
}
