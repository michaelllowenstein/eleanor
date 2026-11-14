import type { Env } from "../types";

export const env: Env = {
  production: false,
  realtimeTransport: "mock", // "mock" pairs with REALTIME_PROVIDER=mock
  appVersion: "mock",
  logging: {
    console: { "*": "debug" },
    remote: { "*": "info", "realtime": "debug" },
    audit: true,
    bufferSize: 2_000,
    flushIntervalMs: 3_000,
    maxBatch: 50,
  },
};
