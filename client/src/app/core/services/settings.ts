import {
  Injectable,
  computed,
  signal,
} from "@angular/core";

import { ProfileApiService } from "./api";
import { ProfileMetricService } from "./metric";
import type {
  AssistantFormality,
  AssistantInitiative,
  AssistantPersonality,
  AssistantSettings,
  AssistantTurnTaking,
  AssistantVerbosity,
  AssistantVoice,
} from "../schema/models/settings";

const STORAGE_KEY =
  "eleanor.assistant-profile.metric";

const DEFAULTS: AssistantSettings = {
  personality: "professional",
  verbosity: "balanced",
  formality: "neutral",
  initiative: "balanced",
  turnTaking: "balanced",
  humor: 1,
  speechSpeed: 1,
  voice: "marin",
};

@Injectable({
  providedIn: "root",
})
export class SettingsService {
  readonly settings = signal<AssistantSettings>(
    this.loadLocal(),
  );

  readonly profileMetric = computed(
    () => this.codec.encode(this.settings()),
  );

  readonly instructions = computed(
    () => `
You are Eleanor, a realtime personal AI assistant.

Profile:
- Personality: ${this.settings().personality}
- Verbosity: ${this.settings().verbosity}
- Formality: ${this.settings().formality}
- Initiative: ${this.settings().initiative}
- Humor: ${this.settings().humor}/3

Speak naturally and conversationally.
Handle interruptions gracefully.
Never claim an external action succeeded unless a trusted tool confirms it.
`.trim(),
  );

  readonly maxOutputTokens = computed(() =>
    this.settings().verbosity === "brief"
      ? 220
      : this.settings().verbosity === "detailed"
        ? 1400
        : 600,
  );

  readonly vadEagerness = computed<
    "low" | "medium" | "high"
  >(() =>
    this.settings().turnTaking === "patient"
      ? "low"
      : this.settings().turnTaking === "quick"
        ? "high"
        : "medium",
  );

  private saveTimer:
    ReturnType<typeof setTimeout> | null =
    null;

  constructor(
    private readonly codec: ProfileMetricService,
    private readonly api: ProfileApiService,
  ) {}

  async hydrateFromAccount(): Promise<void> {
    const remoteMetric = await this.api.load();

    if (remoteMetric) {
      this.set(
        this.codec.decode(Number(remoteMetric)),
        false,
      );
      return;
    }

    await this.api.save(this.profileMetric());
  }

  updatePersonality(
    value: AssistantPersonality,
  ): void {
    this.patch({ personality: value });
  }

  updateVerbosity(
    value: AssistantVerbosity,
  ): void {
    this.patch({ verbosity: value });
  }

  updateFormality(
    value: AssistantFormality,
  ): void {
    this.patch({ formality: value });
  }

  updateInitiative(
    value: AssistantInitiative,
  ): void {
    this.patch({ initiative: value });
  }

  updateTurnTaking(
    value: AssistantTurnTaking,
  ): void {
    this.patch({ turnTaking: value });
  }

  updateVoice(
    value: AssistantVoice,
  ): void {
    this.patch({ voice: value });
  }

  updateHumor(value: number): void {
    this.patch({
      humor: Math.max(
        0,
        Math.min(3, Math.round(value)),
      ),
    });
  }

  updateSpeechSpeed(value: number): void {
    const clamped = Math.max(
      0.75,
      Math.min(1.3, value),
    );

    this.patch({
      speechSpeed: Number(
        (
          Math.round((clamped - 0.75) / 0.05) *
            0.05 +
          0.75
        ).toFixed(2),
      ),
    });
  }

  reset(): void {
    this.set(DEFAULTS, true);
  }

  private patch(
    changes: Partial<AssistantSettings>,
  ): void {
    this.set(
      {
        ...this.settings(),
        ...changes,
      },
      true,
    );
  }

  private set(
    settings: AssistantSettings,
    sync: boolean,
  ): void {
    this.settings.set(settings);

    const metric = this.codec.encode(settings);

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        STORAGE_KEY,
        String(metric),
      );
    }

    if (!sync) {
      return;
    }

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      void this.api.save(metric);
    }, 450);
  }

  private loadLocal(): AssistantSettings {
    if (typeof localStorage === "undefined") {
      return DEFAULTS;
    }

    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return DEFAULTS;
    }

    try {
      return this.codec.decode(Number(raw));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return DEFAULTS;
    }
  }
}
