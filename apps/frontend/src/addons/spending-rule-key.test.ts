// @vitest-environment node

import { describe, expect, it } from "vitest";
import { deriveRuleId } from "./spending-rule-key";

describe("deriveRuleId", () => {
  it("is deterministic for the same addonId and ruleKey", async () => {
    const a = await deriveRuleId("my-addon", "pattern-1");
    const b = await deriveRuleId("my-addon", "pattern-1");
    expect(a).toBe(b);
  });

  it("differs across ruleKeys for the same addon", async () => {
    const a = await deriveRuleId("my-addon", "pattern-1");
    const b = await deriveRuleId("my-addon", "pattern-2");
    expect(a).not.toBe(b);
  });

  it("differs across addons for the same ruleKey", async () => {
    const a = await deriveRuleId("addon-a", "pattern-1");
    const b = await deriveRuleId("addon-b", "pattern-1");
    expect(a).not.toBe(b);
  });

  it("produces an addon-prefixed id with a compact hex suffix", async () => {
    const id = await deriveRuleId("my-addon", "pattern-1");
    expect(id).toMatch(/^addon:my-addon:[0-9a-f]{24}$/);
  });
});
