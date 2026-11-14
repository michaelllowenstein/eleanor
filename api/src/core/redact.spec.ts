import { describe, expect, it } from "vitest";

import { redact } from "./redact.js";

const SDP = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";

describe("redact", () => {
  it("masks secret-looking keys", () => {
    expect(redact({ apiKey: "sk-x", authorization: "Bearer y", csrfToken: "z", ok: 1 })).toEqual({
      apiKey: "[redacted]",
      authorization: "[redacted]",
      csrfToken: "[redacted]",
      ok: 1,
    });
  });

  it("never keeps raw SDP", () => {
    expect(redact({ sdp: SDP })).toEqual({ sdp: expect.stringMatching(/^\[sdp \d+ bytes\]$/) });
    expect(redact(SDP)).toMatch(/^\[sdp \d+ bytes\]$/);
  });

  it("masks API keys and bearer tokens inside text", () => {
    expect(redact("key sk-proj-ABCDEFGH1234 / Bearer abc.def")).toBe("key sk-*** / Bearer ***");
  });

  it("serialises errors with their cause", () => {
    const error = new Error("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });
    expect(redact({ error })).toEqual({
      error: {
        name: "Error",
        message: "fetch failed",
        cause: { name: "Error", message: "connect ECONNREFUSED", code: "ECONNREFUSED" },
      },
    });
  });
});
