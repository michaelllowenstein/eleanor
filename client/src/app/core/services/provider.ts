import { Injectable, signal } from "@angular/core";

import { AuthService } from "./auth";
import { PasskeyService } from "./passkey";

export type AiProvider = "openai";

export interface ProviderCredentialDetails {
  readonly provider: AiProvider;
  readonly maskedApiKey: string;
  readonly updatedAt: string;
}

@Injectable({
  providedIn: "root",
})
export class ProviderService {
  readonly loading = signal(true);
  readonly configured = signal(false);
  readonly provider = signal<AiProvider | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly passkeys: PasskeyService,
  ) {}

  async loadStatus(): Promise<void> {
    this.loading.set(true);

    try {
      const response = await fetch(
        "/api/provider-credentials/status",
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(
          `Unable to load provider status (${response.status}).`,
        );
      }

      const status = (await response.json()) as {
        readonly configured: boolean;
        readonly provider: AiProvider | null;
      };

      this.configured.set(status.configured);
      this.provider.set(status.provider);
    } finally {
      this.loading.set(false);
    }
  }

  async details(): Promise<ProviderCredentialDetails | null> {
    await this.passkeys.ensureStepUp();

    const response = await fetch(
      "/api/provider-credentials/details",
      {
        credentials: "include",
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        `Unable to load provider details (${response.status}).`,
      );
    }

    const payload = (await response.json()) as {
      readonly credential: ProviderCredentialDetails | null;
    };

    return payload.credential;
  }

  async save(
    provider: AiProvider,
    apiKey: string,
  ): Promise<void> {
    await this.passkeys.ensureStepUp();

    const response = await fetch(
      "/api/provider-credentials",
      {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...this.auth.csrfHeaders(),
        },
        body: JSON.stringify({
          provider,
          apiKey,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Unable to save provider credential (${response.status}).`,
      );
    }

    this.provider.set(provider);
    this.configured.set(true);
  }

  async remove(): Promise<void> {
    await this.passkeys.ensureStepUp();

    const response = await fetch(
      "/api/provider-credentials",
      {
        method: "DELETE",
        credentials: "include",
        headers: this.auth.csrfHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Unable to remove provider credential (${response.status}).`,
      );
    }

    this.provider.set(null);
    this.configured.set(false);
  }
}
