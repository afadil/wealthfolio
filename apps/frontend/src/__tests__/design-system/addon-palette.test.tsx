import { afterEach, describe, expect, it, vi } from "vitest";
import { applyHostTheme, collectAddonThemeSnapshot } from "@/addons/iframe/addon-sandbox-theme";

vi.mock("@/adapters", () => ({
  loadAddonAsset: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), trace: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/addons/addons-runtime-context", () => ({
  clearAddonRegistrations: vi.fn(),
  createAddonHostAPI: vi.fn(),
  registerAddonNavItem: vi.fn(),
  registerAddonRoute: vi.fn(),
  removeAddonNavItem: vi.fn(),
  removeAddonRoute: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { AddonIframeManager } from "@/addons/iframe/addon-iframe-manager";

afterEach(() => {
  applyHostTheme({ cssVariables: {} });
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
  document.documentElement.className = "";
  document.body.className = "";
  document.getElementById("addon-sandbox-parking")?.remove();
  vi.restoreAllMocks();
});

describe("addon curated palette transport", () => {
  it("collects and applies a same-mode palette change while keeping legacy snapshots compatible", () => {
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.theme = "newspaper";
    document.documentElement.style.setProperty("--chart-1", "#123456");
    const snapshot = collectAddonThemeSnapshot();
    expect(snapshot).toMatchObject({
      themeId: "newspaper",
      themeClass: "dark",
      cssVariables: { "--chart-1": "#123456" },
    });
    applyHostTheme({ ...snapshot, themeId: "cupertino", cssVariables: { "--chart-1": "#234567" } });
    expect(document.documentElement.dataset.theme).toBe("cupertino");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.getPropertyValue("--chart-1")).toBe("#234567");
    applyHostTheme({ themeClass: "light", cssVariables: {} });
    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement.style.getPropertyValue("--chart-1")).toBe("");
  });

  it("broadcasts an attribute-only palette switch to the existing iframe without reload", async () => {
    document.documentElement.className = "dark";
    document.documentElement.dataset.theme = "flexoki";
    const manager = new AddonIframeManager();
    const starting = manager.startAddon({
      addonId: "palette-probe",
      code: "export default () => undefined",
      manifest: { id: "palette-probe", name: "Synthetic palette probe", version: "1.0.0" },
    });
    const cancelled = expect(starting).rejects.toMatchObject({ name: "AddonLoadCancelled" });
    try {
      await vi.waitFor(() => expect(document.querySelector("iframe")).not.toBeNull());
      const iframe = document.querySelector("iframe")!;
      const originalSource = iframe.src;
      const postMessage = vi
        .spyOn(iframe.contentWindow!, "postMessage")
        .mockImplementation(vi.fn());
      document.documentElement.dataset.theme = "newspaper";
      await vi.waitFor(() => {
        const message = postMessage.mock.calls.find(
          ([payload]) => (payload as { type?: string }).type === "themeUpdate",
        );
        expect(message?.[0] as unknown).toMatchObject({
          type: "themeUpdate",
          theme: { themeId: "newspaper", themeClass: "dark" },
        });
        expect(message?.[1]).toBe("*");
      });
      expect(document.querySelector("iframe")).toBe(iframe);
      expect(iframe.src).toBe(originalSource);
    } finally {
      await manager.stopAllAddons();
      await cancelled;
    }
  });
});
