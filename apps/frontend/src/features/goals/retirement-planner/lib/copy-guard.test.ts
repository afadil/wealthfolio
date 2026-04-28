import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILES = [
  "../pages/dashboard-page.tsx",
  "../pages/risk-lab-page.tsx",
  "../pages/guide-page.tsx",
];

const FORBIDDEN_PATTERNS = [
  /\bSWR\b/i,
  /safe withdrawal/i,
  /sizing rate/i,
  /Constant percentage/i,
  /\bGuardrails\b/i,
  /spending-rule comparison/i,
  /Base \(constant\)/i,
];

describe("retirement planner copy", () => {
  it("does not leak removed withdrawal-rule jargon into user-facing pages", () => {
    for (const relativePath of FILES) {
      const path = resolve(import.meta.dirname, relativePath);
      const source = readFileSync(path, "utf8");

      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source, `${path} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
