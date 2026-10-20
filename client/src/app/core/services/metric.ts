import { Injectable } from "@angular/core";

import type {
  AssistantSettings,
} from "../schema/models/settings";

const PERSONALITIES = [
  "professional",
  "warm",
  "witty",
  "direct",
] as const;

const VERBOSITIES = [
  "brief",
  "balanced",
  "detailed",
] as const;

const FORMALITIES = [
  "casual",
  "neutral",
  "formal",
] as const;

const INITIATIVES = [
  "reactive",
  "balanced",
  "proactive",
] as const;

const TURNS = [
  "patient",
  "balanced",
  "quick",
] as const;

const HUMORS = [0, 1, 2, 3] as const;

const SPEEDS = [
  0.75,
  0.8,
  0.85,
  0.9,
  0.95,
  1,
  1.05,
  1.1,
  1.15,
  1.2,
  1.25,
  1.3,
] as const;

const VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

const WEIGHTS = {
  personality: 1,
  verbosity: 4,
  formality: 12,
  initiative: 36,
  turnTaking: 108,
  humor: 324,
  speechSpeed: 1296,
  voice: 15552,
} as const;

@Injectable({
  providedIn: "root",
})
export class ProfileMetricService {
  encode(settings: AssistantSettings): number {
    return (
      1_000_000 +
      this.index(PERSONALITIES, settings.personality) *
        WEIGHTS.personality +
      this.index(VERBOSITIES, settings.verbosity) *
        WEIGHTS.verbosity +
      this.index(FORMALITIES, settings.formality) *
        WEIGHTS.formality +
      this.index(INITIATIVES, settings.initiative) *
        WEIGHTS.initiative +
      this.index(TURNS, settings.turnTaking) *
        WEIGHTS.turnTaking +
      this.index(HUMORS, settings.humor) *
        WEIGHTS.humor +
      this.index(SPEEDS, settings.speechSpeed) *
        WEIGHTS.speechSpeed +
      this.index(VOICES, settings.voice) *
        WEIGHTS.voice
    );
  }

  decode(metric: number): AssistantSettings {
    if (
      !Number.isSafeInteger(metric) ||
      metric < 1_000_000 ||
      metric > 1_155_519
    ) {
      throw new Error("Invalid Eleanor profile metric.");
    }

    const payload = metric - 1_000_000;

    const digit = (
      weight: number,
      radix: number,
    ) => Math.floor(payload / weight) % radix;

    return {
      personality:
        PERSONALITIES[
          digit(WEIGHTS.personality, PERSONALITIES.length)
        ],
      verbosity:
        VERBOSITIES[
          digit(WEIGHTS.verbosity, VERBOSITIES.length)
        ],
      formality:
        FORMALITIES[
          digit(WEIGHTS.formality, FORMALITIES.length)
        ],
      initiative:
        INITIATIVES[
          digit(WEIGHTS.initiative, INITIATIVES.length)
        ],
      turnTaking:
        TURNS[
          digit(WEIGHTS.turnTaking, TURNS.length)
        ],
      humor:
        HUMORS[
          digit(WEIGHTS.humor, HUMORS.length)
        ],
      speechSpeed:
        SPEEDS[
          digit(WEIGHTS.speechSpeed, SPEEDS.length)
        ],
      voice:
        VOICES[
          digit(WEIGHTS.voice, VOICES.length)
        ],
    };
  }

  private index<
    TValue extends string | number,
  >(
    values: readonly TValue[],
    value: TValue,
  ): number {
    const index = values.indexOf(value);

    if (index < 0) {
      throw new Error(
        `Unsupported profile value: ${String(value)}.`,
      );
    }

    return index;
  }
}
