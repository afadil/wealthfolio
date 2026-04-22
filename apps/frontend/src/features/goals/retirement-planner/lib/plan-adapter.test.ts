import { describe, expect, it } from "vitest";
import { parseSettingsJson } from "./plan-adapter";

describe("retirement plan adapter", () => {
  it("normalizes guardrails to the supported ceiling-only shape", () => {
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

    expect(plan.withdrawal.guardrails).toEqual({ ceilingRate: 0.06 });
  });
});
