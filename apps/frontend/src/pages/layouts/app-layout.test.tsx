import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "./app-layout";

const platform = vi.hoisted(() => ({ isTauri: false, isMobile: false, isDesktop: true }));

vi.mock("@/hooks/use-platform", () => ({
  usePlatform: () => ({ ...platform, isMacOS: false }),
  useIsMobileViewport: () => platform.isMobile,
}));
vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: () => ({ settings: { onboardingCompleted: true } }),
}));
vi.mock("@/context/portfolio-sync-context", () => ({
  PortfolioSyncProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./navigation/navigation-mode-context", () => ({
  NavigationModeProvider: ({ children }: { children: ReactNode }) => children,
  useNavigationMode: () => ({ isLaunchBar: false, isFocusMode: false }),
}));
vi.mock("./navigation/app-navigation", () => ({ useNavigation: () => ({}) }));
vi.mock("./navigation/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("./navigation/floating-navigation-bar", () => ({ FloatingNavigationBar: () => null }));
vi.mock("./navigation/mobile-navbar", () => ({ MobileNavBar: () => null }));
vi.mock("./mobile-navigation-container", () => ({ MobileNavigationContainer: () => null }));
vi.mock("@/components/app-launcher", () => ({ default: () => null }));
vi.mock("@/components/update-dialog", () => ({ UpdateDialog: () => null }));
vi.mock("@/components/mobile-loading-indicator", () => ({ MobileLoadingIndicator: () => null }));
vi.mock("@/use-global-event-listener", () => ({ default: () => true }));
vi.mock("@/features/devices-sync/hooks/use-active-app-sync-trigger", () => ({
  useActiveAppSyncTrigger: () => undefined,
}));
vi.mock("@/features/wealthfolio-connect/hooks", () => ({
  usePostLoginConnectSync: () => undefined,
}));

const dragStrip = () => {
  const { container } = render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<p>Dashboard</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return container.querySelector("main > [data-tauri-drag-region]");
};

describe("AppLayout window drag strip", () => {
  beforeEach(() => Object.assign(platform, { isTauri: false, isMobile: false, isDesktop: true }));

  it("is not rendered in a browser, where it would cover the top of the page", () => {
    expect(dragStrip()).toBeNull();
  });

  it("is not rendered in the phone app, which has no window to drag", () => {
    Object.assign(platform, { isTauri: true, isMobile: true, isDesktop: false });
    expect(dragStrip()).toBeNull();
  });

  it("is rendered in the desktop app", () => {
    Object.assign(platform, { isTauri: true });
    expect(dragStrip()).toBeInTheDocument();
  });
});
