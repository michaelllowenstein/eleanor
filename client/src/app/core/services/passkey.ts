import { Injectable, signal } from "@angular/core";

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import { AuthService } from "./auth";

@Injectable({
  providedIn: "root",
})
export class PasskeyService {
  readonly supported = signal(browserSupportsWebAuthn());
  readonly loading = signal(true);
  readonly registered = signal(false);
  readonly count = signal(0);
  readonly stepUpVerifiedAt = signal<number | null>(null);

  constructor(
    private readonly auth: AuthService,
  ) {}

  async load(): Promise<void> {
    this.loading.set(true);

    try {
      const response = await fetch("/api/passkeys/status", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `Unable to load passkey status (${response.status}).`,
        );
      }

      const status = (await response.json()) as {
        readonly registered: boolean;
        readonly count: number;
        readonly stepUpVerifiedAt: number | null;
      };

      this.registered.set(status.registered);
      this.count.set(status.count);
      this.stepUpVerifiedAt.set(status.stepUpVerifiedAt);
    } finally {
      this.loading.set(false);
    }
  }

  async register(): Promise<void> {
    this.assertSupported();

    const options = await this.options<
      PublicKeyCredentialCreationOptionsJSON
    >("/api/passkeys/registration/options");

    const browserResponse = await startRegistration({
      optionsJSON: options,
    });

    const verification = await fetch(
      "/api/passkeys/registration/verify",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...this.auth.csrfHeaders(),
        },
        body: JSON.stringify(browserResponse),
      },
    );

    if (!verification.ok) {
      throw await this.errorFrom(
        verification,
        "Passkey registration failed.",
      );
    }

    const result = (await verification.json()) as {
      readonly verified: boolean;
      readonly stepUpVerifiedAt: number;
    };

    if (!result.verified) {
      throw new Error("Passkey registration was not verified.");
    }

    this.registered.set(true);
    this.count.update((value) => value + 1);
    this.stepUpVerifiedAt.set(result.stepUpVerifiedAt);
  }

  async stepUp(): Promise<void> {
    this.assertSupported();

    const options = await this.options<
      PublicKeyCredentialRequestOptionsJSON
    >("/api/passkeys/step-up/options");

    const browserResponse = await startAuthentication({
      optionsJSON: options,
    });

    const verification = await fetch(
      "/api/passkeys/step-up/verify",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...this.auth.csrfHeaders(),
        },
        body: JSON.stringify(browserResponse),
      },
    );

    if (!verification.ok) {
      throw await this.errorFrom(
        verification,
        "Passkey verification failed.",
      );
    }

    const result = (await verification.json()) as {
      readonly verified: boolean;
      readonly stepUpVerifiedAt: number;
    };

    if (!result.verified) {
      throw new Error("Passkey verification failed.");
    }

    this.stepUpVerifiedAt.set(result.stepUpVerifiedAt);
  }

  async ensureStepUp(maxAgeSeconds = 300): Promise<void> {
    const verifiedAt = this.stepUpVerifiedAt();

    if (
      verifiedAt &&
      Date.now() - verifiedAt <= maxAgeSeconds * 1_000
    ) {
      return;
    }

    await this.stepUp();
  }

  private async options<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: this.auth.csrfHeaders(),
    });

    if (!response.ok) {
      throw await this.errorFrom(
        response,
        "Unable to start passkey ceremony.",
      );
    }

    return (await response.json()) as T;
  }

  private async errorFrom(
    response: Response,
    fallback: string,
  ): Promise<Error> {
    const payload = await response
      .json()
      .catch(() => null) as {
        readonly error?: string;
      } | null;

    return new Error(payload?.error ?? fallback);
  }

  private assertSupported(): void {
    if (!this.supported()) {
      throw new Error(
        "This browser does not support WebAuthn/passkeys.",
      );
    }
  }
}
