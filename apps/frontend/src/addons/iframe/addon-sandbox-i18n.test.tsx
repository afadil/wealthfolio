import { render, screen } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

// i18next is a module-level singleton, so every case needs a fresh module graph.
async function loadSandboxI18n() {
  vi.resetModules();
  return import("./addon-sandbox-i18n");
}

describe("addon sandbox i18n", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
  });

  it("translates ui-namespaced keys instead of falling back to the raw key", async () => {
    const { initSandboxI18n } = await loadSandboxI18n();

    const i18n = initSandboxI18n("en");

    expect(i18n.t("ui:sheet.close")).not.toBe("ui:sheet.close");
    expect(i18n.t("ui:sheet.close")).toBe("Close");
  });

  it("seeds the requested host language", async () => {
    const { initSandboxI18n } = await loadSandboxI18n();

    const i18n = initSandboxI18n("fr");

    expect(i18n.language).toBe("fr");
    expect(i18n.t("ui:sheet.close")).not.toBe("Close");
    expect(document.documentElement.getAttribute("lang")).toBe("fr");
  });

  it("bundles every supported locale, including ja and ko", async () => {
    const { initSandboxI18n, setSandboxLanguage } = await loadSandboxI18n();
    const { SUPPORTED_LOCALE_CODES } = await import("@/i18n/locales");

    const i18n = initSandboxI18n("en");

    for (const code of SUPPORTED_LOCALE_CODES) {
      setSandboxLanguage(code);
      expect(i18n.language).toBe(code);
      // A missing bundle silently resolves through fallbackLng, so assert the
      // resource bundle itself is present rather than just the lookup result.
      expect(i18n.hasResourceBundle(code, "ui")).toBe(true);
    }
  });

  it("normalizes regional codes to the base language", async () => {
    const { initSandboxI18n } = await loadSandboxI18n();

    const i18n = initSandboxI18n("fr-CA");

    expect(i18n.language).toBe("fr");
  });

  it("defaults to the default locale when the host sends no language", async () => {
    const { initSandboxI18n } = await loadSandboxI18n();
    const { DEFAULT_LOCALE } = await import("@/i18n/locales");

    const i18n = initSandboxI18n(undefined);

    expect(i18n.language).toBe(DEFAULT_LOCALE);
  });

  it("follows host language changes and ignores empty updates", async () => {
    const { initSandboxI18n, setSandboxLanguage } = await loadSandboxI18n();
    const i18n = initSandboxI18n("en");

    setSandboxLanguage("de");
    expect(i18n.language).toBe("de");
    expect(document.documentElement.getAttribute("lang")).toBe("de");

    setSandboxLanguage(undefined);
    expect(i18n.language).toBe("de");
  });

  it("resolves translations for useTranslation consumers without a provider", async () => {
    // `@wealthfolio/ui` components call `useTranslation()` with no
    // I18nextProvider above them — the sandbox instance has to be the default.
    const { initSandboxI18n } = await loadSandboxI18n();
    initSandboxI18n("fr");

    function UiConsumer() {
      const { t } = useTranslation();
      return <span>{t("ui:sheet.close")}</span>;
    }

    render(<UiConsumer />);

    expect(await screen.findByText("Fermer")).toBeInTheDocument();
  });

  it("takes the host's direction, falling back to the UI language's", async () => {
    const { applySandboxDirection, initSandboxI18n, resolveSandboxDirection } =
      await loadSandboxI18n();
    initSandboxI18n("en");

    // The host may force a direction in development, so its report wins.
    expect(resolveSandboxDirection({ uiLocale: "en", direction: "rtl" })).toBe("rtl");
    expect(resolveSandboxDirection({ uiLocale: "ar" })).toBe("rtl");
    expect(resolveSandboxDirection({ uiLocale: "fr" })).toBe("ltr");
    expect(resolveSandboxDirection({})).toBe("ltr");

    applySandboxDirection("rtl");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
  });
});
