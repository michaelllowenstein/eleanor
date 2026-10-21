import type {
  RealtimeTransport,
  RealtimeTransportHandlers,
} from "./realtime";
import {
    SPEECH_LEVEL,
    END_OF_TURN_MS,
    THINKING_MS,
    REPLY_MS,
    TICK_MS
} from '../schema/constants';

/**
 * Development transport: no WebRTC and no OpenAI.
 *
 * It still posts an SDP offer to /api/realtime/session, so auth, CSRF, rate
 * limiting, the stored key and the API's mock provider are all exercised.
 * Then it listens to the real microphone, emits the same Realtime events the
 * service handles, and answers with a syllable-shaped tone so both halves of
 * the orb move. Talking over the tone interrupts it, like a real barge-in.
 */
export class MockRealtimeTransport implements RealtimeTransport {
  private handlers: RealtimeTransportHandlers | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private readonly samples = new Float32Array(512);
  private voiceOut: MediaStreamAudioDestinationNode | null = null;
  private reply: OscillatorNode | null = null;
  private replyTimer: number | null = null;
  private tickTimer: number | null = null;
  private open = false;
  private speaking = false;
  private quietSince = 0;

  async connect(
    microphone: MediaStream,
    exchangeSdp: (offer: string) => Promise<string>,
    handlers: RealtimeTransportHandlers,
  ): Promise<void> {
    this.handlers = handlers;
 
    // A real offer, so the API validates it exactly as in production.
    const peer = new RTCPeerConnection();
    peer.addTransceiver("audio");
    const offer = await peer.createOffer();
    peer.close();
 
    // Throws with the API's message for 401/409/429/502, like WebRTC does.
    const answer = await exchangeSdp(offer.sdp ?? "");
 
    // Refuse to run against a real provider: the API must be in mock mode too.
    if (!answer.includes("s=eleanor-mock")) {
      throw new Error("The API is not in mock mode. Set REALTIME_PROVIDER=mock in api/.env.");
    }
 
    this.context = new AudioContext({ latencyHint: "interactive" });
    await this.context.resume();
 
    this.voiceOut = this.context.createMediaStreamDestination();
    handlers.onRemoteAudio(this.voiceOut.stream);
 
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = this.samples.length;
    this.context.createMediaStreamSource(microphone).connect(this.analyser);
 
    this.open = true;
    handlers.onConnectionState("connected");
    handlers.onChannelOpen();
    handlers.onEvent({ type: "session.created" });
 
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS);
  }

  isOpen(): boolean {
    return this.open;
  }

  send(event: object): void {
    if (!this.open) {
        return;
    }
 
    if ((event as { readonly type?: string }).type === "session.update") {
      window.setTimeout(() => this.emit({ type: "session.updated" }), TICK_MS);
    }
  }
 
  close(): void {
    const wasOpen = this.open;
    this.open = false;
 
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
 
    if (this.replyTimer !== null) {
      window.clearTimeout(this.replyTimer);
      this.replyTimer = null;
    }
 
    this.stopReply();
 
    const context = this.context;
    this.context = null;
    this.analyser = null;
    this.voiceOut = null;
 
    if (context && context.state !== "closed") {
      void context.close();
    }
 
    if (wasOpen) {
      this.handlers?.onConnectionState("closed");
    }
 
    this.handlers = null;
  }
 
  private emit(event: { readonly type: string }): void {
    if (this.open) {
      this.handlers?.onEvent(event);
    }
  }
 
  private tick(): void {
    if (!this.analyser) {
      return;
    }
 
    this.analyser.getFloatTimeDomainData(this.samples);
 
    let sumSquares = 0;
    for (const sample of this.samples) {
      sumSquares += sample * sample;
    }
 
    const rms = Math.sqrt(sumSquares / this.samples.length);
    const now = performance.now();
 
    if (rms > SPEECH_LEVEL) {
      this.quietSince = now;
 
      if (!this.speaking) {
        this.speaking = true;
 
        if (this.replyTimer !== null) {
          window.clearTimeout(this.replyTimer);
          this.replyTimer = null;
        }
 
        this.stopReply(); // barge-in
        this.emit({ type: "input_audio_buffer.speech_started" });
      }
 
      return;
    }
 
    if (this.speaking && now - this.quietSince > END_OF_TURN_MS) {
      this.speaking = false;
      this.emit({ type: "input_audio_buffer.speech_stopped" });
 
      this.replyTimer = window.setTimeout(() => {
        this.replyTimer = null;
        this.startReply();
      }, THINKING_MS);
    }
  }
 
  private startReply(): void {
    const context = this.context;
    const voiceOut = this.voiceOut;
 
    if (!context || !voiceOut || this.speaking || this.reply) {
      return;
    }
 
    this.emit({ type: "response.created" });
 
    // A 220 Hz tone whose volume swings about four times a second.
    const tone = context.createOscillator();
    const volume = context.createGain();
    const syllables = context.createOscillator();
    const depth = context.createGain();
 
    tone.frequency.value = 220;
    volume.gain.value = 0.25;
    syllables.frequency.value = 4;
    depth.gain.value = 0.25;
 
    syllables.connect(depth).connect(volume.gain);
    tone.connect(volume).connect(voiceOut);
 
    tone.onended = () => {
      try {
        syllables.stop();
      } catch {
        // The context may already be closed.
      }
 
      tone.disconnect();
      syllables.disconnect();
      volume.disconnect();
      depth.disconnect();
 
      this.reply = null;
      this.emit({ type: "response.done" });
    };
 
    this.reply = tone;
    tone.start();
    syllables.start();
    tone.stop(context.currentTime + REPLY_MS / 1000);
  }
 
  private stopReply(): void {
    // Stopping fires onended, which emits response.done.
    try {
      this.reply?.stop();
    } catch {
      // Already stopped.
    }
  }
}