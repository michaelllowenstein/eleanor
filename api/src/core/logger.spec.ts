import { describe, expect, it } from "vitest";

import { parseTraceSpec } from "./logger.js";

describe("parseTraceSpec", () => {
  it("parses category overrides", () => {
    expect(parseTraceSpec("realtime=debug, http=warn,*=info")).toEqual({
      trace: { realtime: "debug", http: "warn", "*": "info" },
      problems: [],
    });
  });

  it("reports malformed entries", () => {
    expect(parseTraceSpec("realtime,x=loud").problems).toHaveLength(2);
  });
});
