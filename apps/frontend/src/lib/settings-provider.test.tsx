import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/lib/settings-provider";
import type { Settings } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(),
  windowTheme: vi.fn(),
}));
vi.mock("@/adapters", () => ({
  isTauri: true,
  logger: { error: vi.fn() },
}));
vi.mock("@/hooks/use-platform", () => ({ getPlatform: () => mocks.platform() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTheme: async () => {},
    theme: () => mocks.windowTheme(),
    onThemeChanged: async () => () => {},
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

const settings = {
  theme: "system",
  font: "font-mono",
  language: "en",
  formattingRegion: "system",
  timezone: "UTC",
  onboardingCompleted: true,
} as Settings;

beforeEach(() => {
  vi.clearAllMocks();
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
});

it("keeps the system media query theme on mobile instead of the native window theme", async () => {
  mocks.platform.mockResolvedValue({ os: "android", is_mobile: true, is_desktop: false });

  render(<SettingsProvider>content</SettingsProvider>);

  await waitFor(() => expect(mocks.platform).toHaveBeenCalled());
  await act(async () => {});
  expect(document.documentElement).toHaveClass("dark");
  expect(document.documentElement).not.toHaveClass("light");
  expect(mocks.windowTheme).not.toHaveBeenCalled();
});

it("follows the native window theme for system mode on desktop", async () => {
  mocks.platform.mockResolvedValue({ os: "linux", is_mobile: false, is_desktop: true });

  render(<SettingsProvider>content</SettingsProvider>);

  await waitFor(() => expect(document.documentElement).toHaveClass("light"));
  expect(mocks.windowTheme).toHaveBeenCalled();
});
