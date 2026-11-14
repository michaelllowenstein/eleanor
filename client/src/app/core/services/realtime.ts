import {
  Injectable,
  effect,
  inject,
  signal,
} from "@angular/core";

import { env } from "../../../envs/env";
import { AudioLevelsService } from "./audio";
import { AuthService } from "./auth";
import { LogService } from "./log";
import {
  REALTIME_TRANSPORT,
  type RealtimeTransport,
} from "../transport/realtime";
import { SettingsService } from "./settings";

import type {
  RealtimeServerEvent,
  RealtimeSessionUpdateEvent,
  VoiceConnectionState,
} from "../schema/models/realtime";

/** Timing marks for the current voice session (performance.now() values). */
interface SessionTrace {
  readonly traceId: string;
  readonly activatedAt: number;
  connectedAt?: number;
  callId?: string;
  turns: number;
  responses: number;
  bargeIns: number;
  speechStoppedAt?: number;
  responseCreatedAt?: number;
  firstAudioAt?: number;
  lastAppliedSettings?: string;
}

@Injectable({
  providedIn: "root",
})
export class RealtimeVoiceService {
  private readonly auth: AuthService = inject(AuthService);
  private readonly settings: SettingsService = inject(SettingsService);
  private readonly audioLevels: AudioLevelsService = inject(AudioLevelsService);
  private readonly logs: LogService = inject(LogService);
  private readonly log = this.logs.scope("realtime");
  private readonly createTransport = inject(REALTIME_TRANSPORT);

  readonly state = signal<VoiceConnectionState>("offline");
  readonly message = signal("Activate ELEANOR to begin.");
  readonly connected = signal(false);
  readonly voiceLocked = signal(false);
  readonly settingsPending = signal(false);

  readonly inputLevel = this.audioLevels.inputLevel;
  readonly outputLevel = this.audioLevels.outputLevel;

  private transport: RealtimeTransport | null = null;
  private microphoneStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private session: SessionTrace | null = null;

  constructor() {
    effect(() => {
      this.settings.settings();
      this.settings.instructions();
      this.settings.maxOutputTokens();
      this.settings.vadEagerness();

      if (!this.connected()) {
        return;
      }

      if (this.state() === "speaking") {
        this.settingsPending.set(true);
        return;
      }

      this.applySettingsToSession();
    });
  }

  async connect(): Promise<void> {
    if (this.state() !== "offline" && this.state() !== "error") {
      return;
    }

    const traceId = this.logs.beginTrace();
    this.session = {
      traceId,
      activatedAt: performance.now(),
      turns: 0,
      responses: 0,
      bargeIns: 0,
    };

    this.log.info("session.activate", {
      transport: env.realtimeTransport,
      profileMetric: this.settings.profileMetric(),
      settings: this.settings.settings(),
    });

    this.voiceLocked.set(false);
    this.settingsPending.set(false);
    this.state.set("connecting");
    this.message.set("Requesting microphone access…");

    try {
      const micStarted = performance.now();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (error) {
        this.log.error("mic.denied", { error });
        throw error;
      }
      this.log.info("mic.granted", { ms: Math.round(performance.now() - micStarted) });

      this.microphoneStream = stream;
      await this.audioLevels.attachInput(stream);

      const audio = new Audio();
      audio.autoplay = true;
      this.remoteAudio = audio;

      const transport = this.createTransport();
      this.transport = transport;

      await transport.connect(stream, (offer) => this.exchangeSdp(offer), {
        onEvent: (event) => this.handleRealtimeEvent(event),
        onRemoteAudio: (remote) => this.playRemoteAudio(remote),
        onChannelOpen: () => {
          void this.audioLevels.resume();
          this.applySettingsToSession();
        },
        onConnectionState: (connectionState) => this.handleConnectionState(connectionState),
      });
    } catch (error) {
      this.log.error("session.connect_failed", { error, msSinceActivate: this.sinceActivate() });
      this.log.audit(
        "realtime.error",
        `Couldn't connect: ${error instanceof Error ? error.message : "unknown error"}`,
        { stage: "connect", error },
      );

      this.releaseResources();
      this.state.set("error");
      this.message.set(
        error instanceof Error ? error.message : "Unable to connect to ELEANOR.",
      );
      this.finishTrace("connect_failed");
    }
  }

  disconnect(): void {
    this.releaseResources();

    this.connected.set(false);
    this.voiceLocked.set(false);
    this.settingsPending.set(false);
    this.state.set("offline");
    this.message.set("Activate ELEANOR to begin.");
    this.finishTrace("user");
  }

