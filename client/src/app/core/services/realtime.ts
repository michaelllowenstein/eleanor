import {
  Injectable,
  effect,
  inject,
  signal,
} from "@angular/core";

import { AudioLevelsService } from "./audio";
import { AuthService } from "./auth";
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

@Injectable({
  providedIn: "root",
})
export class RealtimeVoiceService {
  private readonly auth: AuthService = inject(AuthService);
  private readonly settings: SettingsService = inject(SettingsService);
  private readonly audioLevels: AudioLevelsService = inject(AudioLevelsService);
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

    this.voiceLocked.set(false);
    this.settingsPending.set(false);
    this.state.set("connecting");
    this.message.set("Requesting microphone access…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

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
      console.error("Unable to connect realtime assistant:", error);

      this.releaseResources();
      this.state.set("error");
      this.message.set(
        error instanceof Error ? error.message : "Unable to connect to ELEANOR.",
      );
    }
  }

  disconnect(): void {
    this.releaseResources();

    this.connected.set(false);
    this.voiceLocked.set(false);
    this.settingsPending.set(false);
    this.state.set("offline");
    this.message.set("Activate ELEANOR to begin.");
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
  }

  /** Posts the SDP offer to the API and returns the answer. */
  private async exchangeSdp(offer: string): Promise<string> {
    this.message.set("Establishing realtime connection…");

    const response = await fetch("/api/realtime/session", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/sdp",
        "X-Eleanor-Profile-Metric": String(this.settings.profileMetric()),
        ...this.auth.csrfHeaders(),
      },
      body: offer,
    });

    if (!response.ok) {
      let message = "Realtime session creation failed.";

      try {
        const error = (await response.json()) as { readonly error?: string };
        message = error.error ?? message;
      } catch {
        // Upstream failures may not contain JSON.
      }

      throw new Error(message);
    }

    return response.text();
  }

  private playRemoteAudio(stream: MediaStream): void {
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = stream;
    }

    void this.audioLevels.attachOutput(stream).catch((error: unknown) => {
      console.error("Unable to analyze assistant audio:", error);
    });
  }

  private handleConnectionState(connectionState: "connected" | "failed" | "closed"): void {
    switch (connectionState) {
      case "connected":
        this.connected.set(true);
        this.state.set("listening");
        this.message.set("I'm listening.");
        this.applySettingsToSession();
        break;

      case "failed":
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
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.state.set("listening");
        this.message.set("Listening…");
        break;

      case "input_audio_buffer.speech_stopped":
        this.state.set("thinking");
        this.message.set("Thinking…");
        break;

      case "response.created":
        this.voiceLocked.set(true);
        this.state.set("speaking");
        this.message.set("Responding…");
        break;

      case "response.done":
        this.state.set("listening");
        this.message.set("I'm listening.");

        if (this.settingsPending()) {
          this.applySettingsToSession();
        }
        break;

      case "session.updated":
        this.settingsPending.set(false);
        break;

      case "error":
        this.state.set("error");
        this.message.set(event.error?.message ?? "Realtime API error.");
        break;

      default:
        break;
    }
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