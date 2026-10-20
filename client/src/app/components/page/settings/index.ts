import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from "@angular/core";

import {
  RouterLink,
} from "@angular/router";
import { AssistantPersonality, AssistantVerbosity, AssistantFormality, AssistantInitiative, AssistantTurnTaking, AssistantVoice } from "../../../core/schema/models/settings";
import { RealtimeVoiceService } from "../../../core/services/realtime";
import { AssistantSettingsService } from "../../../core/services/settings";
import { SegmentedControlComponent } from "../../feature/segmented-control";
import type { SegmentedControlOption } from "../../feature/segmented-control";
import { PasskeyService } from "../../../core/services/passkey";
import { ProviderService } from "../../../core/services/provider";

@Component({
  selector: "app-security-page",
  standalone: true,
  imports: [RouterLink, SegmentedControlComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html',
})
export class SettingsPage {
  readonly personalityOptions =
    options(
      "Professional",
      "Warm",
      "Witty",
      "Direct",
    );

  readonly verbosityOptions =
    options(
      "Brief",
      "Balanced",
      "Detailed",
    );

  readonly formalityOptions =
    options(
      "Casual",
      "Neutral",
      "Formal",
    );

  readonly initiativeOptions =
    options(
      "Reactive",
      "Balanced",
      "Proactive",
    );

  readonly turnTakingOptions =
    options(
      "Patient",
      "Balanced",
      "Quick",
    );

  readonly voiceOptions:
    readonly SegmentedControlOption[] =
    [
      "marin",
      "cedar",
      "alloy",
      "ash",
      "ballad",
      "coral",
      "echo",
      "sage",
      "shimmer",
      "verse",
    ].map((value) => ({
      value,
      label:
        value[0]!.toUpperCase() +
        value.slice(1),
    }));

  constructor(
    readonly settings: AssistantSettingsService,
    readonly passkeys: PasskeyService,
    readonly credentials: ProviderService,
  ) {}

  changePersonality(value: string): void {
    this.settings.updatePersonality(
      value as AssistantPersonality,
    );
  }

  changeVerbosity(value: string): void {
    this.settings.updateVerbosity(
      value as AssistantVerbosity,
    );
  }

  changeFormality(value: string): void {
    this.settings.updateFormality(
      value as AssistantFormality,
    );
  }

  changeInitiative(value: string): void {
    this.settings.updateInitiative(
      value as AssistantInitiative,
    );
  }

  changeTurnTaking(value: string): void {
    this.settings.updateTurnTaking(
      value as AssistantTurnTaking,
    );
  }

  changeVoice(value: string): void {
    this.settings.updateVoice(
      value as AssistantVoice,
    );
  }

  changeHumor(event: Event): void {
    this.settings.updateHumor(
      Number(
        (event.target as HTMLInputElement).value,
      ),
    );
  }

  changeSpeechSpeed(event: Event): void {
    this.settings.updateSpeechSpeed(
      Number(
        (event.target as HTMLInputElement).value,
      ),
    );
  }
}

function options(
  ...labels: string[]
): readonly SegmentedControlOption[] {
  return labels.map((label) => ({
    label,
    value: label.toLowerCase(),
  }));
}