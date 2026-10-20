import {
  Injectable,
  computed,
  inject,
  signal,
} from "@angular/core";

import type {
  AssistantFormality,
  AssistantInitiative,
  AssistantPersonality,
  AssistantSettings,
  AssistantTurnTaking,
  AssistantVerbosity,
  AssistantVoice,
} from "../schema/models/settings";
import { ProfileMetricService } from "./metric";

const DEFAULT_SETTINGS: AssistantSettings = {
  personality: "professional",
  verbosity: "balanced",
  formality: "neutral",
  initiative: "balanced",
  turnTaking: "balanced",
  humor: 1,
  speechSpeed: 1,
  voice: "marin"
};

@Injectable({
  providedIn: "root"
})
export class AssistantSettingsService {
  private readonly profileMetricService: ProfileMetricService = inject(ProfileMetricService);

  readonly settings = signal<AssistantSettings>(DEFAULT_SETTINGS);

  readonly profileMetric = computed(
    () =>
      this.profileMetricService.encode(
        this.settings(),
      ),
  );

  readonly instructions = computed(
    () => this.buildInstructions(this.settings()),
  );

  readonly maxOutputTokens = computed(
    () => {
      switch (this.settings().verbosity) {
        case "brief":
          return 220;

        case "balanced":
          return 600;

        case "detailed":
          return 1400;
      }
    },
  );

  readonly vadEagerness = computed(
    (): "low" | "medium" | "high" => {
      switch (this.settings().turnTaking) {
        case "patient":
          return "low";

        case "balanced":
          return "medium";

        case "quick":
          return "high";
      }
    },
  );

  updatePersonality(
    personality: AssistantPersonality,
  ): void {
    this.patch({
      personality
    });
  }

  updateVerbosity(
    verbosity: AssistantVerbosity,
  ): void {
    this.patch({
      verbosity
    });
  }

  updateFormality(
    formality: AssistantFormality,
  ): void {
    this.patch({
      formality
    });
  }

  updateInitiative(
    initiative: AssistantInitiative,
  ): void {
    this.patch({
      initiative
    });
  }

  updateTurnTaking(
    turnTaking: AssistantTurnTaking,
  ): void {
    this.patch({
      turnTaking
    });
  }

  updateHumor(
    humor: number,
  ): void {
    this.patch({
      humor: this.clamp(humor, 0, 3)
    });
  }

  updateSpeechSpeed(
    speechSpeed: number,
  ): void {
    this.patch({
      speechSpeed:
        this.clamp(speechSpeed, 0.75, 1.3)
    });
  }

  updateVoice(
    voice: AssistantVoice,
  ): void {
    this.patch({
      voice
    });
  }

  reset(): void {
    this.settings.set(DEFAULT_SETTINGS);
  }

  private patch(
    changes: Partial<AssistantSettings>,
  ): void {
    this.settings.update(
      (current) => ({
        ...current,
        ...changes
      }),
    );
  }

  private buildInstructions(
    settings: AssistantSettings,
  ): string {
    const personality =
      this.personalityInstruction(
        settings.personality,
      );

    const verbosity =
      this.verbosityInstruction(
        settings.verbosity,
      );

    const formality =
      this.formalityInstruction(
        settings.formality,
      );

    const initiative =
      this.initiativeInstruction(
        settings.initiative,
      );

    const humor =
      this.humorInstruction(settings.humor);

    return `
You are ELEANOR, a realtime personal voice assistant.

Core behavior:
- Speak naturally and conversationally.
- Optimize responses for spoken conversation.
- Handle interruptions naturally.
- Remember the current conversation.
- Never claim an external action succeeded unless a tool confirms it.
- Never describe yourself as human.
- Your name is ELEANOR.

Personality:
${personality}

Response length:
${verbosity}

Communication style:
${formality}

Initiative:
${initiative}

Humor:
${humor}

Conversation:
- Resolve follow-up questions from conversational context.
- Ask one concise clarification question when required.
- Avoid repetitive acknowledgements.
- Avoid markdown-like formatting in spoken responses.
`.trim();
  }

  private personalityInstruction(
    personality: AssistantPersonality,
  ): string {
    switch (personality) {
      case "professional":
        return [
          "- Calm, highly competent and composed.",
          "- Prefer precise language.",
          "- Remain approachable without sounding overly enthusiastic."
        ].join("\n");

      case "warm":
        return [
          "- Friendly, empathetic and relaxed.",
          "- Sound interested in the conversation.",
          "- Prefer natural everyday phrasing."
        ].join("\n");

      case "witty":
        return [
          "- Intelligent, playful and quick-witted.",
          "- Use occasional dry humor.",
          "- Never let humor interfere with accuracy."
        ].join("\n");

      case "direct":
        return [
          "- Highly concise and decisive.",
          "- Lead with the answer.",
          "- Minimize social filler."
        ].join("\n");
    }
  }

  private verbosityInstruction(
    verbosity: AssistantVerbosity,
  ): string {
    switch (verbosity) {
      case "brief":
        return [
          "- Keep most responses to one or two spoken sentences.",
          "- Add detail only when explicitly requested."
        ].join("\n");

      case "balanced":
        return [
          "- Give enough context to answer clearly.",
          "- Prefer short conversational explanations."
        ].join("\n");

      case "detailed":
        return [
          "- Explain reasoning and context when useful.",
          "- Longer answers are acceptable, but remain conversational."
        ].join("\n");
    }
  }

  private formalityInstruction(
    formality: AssistantFormality,
  ): string {
    switch (formality) {
      case "casual":
        return [
          "- Use relaxed conversational language.",
          "- Use contractions naturally."
        ].join("\n");

      case "neutral":
        return [
          "- Use polished conversational language.",
          "- Avoid being either overly casual or overly formal."
        ].join("\n");

      case "formal":
        return [
          "- Use professional, polished language.",
          "- Avoid slang."
        ].join("\n");
    }
  }

  private initiativeInstruction(
    initiative: AssistantInitiative,
  ): string {
    switch (initiative) {
      case "reactive":
        return [
          "- Answer only what was requested.",
          "- Avoid unsolicited suggestions."
        ].join("\n");

      case "balanced":
        return [
          "- Answer directly.",
          "- Offer a useful next step only when clearly relevant."
        ].join("\n");

      case "proactive":
        return [
          "- Anticipate likely follow-up needs.",
          "- Suggest useful next actions when appropriate.",
          "- Do not overwhelm the user with unnecessary suggestions."
        ].join("\n");
    }
  }

  private humorInstruction(
    humor: number,
  ): string {
    switch (humor) {
      case 0:
        return "- Do not deliberately use humor.";

      case 1:
        return "- Use humor rarely and subtly.";

      case 2:
        return "- Use occasional light or dry humor.";

      default:
        return [
          "- Be noticeably witty when the context allows.",
          "- Never joke about serious or sensitive situations."
        ].join("\n");
    }
  }

  private clamp(
    value: number,
    minimum: number,
    maximum: number,
  ): number {
    return Math.min(
      maximum,
      Math.max(minimum, value),
    );
  }
}