  applySettingsToSession(): void {
    const transport = this.transport;

    if (!this.connected() || !transport?.isOpen()) {
      return;
    }

    if (this.state() === "speaking") {
      this.settingsPending.set(true);
      return;
    }

    const current = this.settings.settings();

    const output: RealtimeSessionUpdateEvent["session"]["audio"]["output"] = {
      speed: current.speechSpeed,
      ...(this.voiceLocked() ? {} : { voice: current.voice }),
    };

    const event: RealtimeSessionUpdateEvent = {
      type: "session.update",
      session: {
        type: "realtime",
        instructions: this.settings.instructions(),
        max_output_tokens: this.settings.maxOutputTokens(),
        audio: {
          input: {
            turn_detection: {
              type: "semantic_vad",
              eagerness: this.settings.vadEagerness(),
              create_response: true,
              interrupt_response: true,
            },
          },
          output,
        },
      },
    };

    transport.send(event);
    this.settingsPending.set(false);

    // Channel-open and peer-connected both apply settings; record each
    // distinct configuration once per session.
    const key = JSON.stringify(event.session);
    if (this.session && this.session.lastAppliedSettings !== key) {
      this.session.lastAppliedSettings = key;
      this.log.info("settings.applied", {
        settings: current,
        voiceIncluded: !this.voiceLocked(),
        eagerness: this.settings.vadEagerness(),
        maxOutputTokens: this.settings.maxOutputTokens(),
      });
      this.log.audit(
        "realtime.settings_applied",
        `Applied settings: ${current.personality}, ${current.verbosity}, ${current.formality}, ` +
          `turn-taking ${current.turnTaking}, humor ${current.humor}/3, speed ${current.speechSpeed}× — ` +
          (this.voiceLocked() ? `voice locked to the session's voice.` : `voice ${current.voice}.`),
        {
          settings: current,
          profileMetric: this.settings.profileMetric(),
          instructions: this.settings.instructions(),
          maxOutputTokens: this.settings.maxOutputTokens(),
          eagerness: this.settings.vadEagerness(),
          voiceLocked: this.voiceLocked(),
        },
      );
    }
  }

