export interface DecodedAssistantProfile {
  readonly personality: "professional" | "warm" | "witty" | "direct";
  readonly verbosity: "brief" | "balanced" | "detailed";
  readonly formality: "casual" | "neutral" | "formal";
  readonly initiative: "reactive" | "balanced" | "proactive";
  readonly turnTaking: "patient" | "balanced" | "quick";
  readonly humor: number;
  readonly speechSpeed: number;
  readonly voice:
    | "alloy"
    | "ash"
    | "ballad"
    | "coral"
    | "echo"
    | "sage"
    | "shimmer"
    | "verse"
    | "marin"
    | "cedar";
}

const PERSONALITIES = ["professional", "warm", "witty", "direct"] as const;
const VERBOSITIES = ["brief", "balanced", "detailed"] as const;
const FORMALITIES = ["casual", "neutral", "formal"] as const;
const INITIATIVES = ["reactive", "balanced", "proactive"] as const;
const TURNS = ["patient", "balanced", "quick"] as const;
const HUMORS = [0, 1, 2, 3] as const;
const SPEEDS = [0.75,0.8,0.85,0.9,0.95,1,1.05,1.1,1.15,1.2,1.25,1.3] as const;
const VOICES = ["alloy","ash","ballad","coral","echo","sage","shimmer","verse","marin","cedar"] as const;
const W = { personality:1, verbosity:4, formality:12, initiative:36, turn:108, humor:324, speed:1296, voice:15552 } as const;

export const DEFAULT_PROFILE_METRIC = 1_131_380n;

export function validateProfileMetric(input: unknown) {
  const raw = String(input).trim();

  if (!/^\d+$/.test(raw)) {
    throw new Error("Profile metric must contain digits only.");
  }

  const value = BigInt(raw);

  if (value < 1_000_000n || value > 1_155_519n) {
    throw new Error("Profile metric is outside the supported v1 range.");
  }

  return {
    value,
    version: 1,
  };
}

export function decodeProfileMetric(input: unknown): DecodedAssistantProfile {
  const payload = Number(
    validateProfileMetric(input).value - 1_000_000n,
  );
  const digit = (weight: number, radix: number) =>
    Math.floor(payload / weight) % radix;

  return {
    personality: PERSONALITIES[digit(W.personality, PERSONALITIES.length)],
    verbosity: VERBOSITIES[digit(W.verbosity, VERBOSITIES.length)],
    formality: FORMALITIES[digit(W.formality, FORMALITIES.length)],
    initiative: INITIATIVES[digit(W.initiative, INITIATIVES.length)],
    turnTaking: TURNS[digit(W.turn, TURNS.length)],
    humor: HUMORS[digit(W.humor, HUMORS.length)],
    speechSpeed: SPEEDS[digit(W.speed, SPEEDS.length)],
    voice: VOICES[digit(W.voice, VOICES.length)],
  };
}
