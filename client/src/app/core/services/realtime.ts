import {
  Injectable,
  effect,
  inject,
  signal,
} from "@angular/core";

import {
  AudioLevelsService,
} from "./audio";
import { AuthService } from "./auth";

import {
  AssistantSettingsService,
} from "./settings";

import type {
  RealtimeServerEvent,
  RealtimeSessionUpdateEvent,
  VoiceConnectionState,
} from "../schema/models/realtime";

@Injectable({
  providedIn: "root"
})
export class RealtimeVoiceService {
  private readonly auth: AuthService = inject(AuthService);
  private readonly settings: AssistantSettingsService =
    inject(AssistantSettingsService);

  private readonly audioLevels: AudioLevelsService =
    inject(AudioLevelsService);

  readonly state =
    signal<VoiceConnectionState>(
      "offline",
    );

  readonly message =
    signal(
      "Activate ELEANOR to begin.",
    );

  readonly connected =
    signal(false);

  readonly voiceLocked =
    signal(false);

  readonly settingsPending =
    signal(false);

  readonly inputLevel =
    this.audioLevels.inputLevel;

  readonly outputLevel =
    this.audioLevels.outputLevel;

  private peerConnection:
    RTCPeerConnection | null = null;

  private dataChannel:
    RTCDataChannel | null = null;

  private microphoneStream:
    MediaStream | null = null;

  private remoteAudio:
    HTMLAudioElement | null = null;

  constructor() {
    effect(() => {
      this.settings.settings();
      this.settings.instructions();
      this.settings.maxOutputTokens();
      this.settings.vadEagerness();

      if (!this.connected()) {
        return;
      }

      if (
        this.state() === "speaking"
      ) {
        this.settingsPending.set(true);
        return;
      }

      this.applySettingsToSession();
    });
  }

  async connect(): Promise<void> {
    if (
      this.state() !== "offline" &&
      this.state() !== "error"
    ) {
      return;
    }

    this.voiceLocked.set(false);
    this.settingsPending.set(false);
    this.state.set("connecting");

    this.message.set(
      "Requesting microphone access…",
    );

    try {
      const stream =
        await navigator.mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });

      this.microphoneStream = stream;

      await this.audioLevels.attachInput(
        stream,
      );

      const peerConnection =
        new RTCPeerConnection();

      this.peerConnection =
        peerConnection;

      this.configureRemoteAudio(
        peerConnection,
      );

      this.configureMicrophone(
        peerConnection,
        stream,
      );

      this.configureDataChannel(
        peerConnection,
      );

      this.configureConnectionEvents(
        peerConnection,
      );

