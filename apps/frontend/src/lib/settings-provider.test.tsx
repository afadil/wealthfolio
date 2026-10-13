import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/lib/settings-provider";
import type { Settings } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(),
  setTheme: vi.fn(),
  windowTheme: vi.fn(),
  systemTheme: vi.fn<() => Promise<"light" | "dark" | null>>(),
  themeListener:
    vi.fn<(handler: (event: { payload: "light" | "dark" }) => void) => Promise<() => void>>(),
  systemListener:
    vi.fn<(handler: (event: { payload: "light" | "dark" }) => void) => Promise<() => void>>(),
  systemUnlisten: vi.fn(),
}));
vi.mock("@/adapters", () => ({
  isTauri: true,
  logger: { error: vi.fn() },
}));
vi.mock("../adapters/tauri/settings", () => ({
  getSystemTheme: () => mocks.systemTheme(),
}));
vi.mock("../adapters/tauri/events", () => ({
  listenSystemThemeChanged: (handler: (event: { payload: "light" | "dark" }) => void) =>
    mocks.systemListener(handler),
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
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  mocks.windowTheme.mockResolvedValue("light");
  mocks.systemTheme.mockResolvedValue("dark");
  mocks.themeListener.mockResolvedValue(() => {});
  mocks.systemListener.mockResolvedValue(mocks.systemUnlisten);
  mocks.setTheme.mockResolvedValue(undefined);
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
    expect(mocks.systemListener).not.toHaveBeenCalled();
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

it("follows Linux portal changes in both the document and window", async () => {
  mocks.platform.mockResolvedValue({ os: "linux", is_mobile: false, is_desktop: true });
  render(<SettingsProvider>content</SettingsProvider>);
  await waitFor(() => expect(mocks.systemListener).toHaveBeenCalledOnce());
  expect(mocks.themeListener).not.toHaveBeenCalled();
  const change = mocks.systemListener.mock.calls[0]![0];
  act(() => change({ payload: "light" }));
  expect(document.documentElement).toHaveClass("light");
  expect(mocks.setTheme).toHaveBeenLastCalledWith("light");
  act(() => change({ payload: "dark" }));
  expect(document.documentElement).toHaveClass("dark");
  expect(mocks.setTheme).toHaveBeenLastCalledWith("dark");
});

it("stops Linux portal updates when switching to an explicit theme", async () => {
  mocks.platform.mockResolvedValue({ os: "linux", is_mobile: false, is_desktop: true });
  const view = render(<SettingsProvider>content</SettingsProvider>);
  await waitFor(() => expect(mocks.systemListener).toHaveBeenCalledOnce());
  const change = mocks.systemListener.mock.calls[0]![0];

  settings = { ...settings, theme: "light" };
  view.rerender(<SettingsProvider>content</SettingsProvider>);
  await waitFor(() => expect(mocks.setTheme).toHaveBeenLastCalledWith("light"));
  expect(mocks.systemUnlisten).toHaveBeenCalledOnce();
  const calls = mocks.setTheme.mock.calls.length;
  act(() => change({ payload: "dark" }));
  expect(document.documentElement).toHaveClass("light");
  expect(mocks.setTheme).toHaveBeenCalledTimes(calls);
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
