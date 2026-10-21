import type { Pool } from "pg";
import type {
  AuthenticatorTransport,
  CredentialDeviceType,
} from "@simplewebauthn/server";

export interface StoredPasskey {
  readonly credentialId: string;
  readonly userId: string;
  readonly publicKey: Buffer;
  readonly counter: number;
  readonly transports: readonly AuthenticatorTransport[] | string[];
  readonly deviceType: CredentialDeviceType;
  readonly backedUp: boolean;
  readonly name: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

interface PasskeyRow {
  readonly credential_id: string;
  readonly user_id: string;
  readonly public_key: Buffer;
  readonly counter: string;
  readonly transports: string[];
  readonly device_type: CredentialDeviceType;
  readonly backed_up: boolean;
  readonly name: string | null;
  readonly created_at: Date;
  readonly last_used_at: Date | null;
}

export interface PasskeyRepository {
  listForUser(userId: string): Promise<readonly StoredPasskey[]>;
  findForUser(
    userId: string,
    credentialId: string,
  ): Promise<StoredPasskey | null>;
  insert(
    passkey: Omit<StoredPasskey, "createdAt" | "lastUsedAt">,
  ): Promise<void>;
  updateCounter(
    userId: string,
    credentialId: string,
    counter: number,
  ): Promise<void>;
}

export function createPasskeyRepository(
  database: Pool,
): PasskeyRepository {
  return {
    async listForUser(userId) {
      const result = await database.query<PasskeyRow>(
        `
          SELECT
            credential_id,
            user_id,
            public_key,
            counter,
            transports,
            device_type,
            backed_up,
            name,
            created_at,
            last_used_at
          FROM user_passkeys
          WHERE user_id = $1
          ORDER BY created_at ASC
        `,
        [userId],
      );

      return result.rows.map(mapRow);
    },

    async findForUser(userId, credentialId) {
      const result = await database.query<PasskeyRow>(
        `
          SELECT
            credential_id,
            user_id,
            public_key,
            counter,
            transports,
            device_type,
            backed_up,
            name,
            created_at,
            last_used_at
          FROM user_passkeys
          WHERE user_id = $1
            AND credential_id = $2
        `,
        [userId, credentialId],
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },

    async insert(passkey) {
      await database.query(
        `
          INSERT INTO user_passkeys (
            credential_id,
            user_id,
            public_key,
            counter,
            transports,
            device_type,
            backed_up,
            name
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (credential_id) DO NOTHING
        `,
        [
          passkey.credentialId,
          passkey.userId,
          passkey.publicKey,
          String(passkey.counter),
          [...passkey.transports],
          passkey.deviceType,
          passkey.backedUp,
          passkey.name,
        ],
      );
    },

    async updateCounter(userId, credentialId, counter) {
      await database.query(
        `
          UPDATE user_passkeys
          SET
            counter = $3,
            last_used_at = NOW()
          WHERE user_id = $1
            AND credential_id = $2
        `,
        [userId, credentialId, String(counter)],
      );
    },
  };
}

function mapRow(row: PasskeyRow): StoredPasskey {
  const counter = Number(row.counter);

  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new Error(
      `Unsupported WebAuthn signature counter: ${row.counter}.`,
    );
  }

  return {
    credentialId: row.credential_id,
    userId: row.user_id,
    publicKey: row.public_key,
    counter,
    transports:
      row.transports as AuthenticatorTransport[],
    deviceType: row.device_type,
    backedUp: row.backed_up,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    lastUsedAt:
      row.last_used_at?.toISOString() ?? null,
  };
}