  /** Posts the SDP offer to the API and returns the answer. */
  private async exchangeSdp(offer: string): Promise<string> {
    this.message.set("Establishing realtime connection…");
    const started = performance.now();

    const response = await fetch("/api/realtime/session", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/sdp",
        "X-Eleanor-Profile-Metric": String(this.settings.profileMetric()),
        ...(this.session ? { "X-Eleanor-Trace-Id": this.session.traceId } : {}),
        ...this.auth.csrfHeaders(),
      },
      body: offer,
    });

    const ms = Math.round(performance.now() - started);
    const requestId = response.headers.get("x-request-id") ?? undefined;

    if (!response.ok) {
      let message = "Realtime session creation failed.";
      let code: string | undefined;
      let upstreamCode: string | undefined;

      try {
        const error = (await response.json()) as {
          readonly error?: string;
          readonly code?: string;
          readonly upstreamCode?: string;
        };
        message = error.error ?? message;
        code = error.code;
        upstreamCode = error.upstreamCode;
      } catch {
        // Upstream failures may not contain JSON.
      }

      this.log.error("sdp.exchange_failed", { status: response.status, ms, code, upstreamCode, requestId });
      throw new Error(message);
    }

    const callId = response.headers.get("x-eleanor-call-id") ?? undefined;
    if (this.session && callId) this.session.callId = callId;
    this.log.info("sdp.exchanged", { status: response.status, ms, callId, requestId });

    return response.text();
  }

  private playRemoteAudio(stream: MediaStream): void {
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = stream;
    }

    void this.audioLevels.attachOutput(stream).catch((error: unknown) => {
      this.log.warn("audio.analyser_failed", { error });
    });
  }

  private handleConnectionState(connectionState: "connected" | "failed" | "closed"): void {
    switch (connectionState) {
      case "connected":
        if (this.session) this.session.connectedAt = performance.now();
        this.log.info("session.connected", { msSinceActivate: this.sinceActivate() });
        this.connected.set(true);
        this.state.set("listening");
        this.message.set("I'm listening.");
        this.applySettingsToSession();
        break;

      case "failed":
        this.log.error("session.connection_failed", { msSinceActivate: this.sinceActivate() });
        this.log.audit("realtime.error", "The realtime connection failed.", { stage: "peer" });
        this.connected.set(false);
        this.state.set("error");
        this.message.set("Realtime connection failed.");
        break;

      case "closed":
        this.connected.set(false);
        break;
    }
  }

  private handleRealtimeEvent(event: RealtimeServerEvent): void {
    const session = this.session;
    const now = performance.now();

    switch (event.type) {
      case "input_audio_buffer.speech_started":
        if (session) session.turns += 1;
        if (this.state() === "speaking") {
          if (session) session.bargeIns += 1;
          this.log.info("turn.barge_in", { turn: session?.turns });
          this.log.audit("realtime.turn", "You interrupted Eleanor; she stopped speaking.", {
            turn: session?.turns,
            interrupted: true,
          });
        } else {
          this.log.debug("turn.user_started", { turn: session?.turns });
        }
        this.state.set("listening");
        this.message.set("Listening…");
        break;

      case "input_audio_buffer.speech_stopped":
        if (session) {
          session.speechStoppedAt = now;
          session.responseCreatedAt = undefined;
          session.firstAudioAt = undefined;
        }
        this.log.debug("turn.user_stopped", { turn: session?.turns });
        this.state.set("thinking");
        this.message.set("Thinking…");
        break;

      case "response.created":
        if (session) session.responseCreatedAt = now;
        this.log.debug("response.created", {
          responseId: event.response?.id,
          sinceSpeechStoppedMs: elapsed(session?.speechStoppedAt, now),
        });
        this.voiceLocked.set(true);
        this.state.set("speaking");
        this.message.set("Responding…");
        break;

      // WebRTC-only: the first audio for this response is about to play.
      case "output_audio_buffer.started":
        if (session && session.firstAudioAt === undefined) {
          session.firstAudioAt = now;
          this.log.info("response.first_audio", {
            responseId: event.response_id,
            turnLatencyMs: elapsed(session.speechStoppedAt, now),
            sinceResponseCreatedMs: elapsed(session.responseCreatedAt, now),
          });
        }
        break;

      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        this.log.debug("response.audio_stopped", { type: event.type, responseId: event.response_id });
        break;

      case "response.done": {
        if (session) session.responses += 1;
        const latency = {
          turnLatencyMs: elapsed(session?.speechStoppedAt, session?.firstAudioAt ?? session?.responseCreatedAt),
          responseCreatedMs: elapsed(session?.speechStoppedAt, session?.responseCreatedAt),
          responseTotalMs: elapsed(session?.responseCreatedAt, now),
        };
        const status = event.response?.status ?? "unknown";
        this.log.info("response.done", {
          responseId: event.response?.id,
          status,
          statusDetails: event.response?.status_details,
          usage: event.response?.usage,
          ...latency,
        });
        this.log.audit(
          "realtime.response",
          latency.turnLatencyMs !== undefined
            ? `Responded (${status}); started speaking ${latency.turnLatencyMs} ms after you stopped.`
            : `Responded (${status}).`,
          {
            responseId: event.response?.id,
            status,
            statusDetails: event.response?.status_details,
            usage: event.response?.usage,
            latency,
            settings: this.settings.settings(),
          },
        );

        this.state.set("listening");
        this.message.set("I'm listening.");

        if (this.settingsPending()) {
          this.applySettingsToSession();
        }
        break;
      }

      case "session.created":
        this.log.info("session.created", { msSinceActivate: this.sinceActivate() });
        break;

      case "session.updated":
        this.log.debug("session.updated");
        this.settingsPending.set(false);
        break;

      case "rate_limits.updated":
        this.log.debug("rate_limits", { rateLimits: event.rate_limits });
        break;

      case "error":
        this.log.error("server.error", { error: event.error });
        this.log.audit("realtime.error", event.error?.message ?? "Realtime API error.", {
          stage: "session",
          type: event.error?.type,
          code: event.error?.code,
          param: event.error?.param,
        });
        this.state.set("error");
        this.message.set(event.error?.message ?? "Realtime API error.");
        break;

      default:
        break;
    }
  }

  private finishTrace(reason: "user" | "connect_failed"): void {
    const session = this.session;
    if (!session) return;

    const durationMs = Math.round(performance.now() - session.activatedAt);
    const summary = {
      reason,
      durationMs,
      connectedMs: elapsed(session.activatedAt, session.connectedAt),
      callId: session.callId,
      turns: session.turns,
      responses: session.responses,
      bargeIns: session.bargeIns,
    };

    this.log.info("session.ended", summary);
    if (reason === "user") {
      this.log.audit(
        "realtime.session_ended",
        `Ended the voice session after ${Math.round(durationMs / 1000)} s ` +
          `(${session.responses} response${session.responses === 1 ? "" : "s"}).`,
        summary,
      );
    }

    this.session = null;
    this.logs.endTrace();
    void this.logs.flush();
  }

  private sinceActivate(): number | undefined {
    return this.session ? Math.round(performance.now() - this.session.activatedAt) : undefined;
  }

  private releaseResources(): void {
    this.transport?.close();

    this.microphoneStream?.getTracks().forEach((track) => track.stop());

    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
    }

    this.audioLevels.stop();

    this.transport = null;
    this.microphoneStream = null;
    this.remoteAudio = null;
  }
}

function elapsed(from: number | undefined, to: number | undefined): number | undefined {
  return from !== undefined && to !== undefined ? Math.round(to - from) : undefined;
}
