import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FormattingProvider } from "@wealthfolio/ui";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { checkForUpdates } from "@/adapters";
import { useCheckForUpdates } from "@/hooks/use-updater";
import common from "@/i18n/locales/en/common.json";
import type { ExternalUpdateSource } from "@/lib/types";
import { UpdateDialog } from "./update-dialog";

const runtime = vi.hoisted(() => ({ isTauri: false }));

vi.mock("@/features/profiles/session", () => ({
  selectedProfileId: () => "dialog-profile",
  usesLegacyPreferences: () => false,
}));
vi.mock("@/adapters", () => ({
  get isTauri() {
    return runtime.isTauri;
  },
  logger: { error: vi.fn() },
  isAutoUpdateCheckEnabled: vi.fn().mockResolvedValue(true),
  checkForUpdates: vi.fn().mockResolvedValue({ latestVersion: "4.0.0", screenshots: [] }),
  installUpdate: vi.fn(),
  openUrlInBrowser: vi.fn(),
}));

function ManualCheck() {
  const check = useCheckForUpdates();
  return <button onClick={() => check.mutate()}>Check now</button>;
}

beforeEach(() => {
  localStorage.clear();
  runtime.isTauri = false;
  // The desktop hooks subscribe to Tauri events.
  mockIPC(() => undefined, { shouldMockEvents: true });
});
afterEach(() => {
  // Unmount before the Tauri mock goes, so listeners unsubscribe even after a failure.
  cleanup();
  clearMocks();
});

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <FormattingProvider locale="en-US">
        <UpdateDialog />
      </FormattingProvider>
    </QueryClientProvider>,
  );
  return () => {
    view.unmount();
    client.clear();
  };
}

it("the actual update dialog reopens after snooze and a manual check", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <FormattingProvider locale="en-US">
        <ManualCheck />
        <UpdateDialog />
      </FormattingProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("New Update Available")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Remind me later" }));
  await waitFor(() => expect(screen.queryByText("New Update Available")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Check now" }));
  expect(await screen.findByText("New Update Available")).toBeVisible();
  view.unmount();
  client.clear();
});

it.each([
  [
    { kind: "packager", explanation: "Update Wealthfolio with pacman." },
    "Update Wealthfolio with pacman.",
  ],
  [{ kind: "flatpak" }, common.component.update_external_flatpak],
  [{ kind: "packageManager" }, common.component.update_external_package_manager],
] as [ExternalUpdateSource, string][])(
  "shows the release and how to update instead of installing for %o",
  async (externalUpdateSource, instructions) => {
    runtime.isTauri = true;
    vi.mocked(checkForUpdates).mockResolvedValueOnce({
      currentVersion: "3.10.0",
      latestVersion: "4.0.0",
      notes: "Faster imports.",
      isAppStoreBuild: false,
      changelogUrl: "https://wealthfolio.app/changelog",
      externalUpdateSource,
    });
    const cleanup = renderDialog();
    expect(await screen.findByText("New Update Available")).toBeVisible();
    expect(screen.getByText("Faster imports.")).toBeVisible();
    expect(screen.getByText(instructions)).toBeVisible();
    expect(screen.getByRole("button", { name: "View Changelog" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Update Now" })).not.toBeInTheDocument();
    cleanup();
  },
);

it("offers to install when the app updates itself", async () => {
  runtime.isTauri = true;
  vi.mocked(checkForUpdates).mockResolvedValueOnce({
    currentVersion: "3.10.0",
    latestVersion: "4.0.0",
    isAppStoreBuild: false,
    externalUpdateSource: null,
  });
  const cleanup = renderDialog();
  expect(await screen.findByRole("button", { name: "Update Now" })).toBeVisible();
  cleanup();
});
