import {
  Injectable,
  signal,
} from "@angular/core";

@Injectable({
  providedIn: "root"
})
export class AudioLevelsService {
  readonly inputLevel = signal(0);
  readonly outputLevel = signal(0);

  private audioContext: AudioContext | null = null;

  private inputSource: MediaStreamAudioSourceNode | null = null;
  private outputSource: MediaStreamAudioSourceNode | null = null;

  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;

  private inputSamples: Float32Array<ArrayBuffer> | null = null;
  private outputSamples: Float32Array<ArrayBuffer> | null = null;

  private animationFrameId: number | null = null;
  private lastSampleTime = 0;

  private readonly sampleIntervalMs = 33;

  async attachInput(
    stream: MediaStream,
  ): Promise<void> {
    const context = await this.ensureAudioContext();

    this.disconnectInput();

    const source =
      context.createMediaStreamSource(stream);

    const analyser =
      this.createAnalyser(context);

    source.connect(analyser);

    this.inputSource = source;
    this.inputAnalyser = analyser;
    this.inputSamples =
      new Float32Array(
        new ArrayBuffer(
          analyser.fftSize *
            Float32Array.BYTES_PER_ELEMENT,
        ),
      );

    this.startSampling();
  }

  async attachOutput(
    stream: MediaStream,
  ): Promise<void> {
    const context = await this.ensureAudioContext();

    this.disconnectOutput();

    const source =
      context.createMediaStreamSource(stream);

    const analyser =
      this.createAnalyser(context);

    source.connect(analyser);

    this.outputSource = source;
    this.outputAnalyser = analyser;
    this.outputSamples =
      new Float32Array(
        new ArrayBuffer(
          analyser.fftSize *
            Float32Array.BYTES_PER_ELEMENT,
        ),
      );

    this.startSampling();
  }

  async resume(): Promise<void> {
    if (
      this.audioContext &&
      this.audioContext.state === "suspended"
    ) {
      await this.audioContext.resume();
    }
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(
        this.animationFrameId,
      );

      this.animationFrameId = null;
    }

    this.disconnectInput();
    this.disconnectOutput();

    this.inputLevel.set(0);
    this.outputLevel.set(0);

    const context = this.audioContext;

    this.audioContext = null;

    if (
      context &&
      context.state !== "closed"
    ) {
      void context.close();
    }
  }

  private async ensureAudioContext():
    Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext =
        new AudioContext({
          latencyHint: "interactive"
        });
    }

    if (
      this.audioContext.state === "suspended"
    ) {
      await this.audioContext.resume();
    }

    return this.audioContext;
  }

  private createAnalyser(
    context: AudioContext,
  ): AnalyserNode {
    const analyser =
      context.createAnalyser();

    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;

    return analyser;
  }

  private startSampling(): void {
    if (this.animationFrameId !== null) {
      return;
    }

    const sample = (
      timestamp: number,
    ): void => {
      if (
        timestamp - this.lastSampleTime >=
        this.sampleIntervalMs
      ) {
        this.lastSampleTime = timestamp;

        this.inputLevel.set(
          this.readLevel(
            this.inputAnalyser,
            this.inputSamples,
          ),
        );

        this.outputLevel.set(
          this.readLevel(
            this.outputAnalyser,
            this.outputSamples,
          ),
        );
      }

      this.animationFrameId =
        requestAnimationFrame(sample);
    };

    this.animationFrameId =
      requestAnimationFrame(sample);
  }

  private readLevel(
    analyser: AnalyserNode | null,
    samples: Float32Array<ArrayBuffer> | null,
  ): number {
    if (!analyser || !samples) {
      return 0;
    }

    analyser.getFloatTimeDomainData(samples);

    let sumSquares = 0;

    for (
      let index = 0;
      index < samples.length;
      index += 1
    ) {
      const sample =
        samples[index] ?? 0;

      sumSquares += sample * sample;
    }

    const rms =
      Math.sqrt(
        sumSquares / samples.length,
      );

    if (rms <= 0.00001) {
      return 0;
    }

    const decibels =
      20 * Math.log10(rms);

    return this.normalizeDecibels(
      decibels,
    );
  }

  private normalizeDecibels(
    decibels: number,
  ): number {
    const minimumDecibels = -60;
    const maximumDecibels = -8;

    const normalized =
      (
        decibels -
        minimumDecibels
      ) /
      (
        maximumDecibels -
        minimumDecibels
      );

    return Math.min(
      1,
      Math.max(0, normalized),
    );
  }

  private disconnectInput(): void {
    this.inputSource?.disconnect();
    this.inputAnalyser?.disconnect();

    this.inputSource = null;
    this.inputAnalyser = null;
    this.inputSamples = null;
  }

  private disconnectOutput(): void {
    this.outputSource?.disconnect();
    this.outputAnalyser?.disconnect();

    this.outputSource = null;
    this.outputAnalyser = null;
    this.outputSamples = null;
  }
}