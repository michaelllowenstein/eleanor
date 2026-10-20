import { EleanorDesktopBridge, Window } from "./electron";

/** Build-time settings. `env.ts` is swapped for `env.prod.ts` in production builds. */
export interface Env {
  readonly production: boolean;
 
  /**
   * `mock` runs sessions through MockRealtimeTransport (no WebRTC, no OpenAI);
   * pair it with REALTIME_PROVIDER=mock on the API.
   */
  readonly realtimeTransport: "webrtc" | "mock";
}

export interface Electron {
  readonly desktopBridge: EleanorDesktopBridge;
  readonly window: Window;
}