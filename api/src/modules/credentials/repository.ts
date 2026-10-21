import type { Pool } from "pg";

export type AiProvider = "openai";

export interface StoredCredential {
  readonly provider: AiProvider;
  readonly encryptedApiKey: string;
  readonly updatedAt: string;
}

interface CredentialRow {
  readonly provider: AiProvider;
  readonly encrypted_api_key: string;
  readonly updated_at: Date;
}

export interface CredentialRepository {
  find(userId: string): Promise<StoredCredential | null>;
  upsert(
    userId: string,
    provider: AiProvider,
    encryptedApiKey: string,
  ): Promise<void>;
  delete(userId: string): Promise<void>;
}

export function createCredentialRepository(
  database: Pool,
): CredentialRepository {
  return {
    async find(userId) {
      const result = await database.query<CredentialRow>(
        `
          SELECT provider, encrypted_api_key, updated_at
          FROM user_provider_credentials
          WHERE user_id = $1
        `,
        [userId],
      );

      const row = result.rows[0];

      return row
        ? {
            provider: row.provider,
            encryptedApiKey: row.encrypted_api_key,
            updatedAt: row.updated_at.toISOString(),
          }
        : null;
    },

    async upsert(userId, provider, encryptedApiKey) {
      await database.query(
        `
          INSERT INTO user_provider_credentials (
            user_id,
            provider,
            encrypted_api_key
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id)
          DO UPDATE SET
            provider = EXCLUDED.provider,
            encrypted_api_key = EXCLUDED.encrypted_api_key,
            updated_at = NOW()
        `,
        [userId, provider, encryptedApiKey],
      );
    },

    async delete(userId) {
      await database.query(
        `
          DELETE FROM user_provider_credentials
          WHERE user_id = $1
        `,
        [userId],
      );
    },
  };
}
