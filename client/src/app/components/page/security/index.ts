import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from "@angular/core";

import {
  RouterLink,
} from "@angular/router";
import { PasskeyService } from "../../../core/services/passkey";
import { ProviderCredentialDetails, AiProvider, ProviderService } from "../../../core/services/provider";

@Component({
  selector: "app-home",
  standalone: true,
  imports: [
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "block min-h-screen"
  },
  templateUrl: './index.html'
})
export class SecurityPage implements OnInit {
  readonly busy = signal(false);
  readonly details =
    signal<ProviderCredentialDetails | null>(null);
  readonly provider = signal<AiProvider>("openai");
  readonly newApiKey = signal("");
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  constructor(
    readonly passkeys: PasskeyService,
    readonly credentials: ProviderService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.passkeys.load(),
      this.credentials.loadStatus(),
    ]);
  }

  async addPasskey(): Promise<void> {
    await this.perform(async () => {
      if (this.passkeys.registered()) {
        await this.passkeys.ensureStepUp();
      }

      await this.passkeys.register();
      this.message.set("Passkey added.");
    });
  }

  async viewDetails(): Promise<void> {
    await this.perform(async () => {
      this.details.set(
        await this.credentials.details(),
      );
    });
  }

  async removeCredential(): Promise<void> {
    await this.perform(async () => {
      await this.credentials.remove();
      this.details.set(null);
      this.message.set("Provider credential removed.");
    });
  }

  async replaceCredential(event: Event): Promise<void> {
    event.preventDefault();

    const apiKey = this.newApiKey().trim();

    if (apiKey.length < 20) {
      return;
    }

    await this.perform(async () => {
      await this.credentials.save(
        this.provider(),
        apiKey,
      );

      this.newApiKey.set("");
      this.details.set(
        await this.credentials.details(),
      );
      this.message.set("Provider credential replaced.");
    });
  }

  readProvider(event: Event): AiProvider {
    return (
      event.target as HTMLSelectElement
    ).value as AiProvider;
  }

  readInput(event: Event): string {
    return (
      event.target as HTMLInputElement
    ).value;
  }

  private async perform(
    operation: () => Promise<void>,
  ): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);

    try {
      await operation();
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : "Security operation failed.",
      );
    } finally {
      this.busy.set(false);
    }
  }
}
