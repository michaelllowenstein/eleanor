export type VoiceConnectionState =
  | "offline"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

/**
 * The subset of Realtime server-event fields Eleanor reads. Everything is
 * optional: events differ by type and unknown fields are ignored.
 */
export interface RealtimeServerEvent {
  readonly type: string;
  readonly event_id?: string;
  readonly response_id?: string;
  readonly item_id?: string;

  readonly response?: {
    readonly id?: string;
    readonly status?: string;
    readonly status_details?: unknown;
    readonly usage?: Record<string, unknown>;
  };

  readonly rate_limits?: readonly unknown[];

  readonly error?: {
    readonly message?: string;
    readonly type?: string;
    readonly code?: string;
    readonly param?: string;
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
