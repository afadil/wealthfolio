import { describe, expect, it } from "vitest";
import { resolveInitialTimezone } from "./timezone-settings";

describe("resolveInitialTimezone", () => {
  it("uses configured timezone when present", () => {
    expect(resolveInitialTimezone("Europe/Paris", "America/Toronto")).toBe("Europe/Paris");
  });

  it("uses detected timezone when configured timezone is missing", () => {
    expect(resolveInitialTimezone("", "America/Toronto")).toBe("America/Toronto");
    expect(resolveInitialTimezone("   ", "America/Toronto")).toBe("America/Toronto");
    expect(resolveInitialTimezone(undefined, "America/Toronto")).toBe("America/Toronto");
  });

  it("keeps UTC when explicitly configured", () => {
    expect(resolveInitialTimezone("UTC", "America/Toronto")).toBe("UTC");
  });
});