      await this.establishSession(
        peerConnection,
      );
    } catch (error) {
      console.error(
        "Unable to connect realtime assistant:",
        error,
      );

      this.releaseResources();

      this.state.set("error");

      this.message.set(
        error instanceof Error
          ? error.message
          : "Unable to connect to ELEANOR.",
      );
    }
  }

  disconnect(): void {
    this.releaseResources();

    this.connected.set(false);
    this.voiceLocked.set(false);
    this.settingsPending.set(false);

    this.state.set("offline");

    this.message.set(
      "Activate ELEANOR to begin.",
    );
  }

  applySettingsToSession(): void {
    if (
      !this.connected() ||
      !this.dataChannel ||
      this.dataChannel.readyState !==
        "open"
    ) {
      return;
    }

    if (
      this.state() === "speaking"
    ) {
      this.settingsPending.set(true);
      return;
    }

    const current =
      this.settings.settings();

    const output:
      RealtimeSessionUpdateEvent[
        "session"
      ]["audio"]["output"] = {
        speed: current.speechSpeed,

        ...(this.voiceLocked()
          ? {}
          : {
              voice: current.voice
            })
      };

    const event:
      RealtimeSessionUpdateEvent = {
        type: "session.update",

        session: {
          type: "realtime",

          instructions:
            this.settings.instructions(),

          max_output_tokens:
            this.settings
              .maxOutputTokens(),

          audio: {
            input: {
              turn_detection: {
                type: "semantic_vad",

                eagerness:
                  this.settings
                    .vadEagerness(),

                create_response: true,

                interrupt_response: true
              }
            },

            output
          }
        }
      };

    this.sendEvent(event);

    this.settingsPending.set(false);
  }

  private configureRemoteAudio(
    peerConnection:
      RTCPeerConnection,
  ): void {
    const audio = new Audio();

    audio.autoplay = true;

    peerConnection.addEventListener(
      "track",
      (
        event: RTCTrackEvent,
      ) => {
        const existingStream =
          event.streams[0];

        const stream =
          existingStream ??
          new MediaStream([
            event.track
          ]);

        audio.srcObject = stream;

        void this.audioLevels
          .attachOutput(stream)
          .catch((error: unknown) => {
            console.error(
              "Unable to analyze assistant audio:",
              error,
            );
          });
      },
    );

    this.remoteAudio = audio;
  }

  private configureMicrophone(
    peerConnection:
      RTCPeerConnection,
    stream: MediaStream,
  ): void {
    for (
      const track of
        stream.getAudioTracks()
    ) {
      peerConnection.addTrack(
        track,
        stream,
      );
    }
  }

  private configureDataChannel(
    peerConnection:
      RTCPeerConnection,
  ): void {
    const dataChannel =
      peerConnection
        .createDataChannel(
          "oai-events",
        );

    dataChannel.addEventListener(
      "open",
      () => {
        void this.audioLevels.resume();

        this.applySettingsToSession();
      },
    );

    dataChannel.addEventListener(
      "message",
      (
        event:
          MessageEvent<string>,
      ) => {
        this.handleRealtimeMessage(
          event.data,
        );
      },
    );

    dataChannel.addEventListener(
      "error",
      (event) => {
        console.error(
          "Realtime data channel error:",
          event,
        );
      },
    );

    this.dataChannel =
      dataChannel;
  }

  private configureConnectionEvents(
    peerConnection:
      RTCPeerConnection,
  ): void {
    peerConnection.addEventListener(
      "connectionstatechange",
      () => {
        switch (
          peerConnection.connectionState
        ) {
          case "connected":
            this.connected.set(true);

            this.state.set(
              "listening",
            );

            this.message.set(
              "I'm listening.",
            );

            this.applySettingsToSession();
            break;

          case "failed":
            this.connected.set(false);

            this.state.set(
              "error",
            );

            this.message.set(
              "Realtime connection failed.",
            );
            break;

          case "closed":
            this.connected.set(false);
            break;

          default:
            break;
        }
      },
    );
  }

  private async establishSession(
    peerConnection:
      RTCPeerConnection,
  ): Promise<void> {
    const offer =
      await peerConnection.createOffer();

    await peerConnection
      .setLocalDescription(
        offer,
      );

    if (!offer.sdp) {
      throw new Error(
        "Browser failed to create a WebRTC SDP offer.",
      );
    }

    this.message.set(
      "Establishing realtime connection…",
    );

    const response = await fetch("/api/realtime/session", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/sdp",
        "X-Eleanor-Profile-Metric": String(this.settings.profileMetric()),
        ...this.auth.csrfHeaders(),
      },
      body: offer.sdp,
    });

    if (!response.ok) {
      let message =
        "Realtime session creation failed.";

      try {
        const error =
          await response.json() as {
            readonly error?: string;
          };

        message =
          error.error ??
          message;
      } catch {
        // Upstream failures may not contain JSON.
      }

      throw new Error(message);
    }

    const answerSdp =
      await response.text();

    await peerConnection
      .setRemoteDescription({
        type: "answer",
        sdp: answerSdp
      });
  }

  private handleRealtimeMessage(
    payload: string,
  ): void {
    let event:
      RealtimeServerEvent;

    try {
      event =
        JSON.parse(
          payload,
        ) as RealtimeServerEvent;
    } catch {
      console.warn(
        "Ignoring malformed realtime event:",
        payload,
      );

      return;
    }

    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.state.set("listening");

        this.message.set(
          "Listening…",
        );
        break;

      case "input_audio_buffer.speech_stopped":
        this.state.set("thinking");

        this.message.set(
          "Thinking…",
        );
        break;

      case "response.created":
        this.voiceLocked.set(true);

        this.state.set(
          "speaking",
        );

        this.message.set(
          "Responding…",
        );
        break;

      case "response.done":
        this.state.set(
          "listening",
        );

        this.message.set(
          "I'm listening.",
        );

        if (
          this.settingsPending()
        ) {
          this.applySettingsToSession();
        }

        break;

      case "session.updated":
        this.settingsPending.set(false);
        break;

      case "error":
        this.state.set("error");

        this.message.set(
          event.error?.message ??
            "Realtime API error.",
        );
        break;

      default:
        break;
    }
  }

  private sendEvent(
    event:
      RealtimeSessionUpdateEvent,
  ): void {
    if (
      !this.dataChannel ||
      this.dataChannel.readyState !==
        "open"
    ) {
      return;
    }

    this.dataChannel.send(
      JSON.stringify(event),
    );
  }

  private releaseResources(): void {
    this.dataChannel?.close();

    this.peerConnection?.close();

    this.microphoneStream
      ?.getTracks()
      .forEach(
        (track) =>
          track.stop(),
      );

    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject =
        null;
    }

    this.audioLevels.stop();

    this.dataChannel = null;
    this.peerConnection = null;
    this.microphoneStream = null;
    this.remoteAudio = null;
  }
}