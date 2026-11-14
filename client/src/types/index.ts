import { EleanorDesktopBridge, Window } from "./electron";

/** Build-time settings. `env.ts` is swapped for `env.prod.ts` in production builds. */
export interface Env {
  readonly production: boolean;
  appVersion: string;
  /**
   * `mock` runs sessions through MockRealtimeTransport (no WebRTC, no OpenAI);
   * pair it with REALTIME_PROVIDER=mock on the API.
   */
  readonly realtimeTransport: "webrtc" | "mock";
  logging: {
    console: object;
    remote: object;
    audit: boolean;
    bufferSize: number;
    flushIntervalMs: number;
    maxBatch: number;
  }
}

export interface Electron {
  readonly desktopBridge: EleanorDesktopBridge;
  readonly window: Window;
}

export interface ClientLogConfig {
    maxBatch(arg0: number, maxBatch: any): unknown;
    console(console: any, category: string, level: ClientLogLevel): boolean;
    remote(remote: any, category: string, level: ClientLogLevel): boolean;
    bufferSize: number;
    audit: boolean;
    flushIntervalMs(arg0: () => undefined, flushIntervalMs: any): number | null;
}

export interface ClientLogLevel {

}

export interface ClientLogLevels {

}