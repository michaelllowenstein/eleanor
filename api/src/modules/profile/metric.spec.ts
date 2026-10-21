import { describe, expect, it } from "vitest";

import { DEFAULT_PROFILE_METRIC, decodeProfileMetric, validateProfileMetric } from "./metric.js";

/**
 * Golden vectors for profile-metric v1. The client encoder
 * (client/src/app/core/services/metric.spec.ts) asserts the same vectors, so
 * any change to field order, weights or option lists breaks both suites.
 */
const GOLDEN = [
  {
    metric: 1_000_000,
    profile: {
      personality: "professional",
      verbosity: "brief",
      formality: "casual",
      initiative: "reactive",
      turnTaking: "patient",
      humor: 0,
      speechSpeed: 0.75,
      voice: "alloy",
    },
  },
  {
    metric: 1_131_380,
    profile: {
      personality: "professional",
      verbosity: "balanced",
      formality: "neutral",
      initiative: "balanced",
      turnTaking: "balanced",
      humor: 1,
      speechSpeed: 1,
      voice: "marin",
    },
  },
  {
    metric: 1_155_519,
    profile: {
      personality: "direct",
      verbosity: "detailed",
      formality: "formal",
      initiative: "proactive",
      turnTaking: "quick",
      humor: 3,
      speechSpeed: 1.3,
      voice: "cedar",
    },
  },
] as const;

describe("profile metric v1", () => {
  it.each(GOLDEN)("decodes golden vector $metric", ({ metric, profile }) => {
    expect(decodeProfileMetric(String(metric))).toEqual(profile);
  });

  it("uses the documented default", () => {
    expect(DEFAULT_PROFILE_METRIC).toBe(1_131_380n);
  });

  it.each(["", "abc", "1.5", "-1", "999999", "1155520", "1e6"])(
    "rejects %j",
    (input) => {
      expect(() => validateProfileMetric(input)).toThrow();
    },
  );
});
