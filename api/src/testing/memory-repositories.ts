import type {
  AiProvider,
  CredentialRepository,
  StoredCredential,
} from "../modules/credentials/repository.js";
import type { PasskeyRepository, StoredPasskey } from "../modules/passkey/repository.js";
import type {
  AssistantProfileRepository,
  StoredAssistantProfile,
} from "../modules/profile/repository.js";
import type { UserRepository } from "../modules/users/repository.js";

export class MemoryUsers implements UserRepository {
  readonly logins: string[] = [];
  async recordLogin(userId: string): Promise<void> {
    this.logins.push(userId);
  }
}

export class MemoryProfiles implements AssistantProfileRepository {
  readonly rows = new Map<string, StoredAssistantProfile>();

  async find(userId: string) {
    return this.rows.get(userId) ?? null;
  }

  async upsert(userId: string, metric: bigint, schemaVersion: number) {
    const row = {
      metric: metric.toString(),
      schemaVersion,
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(userId, row);
    return row;
  }
}

export class MemoryCredentials implements CredentialRepository {
  readonly rows = new Map<string, StoredCredential>();

  async find(userId: string) {
    return this.rows.get(userId) ?? null;
  }

  async upsert(userId: string, provider: AiProvider, encryptedApiKey: string) {
    this.rows.set(userId, { provider, encryptedApiKey, updatedAt: new Date().toISOString() });
  }

  async delete(userId: string) {
    this.rows.delete(userId);
  }
}

export class MemoryPasskeys implements PasskeyRepository {
  readonly rows: StoredPasskey[] = [];

  async listForUser(userId: string) {
    return this.rows.filter((row) => row.userId === userId);
  }

  async findForUser(userId: string, credentialId: string) {
    return (
      this.rows.find((row) => row.userId === userId && row.credentialId === credentialId) ??
      null
    );
  }

  async insert(passkey: Omit<StoredPasskey, "createdAt" | "lastUsedAt">) {
    this.rows.push({ ...passkey, createdAt: new Date().toISOString(), lastUsedAt: null });
  }

  async updateCounter(userId: string, credentialId: string, counter: number) {
    const index = this.rows.findIndex(
      (row) => row.userId === userId && row.credentialId === credentialId,
    );
    const row = this.rows[index];
    if (row) this.rows[index] = { ...row, counter, lastUsedAt: new Date().toISOString() };
  }
}
