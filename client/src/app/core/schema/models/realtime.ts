export type VoiceConnectionState =
  | "offline"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface RealtimeServerEvent {
  readonly type: string;

  readonly error?: {
    readonly message?: string;
  };
}

export interface RealtimeSessionUpdateEvent {
  readonly type: "session.update";

  readonly session: {
    readonly type: "realtime";

    readonly instructions: string;

    readonly max_output_tokens: number;

    readonly audio: {
      readonly input: {
        readonly turn_detection: {
          readonly type: "semantic_vad";
          readonly eagerness:
            | "low"
            | "medium"
            | "high";
          readonly create_response: true;
          readonly interrupt_response: true;
        };
      };

      readonly output: {
        readonly speed: number;
        readonly voice?: string;
      };
    };
  };
}