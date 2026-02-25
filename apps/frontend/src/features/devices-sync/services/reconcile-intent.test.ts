import { describe, expect, it } from "vitest";

import { extractRemoteSeedPresent, resolveBootstrapAction } from "./reconcile-intent";

describe("resolveBootstrapAction", () => {
  it("returns server bootstrapAction when present", () => {
    expect(
      resolveBootstrapAction({
        bootstrapAction: "PULL_REMOTE_OVERWRITE",
      }),
    ).toBe("PULL_REMOTE_OVERWRITE");
  });

  it("throws when bootstrapAction is missing", () => {
    expect(() => resolveBootstrapAction({})).toThrow("Missing bootstrapAction");
  });
});

describe("extractRemoteSeedPresent", () => {
  it("reads camelCase complete/confirm response", () => {
    expect(extractRemoteSeedPresent({ remoteSeedPresent: true })).toBe(true);
  });

  it("returns null for non-camelCase fields", () => {
    expect(extractRemoteSeedPresent({})).toBeNull();
  });

  it("returns null when field is missing", () => {
    expect(extractRemoteSeedPresent({})).toBeNull();
  });
});
