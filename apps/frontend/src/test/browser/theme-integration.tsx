import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/auth-context";
import { SettingsProvider, useSettingsContext } from "@/lib/settings-provider";
import { installProfileSession } from "@/features/profiles/session";
import { CuratedThemeSelector } from "@/components/curated-theme-selector";
import { FontSelector } from "@/components/font-selector";
import { AddonIframeManager } from "@/addons/iframe/addon-iframe-manager";
import { Button, Card, CardContent, Input } from "@wealthfolio/ui";
import "@/i18n/i18n";
import "@/globals.css";

// Synthetic addon observes the real sandbox document after runtime theme application.
const code = `import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, CardContent, Input } from '@wealthfolio/ui';
export async function enable() {
  const boot = crypto.randomUUID();
  const container = document.createElement('div');
  document.body.append(container);
  createRoot(container).render(createElement(Card, { 'data-testid': 'geometry-card' }, createElement(CardContent, { 'data-testid': 'geometry-content' }, createElement(Button, { 'data-testid': 'geometry-button' }, 'Geometry button'), createElement(Input, { 'data-testid': 'geometry-input', 'aria-label': 'Geometry input' }))));
  const geometry = () => {
    const result = {};
    for (const [name, properties] of Object.entries({ button: ['borderRadius', 'height'], card: ['borderRadius', 'boxShadow'], content: ['paddingLeft', 'paddingBottom'], input: ['borderRadius', 'borderTopWidth', 'borderLeftWidth', 'backgroundColor'] })) {
      const node = container.querySelector('[data-testid="geometry-' + name + '"]');
      if (!node) return null;
      const style = getComputedStyle(node);
      result[name] = Object.fromEntries(properties.map(property => [property, style[property]]));
    }
    return result;
  };
  const report = () => parent.postMessage({ probe: 'theme-integration', boot, themeId: document.documentElement.dataset.theme, mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light', font: document.body.className, chart: getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim(), geometry: geometry() }, '*');
  const schedule = () => requestAnimationFrame(report);
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true });
  window.addEventListener('resize', schedule);
  container.addEventListener('transitionend', schedule);
  requestAnimationFrame(() => requestAnimationFrame(report));
}`;

export function Fixture() {
  const { settings, updateSettings } = useSettingsContext();
  const [addon, setAddon] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    const manager = new AddonIframeManager();
    const listener = (event: MessageEvent) => {
      const data = event.data as Record<string, string> | null;
      if (data?.probe === "theme-integration") setAddon(data);
    };
    window.addEventListener("message", listener);
    void manager
      .startAddon({
        addonId: "theme-integration",
        code,
        manifest: { id: "theme-integration", name: "Synthetic theme probe", version: "1.0.0" },
      })
      .catch((reason: unknown) => setError(String(reason)));
    return () => {
      window.removeEventListener("message", listener);
      void manager.stopAllAddons();
    };
  }, []);
  if (!settings) return <p>Loading synthetic settings</p>;
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1>Theme integration fixture</h1>
      <p>Synthetic settings backend required. No portfolio data.</p>
      <CuratedThemeSelector
        value={settings.themeId}
        onChange={(themeId) => void updateSettings({ themeId })}
      />
      <label>
        Appearance mode{" "}
        <select
          aria-label="Appearance mode"
          value={settings.theme}
          onChange={(event) => void updateSettings({ theme: event.target.value })}
        >
          {["light", "dark", "system"].map((mode) => (
            <option key={mode}>{mode}</option>
          ))}
        </select>
      </label>
      <FontSelector value={settings.font} onChange={(font) => void updateSettings({ font })} />
      <Card data-testid="geometry-card">
        <CardContent data-testid="geometry-content">
          <Button data-testid="geometry-button">Geometry button</Button>
          <Input data-testid="geometry-input" aria-label="Geometry input" />
        </CardContent>
      </Card>
      <output data-testid="settings">{JSON.stringify(settings)}</output>
      <output data-testid="addon">{JSON.stringify(addon)}</output>
      <output data-testid="addon-error">{error}</output>
    </main>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
if ((window as Window & { themeIntegrationMocked?: boolean }).themeIntegrationMocked) {
  // Renders without the app shell, which is what admits a profile; admit the synthetic
  // one directly or every settings request throws PROFILE_LOCKED before it is sent.
  installProfileSession({ profileId: "synthetic-profile", scopeId: "synthetic-scope" });
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SettingsProvider>
          <Fixture />
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
} else {
  document.getElementById("root")!.textContent =
    "Run through the mocked theme integration test; live API access is disabled.";
}
