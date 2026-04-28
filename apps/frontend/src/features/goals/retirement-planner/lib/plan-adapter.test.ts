import { describe, expect, it } from "vitest";
import { normalizeDashboardRetirementPlan, parseSettingsJson } from "./plan-adapter";

describe("retirement plan adapter", () => {
  it("default plans do not include legacy withdrawal-rule fields", () => {
    const plan = parseSettingsJson("{}");

    expect(plan).not.toHaveProperty("withdrawal");
  });

  it("parses old withdrawal-rule JSON and strips it from the normalized plan", () => {
    const plan = parseSettingsJson(
      JSON.stringify({
        withdrawal: {
          safeWithdrawalRate: 0.04,
          strategy: "guardrails",
          guardrails: {
            ceilingRate: 0.06,
          },
        },
      }),
    );

    expect(plan).not.toHaveProperty("withdrawal");
  });

  it("saving a plan strips any legacy withdrawal-rule fields", () => {
    const plan = parseSettingsJson(
      JSON.stringify({
        withdrawal: {
          safeWithdrawalRate: 0.041,
          strategy: "constant-percentage",
        },
      }),
    );

    const normalized = normalizeDashboardRetirementPlan(plan);

    expect(normalized).not.toHaveProperty("withdrawal");
  });
});
