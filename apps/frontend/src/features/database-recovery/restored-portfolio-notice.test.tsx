import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { act, render, screen } from "@/test/render";
import { beforeEach, expect, it, vi } from "vitest";
import copy from "@/i18n/locales/en/settings.json";
import { RestoredPortfolioNotice } from "./restored-portfolio-notice";

function CurrentLocation() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function RouterWrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/settings/exports"]}>
      {children}
      <CurrentLocation />
    </MemoryRouter>
  );
}

const mocks = vi.hoisted(() => ({
  hasConnectBinding: true,
  settings: null as { restoreReconnectRequired: boolean } | null,
  info: vi.fn<
    (title: string, options: { action: { label: string; onClick: () => void } }) => void
  >(),
  dismiss: vi.fn(),
}));
vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: () => ({ settings: mocks.settings }),
}));
vi.mock("@/features/profiles/profile-context", () => ({
  useProfile: () => ({ profile: { hasConnectBinding: mocks.hasConnectBinding } }),
}));
vi.mock("sonner", () => ({ toast: { info: mocks.info, dismiss: mocks.dismiss } }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings = null;
  mocks.hasConnectBinding = true;
});

it("waits for restored database settings rather than announcing during loading", () => {
  const view = render(<RestoredPortfolioNotice />, { wrapper: RouterWrapper });
  expect(mocks.info).not.toHaveBeenCalled();
  mocks.settings = { restoreReconnectRequired: false };
  view.rerender(<RestoredPortfolioNotice />);
  expect(mocks.info).not.toHaveBeenCalled();
  mocks.settings = { restoreReconnectRequired: true };
  view.rerender(<RestoredPortfolioNotice />);
  expect(mocks.info).toHaveBeenCalledWith(copy.backup_restored_title, {
    id: "restored-portfolio",
    description: copy.backup_import_reconnect,
    duration: Infinity,
    action: {
      label: copy.backup_restored_open_connect,
      onClick: expect.any(Function) as () => void,
    },
  });
  view.rerender(<RestoredPortfolioNotice />);
  expect(mocks.info).toHaveBeenCalledTimes(1);
});

it("removes stale feedback on reconnect or unmount without changing backend state", () => {
  mocks.settings = { restoreReconnectRequired: true };
  const view = render(<RestoredPortfolioNotice />, { wrapper: RouterWrapper });
  mocks.settings = { restoreReconnectRequired: false };
  view.rerender(<RestoredPortfolioNotice />);
  expect(mocks.dismiss).toHaveBeenCalledWith("restored-portfolio");
  mocks.settings = { restoreReconnectRequired: true };
  view.rerender(<RestoredPortfolioNotice />);
  view.unmount();
  expect(mocks.settings.restoreReconnectRequired).toBe(true);
  expect(mocks.dismiss).toHaveBeenCalledTimes(2);
});

it("opens Connect settings without clearing the reconnect flag or repeating the toast", () => {
  mocks.settings = { restoreReconnectRequired: true };
  render(<RestoredPortfolioNotice />, { wrapper: RouterWrapper });
  const options = mocks.info.mock.calls[0][1];
  act(() => {
    options.action.onClick();
  });
  expect(screen.getByTestId("location")).toHaveTextContent("/settings/connect");
  expect(mocks.settings.restoreReconnectRequired).toBe(true);
  expect(mocks.info).toHaveBeenCalledTimes(1);
});

it("does not ask a local-only profile to reconnect after restore", () => {
  mocks.settings = { restoreReconnectRequired: true };
  mocks.hasConnectBinding = false;
  render(<RestoredPortfolioNotice />, { wrapper: RouterWrapper });
  expect(mocks.info).not.toHaveBeenCalled();
  expect(mocks.settings.restoreReconnectRequired).toBe(true);
});
