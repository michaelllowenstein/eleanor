import type { Env } from "../types";

export const env: Env = {
  production: true,
  realtimeTransport: "webrtc",
  appVersion: "0.1.0",
  logging: {
    // Quiet console for users; full detail still lands in the in-memory
    // buffer (eleanorLog.download()) and warnings/errors reach the API.
    console: { "*": "warn" },
    remote: { "*": "warn", "realtime": "info" },
    audit: true,
    bufferSize: 2_000,
    flushIntervalMs: 10_000,
    maxBatch: 50,
  },
};
