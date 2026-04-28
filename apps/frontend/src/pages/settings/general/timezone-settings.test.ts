import { describe, expect, it } from "vitest";
import { resolveInitialTimezone } from "./timezone-settings";

describe("resolveInitialTimezone", () => {
  it("uses configured timezone when present", () => {
    expect(resolveInitialTimezone("Europe/Paris")).toBe("Europe/Paris");
  });

  it("returns empty string when configured timezone is missing", () => {
    expect(resolveInitialTimezone("")).toBe("");
    expect(resolveInitialTimezone("   ")).toBe("");
    expect(resolveInitialTimezone(undefined)).toBe("");
  });

  it("keeps UTC when explicitly configured", () => {
    expect(resolveInitialTimezone("UTC")).toBe("UTC");
  });
});
