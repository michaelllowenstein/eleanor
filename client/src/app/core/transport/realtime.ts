import { InjectionToken } from "@angular/core";

import type { RealtimeServerEvent } from "../schema/models/realtime";

/** How a transport reports back to RealtimeVoiceService. */
export interface RealtimeTransportHandlers {
  /** A parsed Realtime server event. */
  onEvent(event: RealtimeServerEvent): void;
  /** The assistant's audio, to play and to feed the output level analyser. */
  onRemoteAudio(stream: MediaStream): void;
  /** The event channel is open; session.update can be sent now. */
  onChannelOpen(): void;
  onConnectionState(state: "connected" | "failed" | "closed"): void;
}

/**
 * One realtime session. A new instance is created for every connect().
 *
 * `exchangeSdp` posts an SDP offer to /api/realtime/session and resolves with
 * the answer; it throws with the API's error message on failure, so every
 * transport exercises the same auth, CSRF, rate-limit and provider path.
 */
export interface RealtimeTransport {
  connect(
    microphone: MediaStream,
    exchangeSdp: (offer: string) => Promise<string>,
    handlers: RealtimeTransportHandlers,
  ): Promise<void>;
  /** True when send() would deliver an event. */
  isOpen(): boolean;
  send(event: object): void;
  /** Releases every resource the transport created. Safe to call twice. */
  close(): void;
}

export type RealtimeTransportFactory = () => RealtimeTransport;

export const REALTIME_TRANSPORT = new InjectionToken<RealtimeTransportFactory>(
  "REALTIME_TRANSPORT",
);