import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider, useSettingsContext } from "@/lib/settings-provider";
import type { Settings } from "@/lib/types";

const state = vi.hoisted(() => ({
  data: undefined as Settings | undefined,
  desktop: false,
  setTheme: vi.fn().mockResolvedValue(undefined),
  nativeTheme: vi.fn().mockResolvedValue("light"),
  onThemeChanged: vi.fn().mockResolvedValue(vi.fn()),
  mutateAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ data: state.data, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/use-settings-mutation", () => ({
  useSettingsMutation: () => ({ mutateAsync: state.mutateAsync }),
}));
vi.mock("@/adapters", () => ({
  get isTauri() {
    return state.desktop;
  },
  logger: { error: vi.fn() },
}));
vi.mock("@/hooks/use-platform", () => ({
  getPlatform: async () => ({ os: "linux", is_mobile: false, is_desktop: true }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTheme: state.setTheme,
    theme: state.nativeTheme,
    onThemeChanged: state.onThemeChanged,
  }),
}));
vi.mock("@/i18n/i18n", async () => ({
  default: (await import("i18next")).default,
  LANGUAGE_STORAGE_KEY: "wealthfolio-language",
}));

let context: ReturnType<typeof useSettingsContext>;
function Probe() {
  context = useSettingsContext();
  return <output>{context.settings?.themeId}</output>;
}
function fixture() {
  return (
    <SettingsProvider>
      <Probe />
    </SettingsProvider>
  );
}
const base: Settings = {
  theme: "light",
  font: "font-serif",
  language: "en",
  formattingRegion: "US",
  baseCurrency: "USD",
  defaultReturnMetric: "twr",
  timezone: "UTC",
  onboardingCompleted: true,
  autoUpdateCheckEnabled: false,
  menuBarVisible: true,
  syncEnabled: false,
};
let listeners: Set<(event: MediaQueryListEvent) => void>;
beforeEach(() => {
  state.data = { ...base };
  state.desktop = false;
  state.setTheme.mockClear();
  state.nativeTheme.mockReset().mockResolvedValue("light");
  state.onThemeChanged.mockReset().mockResolvedValue(vi.fn());
  state.mutateAsync.mockClear();
  listeners = new Set();
  vi.spyOn(window, "matchMedia").mockImplementation(
    () =>
      ({
        matches: false,
        addEventListener: (_event: string, callback: (event: MediaQueryListEvent) => void) =>
          listeners.add(callback),
        removeEventListener: (_event: string, callback: (event: MediaQueryListEvent) => void) =>
          listeners.delete(callback),
      }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  document.body.className = "";
  vi.restoreAllMocks();
});

// The provider holds children behind an appearance gate (itself a role="status")
// until the async settings application resolves. Wait for the probe's text, which
// only renders once the gate opens and is what assigns a fresh `context`.
const ready = (themeId: string) =>
  waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(themeId));

describe("settings theme runtime", () => {
  it.each([undefined, "future-theme"])(
    "loads %s without writing a replacement to the backend",
    async (themeId) => {
      state.data = { ...base, themeId };
      render(fixture());
      await ready(themeId ?? "flexoki");
      expect(document.documentElement.dataset.theme).toBe("flexoki");
      expect(localStorage.getItem("wealthfolio-theme-id")).toBe(themeId ?? "flexoki");
      expect(state.mutateAsync).not.toHaveBeenCalled();
    },
  );

  it("rejects unknown selections and sends only the valid selection to the mutation", async () => {
    render(fixture());
    await ready("flexoki");
    await expect(context.updateSettings({ themeId: "unregistered" })).rejects.toThrow(
      "Unknown theme selection",
    );
    expect(state.mutateAsync).not.toHaveBeenCalled();
    await context.updateSettings({ themeId: "newspaper" });
    expect(state.mutateAsync).toHaveBeenCalledExactlyOnceWith({ themeId: "newspaper" });
  });

  it("keeps palette and font through OS changes and cleans up the system listener", () => {
    state.data = { ...base, theme: "system", themeId: "cupertino" };
    const { rerender, unmount } = render(fixture());
    expect(document.documentElement).toHaveClass("light");
    act(() => listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent)));
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.dataset.theme).toBe("cupertino");
    expect(document.body).toHaveClass("font-serif");
    expect(localStorage.getItem("wealthfolio-theme")).toBe("system");
    expect(state.mutateAsync).not.toHaveBeenCalled();
    state.data = { ...state.data, themeId: "newspaper" };
    rerender(fixture());
    expect(document.documentElement.dataset.theme).toBe("newspaper");
    expect(listeners.size).toBe(1);
    state.data = { ...state.data, theme: "dark" };
    rerender(fixture());
    expect(listeners.size).toBe(0);
    expect(document.documentElement).toHaveClass("dark");
    unmount();
    expect(listeners.size).toBe(0);
  });
  it("ignores a late native system response after switching to explicit mode", async () => {
    state.desktop = true;
    let resolveNativeTheme!: (value: string) => void;
    state.nativeTheme.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveNativeTheme = resolve;
        }),
    );
    state.data = { ...base, theme: "system", themeId: "cupertino" };
    const { rerender } = render(fixture());
    await vi.waitFor(() => expect(state.nativeTheme).toHaveBeenCalledOnce());
    state.data = { ...state.data, theme: "dark", themeId: "newspaper" };
    rerender(fixture());
    await act(async () => {
      resolveNativeTheme("light");
      await Promise.resolve();
    });
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.dataset.theme).toBe("newspaper");
    expect(state.onThemeChanged).not.toHaveBeenCalled();
  });
  it("disposes a native listener whose registration finishes after unmount", async () => {
    state.desktop = true;
    let finishRegistration!: (unlisten: () => void) => void;
    const unlisten = vi.fn();
    state.onThemeChanged.mockImplementation(
      () =>
        new Promise<() => void>((resolve) => {
          finishRegistration = resolve;
        }),
    );
    state.data = { ...base, theme: "system", themeId: "cupertino" };
    const { unmount } = render(fixture());
    await vi.waitFor(() => expect(state.onThemeChanged).toHaveBeenCalledOnce());
    unmount();
    await act(async () => {
      finishRegistration(unlisten);
      await Promise.resolve();
    });
    expect(unlisten).toHaveBeenCalledOnce();
  });
  it("reuses native and media listeners for a palette-only update in system mode", async () => {
    state.desktop = true;
    state.data = { ...base, theme: "system", themeId: "cupertino" };
    const { rerender } = render(fixture());
    await vi.waitFor(() => expect(state.onThemeChanged).toHaveBeenCalledOnce());
    const mediaCalls = vi.mocked(window.matchMedia).mock.calls.length;
    state.data = { ...state.data, themeId: "newspaper" };
    rerender(fixture());
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.onThemeChanged).toHaveBeenCalledOnce();
    expect(state.setTheme).toHaveBeenCalledOnce();
    expect(window.matchMedia).toHaveBeenCalledTimes(mediaCalls);
    expect(document.documentElement.dataset.theme).toBe("newspaper");
    expect(document.body).toHaveClass("font-serif");
  });
});
