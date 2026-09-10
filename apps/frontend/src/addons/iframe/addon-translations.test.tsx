import { registerTranslations, useAddonTranslation } from "@wealthfolio/addon-sdk";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The sandbox i18n module owns a singleton instance, so every case gets a
// fresh module graph; the SDK wrappers read the runtime from globalThis at
// call time, so their module identity does not matter.
async function loadSandbox() {
  vi.resetModules();
  delete globalThis.__wealthfolioAddonI18n;
  return import("./addon-sandbox-i18n");
}

function AddonGreeting({ name }: { name: string }) {
  const { t } = useAddonTranslation();
  return <span>{t("greeting", { name })}</span>;
}

describe("addon translation runtime", () => {
  beforeEach(() => {
    delete globalThis.__wealthfolioAddonI18n;
  });

  it("translates addon strings through the SDK and follows host language changes", async () => {
    const { initSandboxI18n, installAddonTranslationRuntime, setSandboxLanguage } =
      await loadSandbox();
    initSandboxI18n("en");
    installAddonTranslationRuntime("sample-addon");

    registerTranslations({
      en: { greeting: "Hello {{name}}" },
      fr: { greeting: "Bonjour {{name}}" },
    });

    function LanguageBadge() {
      const { language } = useAddonTranslation();
      return <span data-testid="language">{language}</span>;
    }
    render(
      <>
        <AddonGreeting name="Aziz" />
        <LanguageBadge />
      </>,
    );
    expect(await screen.findByText("Hello Aziz")).toBeInTheDocument();
    expect(screen.getByTestId("language")).toHaveTextContent(/^en$/);

    setSandboxLanguage("fr");
    expect(await screen.findByText("Bonjour Aziz")).toBeInTheDocument();
    expect(screen.getByTestId("language")).toHaveTextContent(/^fr$/);
  });

  it("uses a zh-Hant add-on bundle when the host selects Traditional Chinese", async () => {
    const { initSandboxI18n, installAddonTranslationRuntime, setSandboxLanguage } =
      await loadSandbox();
    initSandboxI18n("en");
    installAddonTranslationRuntime("sample-addon");
    registerTranslations({
      en: { greeting: "Hello {{name}}" },
      "zh-Hant": { greeting: "你好，{{name}}" },
    });

    render(<AddonGreeting name="Aziz" />);
    setSandboxLanguage("zh-Hant");

    expect(await screen.findByText("你好，Aziz")).toBeInTheDocument();
  });

  it("falls back to English instead of zh for missing zh-Hant add-on strings", async () => {
    const { initSandboxI18n, installAddonTranslationRuntime, setSandboxLanguage } =
      await loadSandbox();
    initSandboxI18n("en");
    installAddonTranslationRuntime("sample-addon");

    registerTranslations({
      en: { greeting: "Hello {{name}}" },
      zh: { greeting: "你好，{{name}}" },
      "zh-Hant": { other: "繁體中文" },
    });

    render(<AddonGreeting name="Aziz" />);
    setSandboxLanguage("zh-Hant");

    expect(await screen.findByText("Hello Aziz")).toBeInTheDocument();
  });

  it("accepts an add-on bundle keyed by a Traditional Chinese alias", async () => {
    const { initSandboxI18n, installAddonTranslationRuntime, setSandboxLanguage } =
      await loadSandbox();
    initSandboxI18n("en");
    installAddonTranslationRuntime("sample-addon");
    // `zh-TW` is what most add-on authors will write; it has to reach zh-Hant
    // rather than landing on the Simplified bundle.
    registerTranslations({
      en: { greeting: "Hello {{name}}" },
      "zh-TW": { greeting: "你好，{{name}}" },
    });

    render(<AddonGreeting name="Aziz" />);
    setSandboxLanguage("zh-Hant");

    expect(await screen.findByText("你好，Aziz")).toBeInTheDocument();
  });

  it("cannot read or overwrite the host ui namespace", async () => {
    const { initSandboxI18n, installAddonTranslationRuntime } = await loadSandbox();
    const i18n = initSandboxI18n("en");
    installAddonTranslationRuntime("sample-addon");

    // A hostile or careless addon registering ui-shaped keys only writes into
    // its own namespace — the host ui bundle is untouched...
    registerTranslations({ en: { sheet: { close: "HACKED" } } });
    expect(i18n.t("ui:sheet.close")).toBe("Close");
    expect(i18n.getResource("en", "ui", "sheet.close")).toBe("Close");

    // Structural isolation: addon resources live on a separate i18next
    // instance — the host instance never even holds an addon namespace.
    expect(i18n.hasResourceBundle("en", "addon/sample-addon")).toBe(false);

    // ...and the addon's own lookups can never reach ui keys: not by
    // fallthrough, not by a "ui:"-prefixed key, not by an options ns override.
    // Nested lookups inside the addon's own bundle still work.
    const runtime = globalThis.__wealthfolioAddonI18n;
    function UiProbe() {
      const { t } = runtime!.useAddonTranslation();
      return (
        <>
          <span data-testid="fallthrough">{t("dialog.close")}</span>
          <span data-testid="key-embedded">{t("ui:sheet.close")}</span>
          <span data-testid="options-ns">{t("sheet.close", { ns: "ui" })}</span>
          <span data-testid="own-nested">{t("sheet.close")}</span>
        </>
      );
    }
    render(<UiProbe />);
    expect(await screen.findByTestId("fallthrough")).toHaveTextContent(/^dialog.close$/);
    expect(screen.getByTestId("key-embedded")).toHaveTextContent(/^ui:sheet.close$/);
    expect(screen.getByTestId("options-ns")).toHaveTextContent(/^HACKED$/);
    expect(screen.getByTestId("own-nested")).toHaveTextContent(/^HACKED$/);
  });

  it("seals nesting, language overrides, and malformed language keys", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { initSandboxI18n, installAddonTranslationRuntime, setSandboxLanguage } =
        await loadSandbox();
      const i18n = initSandboxI18n("en");
      installAddonTranslationRuntime("sample-addon");

      registerTranslations({
        en: { own: "Own EN", esc: '$t(sheet.close, {"ns": "ui"})' },
        // Uppercase and regional codes must land on the resolvable base code.
        "FR-CA": { own: "Own FR" },
      });

      // A dotted language key must never reach i18next: addResourceBundle
      // reinterprets it as a resource path into the host en/ui tree.
      const uiKeysBefore = Object.keys(i18n.getResourceBundle("en", "ui")).sort();
      registerTranslations({ "en.ui": { sheet: { close: "PWNED" } } });
      expect(warn).toHaveBeenCalledOnce();
      expect(Object.keys(i18n.getResourceBundle("en", "ui")).sort()).toEqual(uiKeysBefore);
      expect(i18n.getResource("en", "ui", "sheet.close")).toBe("Close");

      function Probe() {
        const { t } = useAddonTranslation();
        return (
          <>
            {/* $t() nesting is disabled: rendered literally, no ns escape */}
            <span data-testid="nested">{t("esc")}</span>
            {/* language resolution options are stripped: host language wins */}
            <span data-testid="lng-override">{t("own", { lng: "fr" })}</span>
            {/* "FR-CA" registration resolves once the host language is fr */}
            <span data-testid="own">{t("own")}</span>
          </>
        );
      }
      render(<Probe />);
      expect(await screen.findByTestId("nested")).toHaveTextContent(
        '$t(sheet.close, {"ns": "ui"})',
      );
      expect(screen.getByTestId("lng-override")).toHaveTextContent(/^Own EN$/);

      setSandboxLanguage("fr");
      await vi.waitFor(() => {
        expect(screen.getByTestId("own")).toHaveTextContent(/^Own FR$/);
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("falls back to the addon's en bundle for untranslated languages", async () => {
    const { initSandboxI18n, installAddonTranslationRuntime } = await loadSandbox();
    initSandboxI18n("de");
    installAddonTranslationRuntime("sample-addon");

    registerTranslations({ en: { greeting: "Hello {{name}}" } });

    render(<AddonGreeting name="Aziz" />);
    expect(await screen.findByText("Hello Aziz")).toBeInTheDocument();
  });

  it("keeps t identity stable across unrelated re-renders, changing it on language or resource changes", async () => {
    const { initSandboxI18n, installAddonTranslationRuntime, setSandboxLanguage } =
      await loadSandbox();
    initSandboxI18n("en");
    installAddonTranslationRuntime("sample-addon");
    registerTranslations({
      en: { greeting: "Hello {{name}}" },
      fr: { greeting: "Bonjour {{name}}" },
    });

    const identities: unknown[] = [];
    function Probe({ tick }: { tick: number }) {
      const { t } = useAddonTranslation();
      identities.push(t);
      return (
        <span data-testid="probe">
          {tick}:{t("greeting", { name: "A" })}
        </span>
      );
    }

    const { rerender } = render(<Probe tick={1} />);
    rerender(<Probe tick={2} />);
    // An unrelated parent re-render must not produce a new t.
    expect(identities[1]).toBe(identities[0]);

    setSandboxLanguage("fr");
    await vi.waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent("Bonjour A");
    });
    const afterLanguageChange = identities[identities.length - 1];
    expect(afterLanguageChange).not.toBe(identities[0]);

    // Late resource registration must also invalidate t.
    registerTranslations({ fr: { greeting: "Salut {{name}}" } });
    await vi.waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent("Salut A");
    });
    expect(identities[identities.length - 1]).not.toBe(afterLanguageChange);
  });

  it("resolves i18next plurals through the SDK t", async () => {
    const { initSandboxI18n, installAddonTranslationRuntime } = await loadSandbox();
    initSandboxI18n("en");
    installAddonTranslationRuntime("sample-addon");

    registerTranslations({
      en: { holdings_one: "{{count}} holding", holdings_other: "{{count}} holdings" },
    });

    function Holdings({ count }: { count: number }) {
      const { t } = useAddonTranslation();
      return <span>{t("holdings", { count })}</span>;
    }
    render(
      <>
        <Holdings count={1} />
        <Holdings count={3} />
      </>,
    );
    expect(await screen.findByText("1 holding")).toBeInTheDocument();
    expect(await screen.findByText("3 holdings")).toBeInTheDocument();
  });

  it("re-renders consumers when translations are registered after mount", async () => {
    const { initSandboxI18n, installAddonTranslationRuntime } = await loadSandbox();
    initSandboxI18n("en");
    installAddonTranslationRuntime("sample-addon");

    render(<AddonGreeting name="Aziz" />);
    expect(await screen.findByText("greeting")).toBeInTheDocument();

    registerTranslations({ en: { greeting: "Hello {{name}}" } });
    expect(await screen.findByText("Hello Aziz")).toBeInTheDocument();
  });

  it("degrades outside the sandbox: register warns and no-ops, the hook throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      registerTranslations({ en: { greeting: "Hello" } });
      expect(warn).toHaveBeenCalledOnce();

      function Broken() {
        useAddonTranslation();
        return null;
      }
      expect(() => render(<Broken />)).toThrowError(/only available inside/);
    } finally {
      warn.mockRestore();
    }
  });
});
