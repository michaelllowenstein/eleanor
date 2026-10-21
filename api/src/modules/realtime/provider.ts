import { createHash } from "node:crypto";

import type {
  DecodedAssistantProfile,
} from "../profile/metric.js";

export interface RealtimeCallRequest {
  readonly sdp: string;
  readonly userId: string;
  readonly profile: DecodedAssistantProfile;
}

export interface RealtimeProvider {
  /** Exchanges a browser SDP offer for the provider's SDP answer. */
  createCall(request: RealtimeCallRequest): Promise<string>;
}

export type RealtimeProviderFactory = (apiKey: string) => RealtimeProvider;

/** Raised when the upstream provider rejects or fails the call. */
export class RealtimeProviderError extends Error {
  constructor(
    readonly upstreamStatus: number,
    readonly code:
      | "PROVIDER_AUTH_FAILED"
      | "PROVIDER_RATE_LIMITED"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_BAD_RESPONSE",
  ) {
    super(`Realtime provider rejected session (${upstreamStatus}, ${code}).`);
    this.name = "RealtimeProviderError";
  }
}

export function createOpenAIRealtimeProviderFactory(
  model: string,
): RealtimeProviderFactory {
  return (apiKey) => createOpenAIRealtimeProvider(apiKey, model);
}

export function createOpenAIRealtimeProvider(
  apiKey: string,
  model: string,
): RealtimeProvider {
  return {
    async createCall(request) {
      const session = {
        type: "realtime",
        model,
        output_modalities: ["audio"],
        instructions: `
You are Eleanor, a realtime personal AI assistant.
Personality: ${request.profile.personality}.
Verbosity: ${request.profile.verbosity}.
Formality: ${request.profile.formality}.
Initiative: ${request.profile.initiative}.
Humor: ${request.profile.humor}/3.
Speak naturally, handle interruption gracefully, and never claim an external action
succeeded unless a trusted tool confirms it.
`.trim(),
        max_output_tokens:
          request.profile.verbosity === "brief"
            ? 220
            : request.profile.verbosity === "detailed"
              ? 1400
              : 600,
        reasoning: { effort: "low" },
        audio: {
          input: {
            noise_reduction: { type: "near_field" },
            turn_detection: {
              type: "semantic_vad",
              eagerness:
                request.profile.turnTaking === "patient"
                  ? "low"
                  : request.profile.turnTaking === "quick"
                    ? "high"
                    : "medium",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            voice: request.profile.voice,
            speed: request.profile.speechSpeed,
          },
        },
      };

      const form = new FormData();
      form.set("sdp", request.sdp);
      form.set("session", JSON.stringify(session));

      const upstream = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "OpenAI-Safety-Identifier": createHash("sha256")
              .update(request.userId)
              .digest("hex"),
          },
          body: form,
          signal: AbortSignal.timeout(20_000),
        },
      );

      const answer = await upstream.text();

      if (!upstream.ok) {
        throw new RealtimeProviderError(
          upstream.status,
          upstream.status === 401 || upstream.status === 403
            ? "PROVIDER_AUTH_FAILED"
            : upstream.status === 429
              ? "PROVIDER_RATE_LIMITED"
              : "PROVIDER_UNAVAILABLE",
        );
      }

      if (!answer.trim().startsWith("v=0")) {
        throw new RealtimeProviderError(upstream.status, "PROVIDER_BAD_RESPONSE");
      }

      return answer;
    },
  };
}
