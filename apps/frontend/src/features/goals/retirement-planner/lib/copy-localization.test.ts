import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import en from "@/i18n/locales/en/goals.json";
import { deriveRetirementReadiness } from "./dashboard-math";

const catalogs = import.meta.glob<Record<string, unknown>>("@/i18n/locales/*/goals.json", {
  eager: true,
  import: "default",
});
function flatten(node: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(node).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string"
        ? [[path, value]]
        : Object.entries(flatten(value as Record<string, unknown>, path));
    }),
  );
}
const english = flatten(en);
const reviewedKeys = Object.keys(english).filter(
  (key) =>
    /^(dashboard\.(guidance|summary|verdict)|risk_lab\.(scenarios|labels))\./.test(key) ||
    key.includes("simulation_tooltip") ||
    key.endsWith("of_simulated_paths") ||
    key.endsWith("percentile_at_age") ||
    key.endsWith("fi_projected") ||
    key.endsWith("never_reaches_fi") ||
    key.endsWith("high_return") ||
    key.endsWith("drawdown_note") ||
    key.endsWith("payout_estimate_note") ||
    key === "risk_lab.montecarlo.heading" ||
    key.includes("money_lasts_prompt"),
);
const placeholders = (text: string) =>
  [...text.matchAll(/{{(.*?)}}/g)].map((match) => match[1]).sort();

describe("retirement copy localization", () => {
  it.each(Object.entries(catalogs))(
    "has matching placeholders and complete messages in %s",
    (_, catalog) => {
      const strings = flatten(catalog);
      for (const key of reviewedKeys) {
        expect(strings[key], key).toBeTruthy();
        expect(placeholders(strings[key]), key).toEqual(placeholders(english[key]));
        expect(strings[key], key).not.toMatch(/retire later|switch.*annuity|recommended/i);
      }
    },
  );

  it("localizes fund outcomes without translating user-entered names", async () => {
    for (const catalog of Object.values(catalogs)) {
      const instance = createInstance();
      await instance.init({
        lng: "en",
        resources: { en: { goals: catalog } },
        interpolation: { escapeValue: false },
      });
      const result = deriveRetirementReadiness(
        {
          overview: { incomeStreamExhaustion: [{ label: "My pension", exhaustedAge: 79 }] },
          plannerMode: "fire",
          isFinanciallyIndependent: false,
          effectiveFiAge: 55,
          desiredAge: 55,
          horizonAge: 90,
        },
        instance.t,
      );
      expect(result.body).toContain("My pension");
      expect(result.body).toContain("79");
      expect(result.body).not.toContain("goals:");
    }
  });
});
