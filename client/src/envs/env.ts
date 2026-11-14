import type { Env } from "../types";

export const env: Env = {
  production: false,
  realtimeTransport: "webrtc", // "mock" pairs with REALTIME_PROVIDER=mock
  appVersion: "local",
  logging: {
    console: { "*": "debug" },
    remote: { "*": "info", "realtime": "debug" },
    audit: true,
    bufferSize: 2_000,
    flushIntervalMs: 3_000,
    maxBatch: 50,
  },
};
