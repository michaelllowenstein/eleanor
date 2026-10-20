import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild,
  computed,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";

import { AuthService } from "../../../core/services/auth";
import type {
  AiProvider,
} from "../../../core/services/provider";
import {
  ProviderService,
} from "../../../core/services/provider";
import { PasskeyService } from "../../../core/services/passkey";
import {
  RealtimeVoiceService,
} from "../../../core/services/realtime";
import {
  SettingsService,
} from "../../../core/services/settings";
import {
  PasskeySetupDialog,
} from "../../ui/dialog/passkey-setup";
import {
  ProviderCredentialDialog,
} from "../../ui/dialog/provider-credentials";
import {
  VoiceOrbIsland,
} from "../orb";

@Component({
  selector: "app-assistant-page",
  standalone: true,
  imports: [
    RouterLink,
    VoiceOrbIsland,
    PasskeySetupDialog,
    ProviderCredentialDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html'
})
export class AssistantPage implements OnInit {
  @ViewChild("credentialDialog")
  private credentialDialog?:
    ProviderCredentialDialog;

  readonly passkeyBusy = signal(false);
  readonly passkeyError = signal<string | null>(null);
  readonly credentialBusy = signal(false);
  readonly credentialError = signal<string | null>(null);

  readonly bootstrapComplete = computed(
    () =>
      !this.passkeys.loading() &&
      !this.credentials.loading(),
  );

  readonly showPasskeyDialog = computed(
    () =>
      this.bootstrapComplete() &&
      !this.passkeys.registered(),
  );

  readonly showCredentialDialog = computed(
    () =>
      this.bootstrapComplete() &&
      this.passkeys.registered() &&
      !this.credentials.configured(),
  );

  readonly ready = computed(
    () =>
      this.bootstrapComplete() &&
      this.passkeys.registered() &&
      this.credentials.configured(),
  );

  readonly readinessLabel = computed(() => {
    if (!this.bootstrapComplete()) {
      return "Loading secure profile";
    }

    if (!this.passkeys.registered()) {
      return "Passkey setup required";
    }

    if (!this.credentials.configured()) {
      return "Provider setup required";
    }

    return "Secure provider connected";
  });

  constructor(
    readonly auth: AuthService,
    readonly passkeys: PasskeyService,
    readonly credentials: ProviderService,
    readonly voice: RealtimeVoiceService,
    private readonly settings: SettingsService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.passkeys.load(),
      this.credentials.loadStatus(),
      this.settings.hydrateFromAccount(),
    ]);
  }

  async enrollPasskey(): Promise<void> {
    this.passkeyBusy.set(true);
    this.passkeyError.set(null);

    try {
      await this.passkeys.register();
    } catch (error) {
      this.passkeyError.set(
        error instanceof Error
          ? error.message
          : "Unable to create passkey.",
      );
    } finally {
      this.passkeyBusy.set(false);
    }
  }

  async saveCredential(value: {
    readonly provider: AiProvider;
    readonly apiKey: string;
  }): Promise<void> {
    this.credentialBusy.set(true);
    this.credentialError.set(null);

    try {
      await this.credentials.save(
        value.provider,
        value.apiKey,
      );

      this.credentialDialog?.clear();
    } catch (error) {
      this.credentialError.set(
        error instanceof Error
          ? error.message
          : "Unable to save provider credential.",
      );
    } finally {
      this.credentialBusy.set(false);
    }
  }

  async activate(): Promise<void> {
    if (this.ready()) {
      await this.voice.connect();
    }
  }

  async logout(): Promise<void> {
    this.voice.disconnect();
    await this.auth.logout();
  }
}
