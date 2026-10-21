import { CredentialCryptoService } from "./crypto/service.js";
import type {
  AiProvider,
  CredentialRepository,
} from "./repository.js";

export class CredentialService {
  constructor(
    private readonly repository: CredentialRepository,
    private readonly crypto: CredentialCryptoService,
  ) {}

  async status(userId: string) {
    const credential = await this.repository.find(userId);

    return {
      configured: Boolean(credential),
      provider: credential?.provider ?? null,
    };
  }

  async details(userId: string) {
    const credential = await this.repository.find(userId);

    if (!credential) {
      return null;
    }

    return {
      provider: credential.provider,
      maskedApiKey: "••••••••••••",
      updatedAt: credential.updatedAt,
    };
  }

  async save(
    userId: string,
    provider: AiProvider,
    apiKey: string,
  ): Promise<void> {
    await this.repository.upsert(
      userId,
      provider,
      this.crypto.encrypt(apiKey),
    );
  }

  async getProviderSecret(userId: string) {
    const credential = await this.repository.find(userId);

    if (!credential) {
      return null;
    }

    return {
      provider: credential.provider,
      apiKey: this.crypto.decrypt(
        credential.encryptedApiKey,
      ),
    };
  }

  async remove(userId: string): Promise<void> {
    await this.repository.delete(userId);
  }
}
