export type AssistantPersonality =
  | "professional"
  | "warm"
  | "witty"
  | "direct";

export type AssistantVerbosity =
  | "brief"
  | "balanced"
  | "detailed";

export type AssistantFormality =
  | "casual"
  | "neutral"
  | "formal";

export type AssistantInitiative =
  | "reactive"
  | "balanced"
  | "proactive";

export type AssistantTurnTaking =
  | "patient"
  | "balanced"
  | "quick";

export type AssistantVoice =
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

export interface AssistantSettings {
  readonly personality: AssistantPersonality;
  readonly verbosity: AssistantVerbosity;
  readonly formality: AssistantFormality;
  readonly initiative: AssistantInitiative;
  readonly turnTaking: AssistantTurnTaking;
  readonly humor: number;
  readonly speechSpeed: number;
  readonly voice: AssistantVoice;
}

export interface AssistantProfile {
  readonly id: string;
  readonly name: string;
  readonly settings: AssistantSettings;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PersistedAssistantProfiles {
  readonly version: 1;
  readonly activeProfileId: string;
  readonly profiles: readonly AssistantProfile[];
}