import { act, render } from "@testing-library/react";
import i18next, { type i18n as I18n } from "i18next";
import { I18nextProvider, Trans, useTranslation } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FSI = "⁨";
const PDI = "⁩";

// Names measured in Chromium that render wrong in an Arabic sentence unless
// isolated, plus two that already render right.
const NAMES = [
  "Emergency Fund!",
  "New car?",
  "Acme Inc.",
  "#1 Goal",
  "$TSLA",
  "2024 bonus",
  "50/30/20 plan",
  "Savings (USD)",
  "401k - Main",
];

const AR_GOAL = "تم تحقيق هدف {{name}}";
const EN_GOAL = "Goal {{name}} reached";

let i18n: I18n;

// The real `i18n.ts` configuration on a fresh instance, with Arabic accepted
// as a language (the catalog itself is contributor PR #2177).
beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.doMock("i18next", () => ({ default: i18next.createInstance() }));
  vi.doMock("./locales", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./locales")>();
    return { ...actual, SUPPORTED_LOCALE_CODES: [...actual.SUPPORTED_LOCALE_CODES, "ar"] };
  });
  i18n = (await import("./i18n")).default;
  await vi.waitFor(() => expect(i18n.isInitialized).toBe(true));
  i18n.addResourceBundle("en", "common", { test_goal: EN_GOAL, test_pair: "{{a}} {{b}}" });
  i18n.addResourceBundle("ar", "common", {
    test_goal: AR_GOAL,
    test_count: "{{visible}}/{{total}} معاملة",
    test_markup: "تم تحقيق هدف <1>{{name}}</1>",
  });
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("i18next");
  vi.doUnmock("./locales");
  vi.unstubAllGlobals();
});

describe("interpolated values", () => {
  it("are byte-identical in left-to-right languages", async () => {
    await i18n.changeLanguage("en");
    for (const name of NAMES) {
      expect(i18n.t("common:test_goal", { name })).toBe(EN_GOAL.replace("{{name}}", name));
    }
    // No HTML escaping: React escapes rendered text itself.
    expect(i18n.t("common:test_goal", { name: "<b>&'\"" })).toBe(`Goal <b>&'" reached`);
    expect(i18n.t("common:test_pair", { a: 3, b: "x" })).toBe("3 x");
  });

  it("are isolated in right-to-left languages", async () => {
    await i18n.changeLanguage("ar");
    for (const name of NAMES) {
      expect(i18n.t("common:test_goal", { name })).toBe(
        AR_GOAL.replace("{{name}}", `${FSI}${name}${PDI}`),
      );
    }
    expect(i18n.t("common:test_goal", { name: "<b>" })).toBe(
      AR_GOAL.replace("{{name}}", `${FSI}<b>${PDI}`),
    );
  });

  it("isolate only values with left-to-right letters in right-to-left languages", async () => {
    await i18n.changeLanguage("ar");
    // Already in the sentence's direction: nothing to isolate.
    for (const name of ["صندوق الطوارئ!", "3 أشهر", "سنة واحدة"]) {
      expect(i18n.t("common:test_goal", { name })).toBe(AR_GOAL.replace("{{name}}", name));
    }
    // Any left-to-right letter, even next to Arabic, is isolated.
    expect(i18n.t("common:test_goal", { name: "AAPL سهم" })).toBe(
      AR_GOAL.replace("{{name}}", `${FSI}AAPL سهم${PDI}`),
    );
  });

  it("keep bare numbers unisolated in right-to-left languages", async () => {
    await i18n.changeLanguage("ar");
    // Isolated, each number is its own unit and "20/50" shows as "50/20".
    expect(i18n.t("common:test_count", { visible: 20, total: 50 })).toBe("20/50 معاملة");
    expect(i18n.t("common:test_count", { visible: "-1.5", total: "+2%" })).toBe("-1.5/+2% معاملة");
  });

  it("nest inside a formatted value's own isolate", async () => {
    await i18n.changeLanguage("ar");
    // Chromium and WebKit draw a nested pair like a single one.
    expect(i18n.t("common:test_goal", { name: `${FSI}Mar 1, 2024${PDI}` })).toBe(
      AR_GOAL.replace("{{name}}", `${FSI}${FSI}Mar 1, 2024${PDI}${PDI}`),
    );
    // A formatted amount has no letters and keeps only its own pair.
    expect(i18n.t("common:test_goal", { name: `${FSI}-$1,234.56${PDI}` })).toBe(
      AR_GOAL.replace("{{name}}", `${FSI}-$1,234.56${PDI}`),
    );
  });

  it("follow a language change in rendered components", async () => {
    function Goal() {
      const { t } = useTranslation("common");
      return <p data-testid="goal">{t("test_goal", { name: "Emergency Fund!" })}</p>;
    }
    const { getByTestId } = render(
      <I18nextProvider i18n={i18n}>
        <Goal />
      </I18nextProvider>,
    );
    expect(getByTestId("goal").textContent).toBe("Goal Emergency Fund! reached");
    await act(() => i18n.changeLanguage("ar"));
    expect(getByTestId("goal").textContent).toBe(
      AR_GOAL.replace("{{name}}", `${FSI}Emergency Fund!${PDI}`),
    );
  });

  it("are isolated by <Trans>", async () => {
    await i18n.changeLanguage("ar");
    const name = "Emergency Fund!";
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <Trans i18nKey="common:test_markup" values={{ name }} components={{ 1: <strong /> }} />
      </I18nextProvider>,
    );
    expect(container.querySelector("strong")?.textContent).toBe(`${FSI}${name}${PDI}`);
  });
});
