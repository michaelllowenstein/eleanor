import type {
  RealtimeServerEvent,
} from "../schema/models/realtime";
import { summarizeSdp } from "../schema/utils/sdp";
import { NOOP_LOGGER, type ScopedLogger } from "../services/log";
import type {
  RealtimeTransport,
  RealtimeTransportHandlers,
} from './realtime';

/**
 * The production transport: WebRTC to the OpenAI Realtime API.
 *
 * Tracing (category "realtime.webrtc"):
 *  - SDP offer/answer layout (never the raw SDP: it holds IPs and ICE secrets)
 *  - every signaling / ICE gathering / ICE connection / peer state change,
 *    with ms since connect() started
 *  - ICE candidate errors, data-channel open/close/error
 *  - each server event type at debug (".delta" events are counted, not logged)
 *  - a getStats() snapshot on connect, on failure and on close: candidate
 *    types, protocol, RTT, jitter, packet loss
 */
export class WebRTCRealtimeTransport implements RealtimeTransport {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private startedAt = 0;
  private deltaCounts = new Map<string, number>();

  constructor(private readonly log: ScopedLogger = NOOP_LOGGER) {}

  async connect(
    microphone: MediaStream,
    exchangeSdp: (offer: string) => Promise<string>,
    handlers: RealtimeTransportHandlers,
  ): Promise<void> {
    this.startedAt = performance.now();
    const since = () => Math.round(performance.now() - this.startedAt);

    const peerConnection = new RTCPeerConnection();
    this.peerConnection = peerConnection;

    peerConnection.addEventListener("track", (event: RTCTrackEvent) => {
      this.log.info("track.remote", {
        ms: since(),
        kind: event.track.kind,
        streams: event.streams.length,
      });
      handlers.onRemoteAudio(event.streams[0] ?? new MediaStream([event.track]));
    });

    for (const track of microphone.getAudioTracks()) {
      const settings = track.getSettings();
      this.log.debug("track.local", {
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        enabled: track.enabled,
        muted: track.muted,
      });
      peerConnection.addTrack(track, microphone);
    }

    const dataChannel = peerConnection.createDataChannel("oai-events");
    this.dataChannel = dataChannel;

    dataChannel.addEventListener("open", () => {
      this.log.info("datachannel.open", { ms: since() });
      handlers.onChannelOpen();
    });

    dataChannel.addEventListener("close", () => {
      this.log.info("datachannel.close", { ms: since(), deltas: Object.fromEntries(this.deltaCounts) });
    });

    dataChannel.addEventListener("message", (event: MessageEvent<string>) => {
      let parsed: RealtimeServerEvent;

      try {
        parsed = JSON.parse(event.data) as RealtimeServerEvent;
      } catch {
        this.log.warn("event.malformed", { bytes: typeof event.data === "string" ? event.data.length : 0 });
        return;
      }

      if (parsed.type.endsWith(".delta")) {
        this.deltaCounts.set(parsed.type, (this.deltaCounts.get(parsed.type) ?? 0) + 1);
      } else if (this.log.enabled("debug")) {
        this.log.debug("event.received", {
          type: parsed.type,
          eventId: parsed.event_id,
          responseId: parsed.response_id ?? parsed.response?.id,
          itemId: parsed.item_id,
        });
      }

      handlers.onEvent(parsed);
    });

    dataChannel.addEventListener("error", (event) => {
      const error = (event as RTCErrorEvent).error;
      this.log.error("datachannel.error", {
        ms: since(),
        errorDetail: error?.errorDetail,
        message: error?.message,
        sctpCauseCode: error?.sctpCauseCode,
      });
    });

    peerConnection.addEventListener("signalingstatechange", () => {
      this.log.debug("signaling.state", { ms: since(), state: peerConnection.signalingState });
    });

    peerConnection.addEventListener("icegatheringstatechange", () => {
      this.log.debug("ice.gathering", { ms: since(), state: peerConnection.iceGatheringState });
    });

    peerConnection.addEventListener("iceconnectionstatechange", () => {
      const state = peerConnection.iceConnectionState;
      const fields = { ms: since(), state };
      if (state === "failed" || state === "disconnected") this.log.warn("ice.connection", fields);
      else this.log.debug("ice.connection", fields);
    });

    peerConnection.addEventListener("icecandidateerror", (event) => {
      const e = event as RTCPeerConnectionIceErrorEvent;
      // No address or URL: errorCode/errorText are enough to tell STUN/TURN
      // failures apart, and the address would identify the user's network.
      this.log.warn("ice.candidate_error", { ms: since(), errorCode: e.errorCode, errorText: e.errorText });
    });

    peerConnection.addEventListener("connectionstatechange", () => {
      const connectionState = peerConnection.connectionState;
      const fields = { ms: since(), state: connectionState };

      switch (connectionState) {
        case "connected":
          this.log.info("peer.connected", fields);
          void this.logStats("stats.connected");
          handlers.onConnectionState(connectionState);
          break;

        case "failed":
          this.log.error("peer.failed", fields);
          void this.logStats("stats.failed");
          handlers.onConnectionState(connectionState);
          break;

        case "closed":
          this.log.info("peer.closed", fields);
          handlers.onConnectionState(connectionState);
          break;

        default:
          this.log.debug("peer.state", fields);
          break;
      }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    if (!offer.sdp) {
      this.log.error("sdp.offer_empty");
      throw new Error("Browser failed to create a WebRTC SDP offer.");
    }

    this.log.debug("sdp.offer", { ms: since(), offer: summarizeSdp(offer.sdp) });

    const answerSdp = await exchangeSdp(offer.sdp);
    const answer = summarizeSdp(answerSdp);
    this.log.debug("sdp.answer", { ms: since(), answer });

    if (answer.session === "eleanor-mock") {
      this.log.error("sdp.answer_is_mock", { answer });
      throw new Error(
        "The API is in mock mode. Set REALTIME_PROVIDER=openai in api/.env and restart the API.",
      );
    }

    try {
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
    } catch (error) {
      this.log.error("sdp.answer_rejected", {
        error,
        offer: summarizeSdp(offer.sdp),
        answer,
      });
      throw error;
    }
  }

  isOpen(): boolean {
    return this.dataChannel?.readyState === "open";
  }

  send(event: object): void {
    if (this.isOpen()) {
      this.log.debug("event.sent", { type: (event as { type?: string }).type });
      this.dataChannel!.send(JSON.stringify(event));
    } else {
      this.log.warn("event.dropped", {
        type: (event as { type?: string }).type,
        channel: this.dataChannel?.readyState ?? "none",
      });
    }
  }

  close(): void {
    if (this.peerConnection && this.peerConnection.connectionState === "connected") {
      void this.logStats("stats.closing");
    }

    this.dataChannel?.close();
    this.peerConnection?.close();

    this.dataChannel = null;
    this.peerConnection = null;
    this.deltaCounts = new Map();
  }

  private async logStats(message: string): Promise<void> {
    const peer = this.peerConnection;
    if (!peer) return;
    try {
      this.log.info(message, await collectStats(peer));
    } catch (error) {
      this.log.debug("stats.unavailable", { error });
    }
  }
}

/** Addresses are deliberately left out; types, protocol and quality only. */
async function collectStats(peer: RTCPeerConnection): Promise<Record<string, unknown>> {
  const report = await peer.getStats();
  const stats = new Map<string, Record<string, unknown>>();
  report.forEach((value: Record<string, unknown>, key: string) => stats.set(key, value));

  let pair: Record<string, unknown> | undefined;
  for (const value of stats.values()) {
    if (value["type"] === "transport" && typeof value["selectedCandidatePairId"] === "string") {
      pair = stats.get(value["selectedCandidatePairId"]);
    }
  }
  if (!pair) {
    for (const value of stats.values()) {
      if (value["type"] === "candidate-pair" && value["nominated"] && value["state"] === "succeeded") {
        pair = value;
      }
    }
  }

  const candidate = (id: unknown) => {
    const c = typeof id === "string" ? stats.get(id) : undefined;
    return c
      ? { type: c["candidateType"], protocol: c["protocol"], networkType: c["networkType"], relay: c["relayProtocol"] }
      : undefined;
  };

  const out: Record<string, unknown> = {};
  if (pair) {
    out["pair"] = {
      state: pair["state"],
      local: candidate(pair["localCandidateId"]),
      remote: candidate(pair["remoteCandidateId"]),
      rttMs:
        typeof pair["currentRoundTripTime"] === "number"
          ? Math.round((pair["currentRoundTripTime"] as number) * 1000)
          : undefined,
      bytesSent: pair["bytesSent"],
      bytesReceived: pair["bytesReceived"],
    };
  }

  for (const value of stats.values()) {
    if (value["type"] === "inbound-rtp" && value["kind"] === "audio") {
      out["inboundAudio"] = {
        packetsReceived: value["packetsReceived"],
        packetsLost: value["packetsLost"],
        jitterMs: typeof value["jitter"] === "number" ? Math.round((value["jitter"] as number) * 1000) : undefined,
        concealedSamples: value["concealedSamples"],
      };
    }
    if (value["type"] === "outbound-rtp" && value["kind"] === "audio") {
      out["outboundAudio"] = { packetsSent: value["packetsSent"], bytesSent: value["bytesSent"] };
    }
  }

  return out;
}
