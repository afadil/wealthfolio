import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/lib/settings-provider";
import type { Settings } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(),
  setTheme: vi.fn(),
  windowTheme: vi.fn(),
  systemTheme: vi.fn<() => Promise<"light" | "dark" | null>>(),
  mediaListener: vi.fn<(type: string, handler: (event: MediaQueryListEvent) => void) => void>(),
  themeListener:
    vi.fn<(handler: (event: { payload: "light" | "dark" }) => void) => Promise<() => void>>(),
}));
vi.mock("@/adapters", () => ({
  isTauri: true,
  logger: { error: vi.fn() },
  getSystemTheme: () => mocks.systemTheme(),
}));
vi.mock("@/hooks/use-platform", () => ({ getPlatform: () => mocks.platform() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTheme: (theme: string | null) => mocks.setTheme(theme),
    theme: () => mocks.windowTheme(),
    onThemeChanged: (handler: (event: { payload: "light" | "dark" }) => void) =>
      mocks.themeListener(handler),
  }),
}));
vi.mock("@/features/profiles/profile-context", () => ({ useProfile: () => null }));
vi.mock("@/hooks/use-settings-mutation", () => ({
  useSettingsMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({
    data: settings,
    error: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/i18n/i18n", () => ({
  LANGUAGE_STORAGE_KEY: "test-language",
  default: { language: "en", isInitialized: true, changeLanguage: vi.fn(), dir: () => "ltr" },
}));

let settings = {
  theme: "system",
  font: "font-mono",
  language: "en",
  formattingRegion: "system",
  timezone: "UTC",
  onboardingCompleted: true,
} as Settings;

// Lets the async window theme sync finish before checking its outcome.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
  vi.clearAllMocks();
  settings = { ...settings, theme: "system" };
  document.documentElement.className = "";
  // The OS prefers dark; native window themes report light, as tao does on mobile.
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        addEventListener: mocks.mediaListener,
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  mocks.windowTheme.mockResolvedValue("light");
  mocks.systemTheme.mockResolvedValue("dark");
  mocks.themeListener.mockResolvedValue(() => {});
});

it("keeps the system media query theme on mobile instead of the native window theme", async () => {
  mocks.platform.mockResolvedValue({ os: "android", is_mobile: true, is_desktop: false });

  render(<SettingsProvider>content</SettingsProvider>);

  await settle();
  expect(document.documentElement).toHaveClass("dark");
  expect(document.documentElement).not.toHaveClass("light");
  expect(mocks.windowTheme).not.toHaveBeenCalled();
});

it.each(["macos", "windows"])(
  "follows the native window theme for system mode on %s",
  async (os) => {
    mocks.platform.mockResolvedValue({ os, is_mobile: false, is_desktop: true });

    render(<SettingsProvider>content</SettingsProvider>);

    await waitFor(() => expect(document.documentElement).toHaveClass("light"));
    expect(mocks.windowTheme).toHaveBeenCalled();
    expect(mocks.setTheme).toHaveBeenCalledWith(null);
    expect(mocks.systemTheme).not.toHaveBeenCalled();
  },
);

it("starts Linux system mode dark without resetting GTK to light", async () => {
  mocks.platform.mockResolvedValue({ os: "linux", is_mobile: false, is_desktop: true });

  render(<SettingsProvider>content</SettingsProvider>);

  await waitFor(() => expect(mocks.setTheme).toHaveBeenCalledWith("dark"));
  expect(mocks.setTheme).not.toHaveBeenCalledWith(null);
  expect(document.documentElement).toHaveClass("dark");
  expect(mocks.windowTheme).not.toHaveBeenCalled();
});

it("reads the Linux system preference when returning from explicit light mode", async () => {
  settings = { ...settings, theme: "light" };
  mocks.platform.mockResolvedValue({ os: "linux", is_mobile: false, is_desktop: true });
  const view = render(<SettingsProvider>content</SettingsProvider>);
  await waitFor(() => expect(mocks.setTheme).toHaveBeenCalledWith("light"));

  settings = { ...settings, theme: "system" };
  view.rerender(<SettingsProvider>content</SettingsProvider>);

  await waitFor(() => expect(mocks.setTheme).toHaveBeenLastCalledWith("dark"));
  expect(document.documentElement).toHaveClass("dark");
  expect(mocks.systemTheme).toHaveBeenCalledOnce();
});

it("keeps following Linux system changes through the media query", async () => {
  mocks.platform.mockResolvedValue({ os: "linux", is_mobile: false, is_desktop: true });
  render(<SettingsProvider>content</SettingsProvider>);
  await waitFor(() => expect(mocks.setTheme).toHaveBeenCalledWith("dark"));

  const change = mocks.mediaListener.mock.calls.at(-1)![1];
  act(() => change({ matches: false } as MediaQueryListEvent));
  expect(document.documentElement).toHaveClass("light");
  act(() => change({ matches: true } as MediaQueryListEvent));
  expect(document.documentElement).toHaveClass("dark");
});

it("keeps following native Linux theme notifications", async () => {
  mocks.platform.mockResolvedValue({ os: "linux", is_mobile: false, is_desktop: true });
  render(<SettingsProvider>content</SettingsProvider>);
  await waitFor(() => expect(mocks.themeListener).toHaveBeenCalledOnce());
  const change = mocks.themeListener.mock.calls[0]![0];
  act(() => change({ payload: "light" }));
  expect(document.documentElement).toHaveClass("light");
  act(() => change({ payload: "dark" }));
  expect(document.documentElement).toHaveClass("dark");
});

it("keeps the media-query fallback when the Linux portal is unavailable", async () => {
  mocks.platform.mockResolvedValue({ os: "linux", is_mobile: false, is_desktop: true });
  mocks.systemTheme.mockRejectedValueOnce(new Error("Portal unavailable"));
  render(<SettingsProvider>content</SettingsProvider>);

  await settle();
  expect(document.documentElement).toHaveClass("dark");
  expect(mocks.systemTheme).toHaveBeenCalledOnce();
  expect(mocks.setTheme).not.toHaveBeenCalled();
});

it("does not apply a late Linux system preference over a newer explicit choice", async () => {
  mocks.platform.mockResolvedValue({ os: "linux", is_mobile: false, is_desktop: true });
  let resolve!: (theme: "light" | "dark" | null) => void;
  mocks.systemTheme.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(<SettingsProvider>content</SettingsProvider>);
  await waitFor(() => expect(mocks.systemTheme).toHaveBeenCalledOnce());

  settings = { ...settings, theme: "light" };
  view.rerender(<SettingsProvider>content</SettingsProvider>);
  await waitFor(() => expect(mocks.setTheme).toHaveBeenCalledWith("light"));
  await act(async () => resolve("dark"));

  expect(mocks.setTheme).toHaveBeenCalledOnce();
  expect(document.documentElement).toHaveClass("light");
});

it("leaves the window theme alone for explicit modes on mobile", async () => {
  settings.theme = "dark";
  mocks.platform.mockResolvedValue({ os: "android", is_mobile: true, is_desktop: false });

  render(<SettingsProvider>content</SettingsProvider>);

  await settle();
  expect(document.documentElement).toHaveClass("dark");
  expect(mocks.setTheme).not.toHaveBeenCalled();
});

it("sets the window theme for explicit modes on desktop", async () => {
  settings.theme = "dark";
  mocks.platform.mockResolvedValue({ os: "linux", is_mobile: false, is_desktop: true });

  render(<SettingsProvider>content</SettingsProvider>);

  await waitFor(() => expect(mocks.setTheme).toHaveBeenCalledWith("dark"));
});
