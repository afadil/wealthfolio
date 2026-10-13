import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import copy from "@/i18n/locales/en/settings.json";
import SettingsLayout from "./settings-layout";

const mocks = vi.hoisted(() => ({ platform: { isTauri: true, isMobile: false } }));
// The real usePlatform asks Tauri for platform info, which jsdom lacks.
vi.mock("@/hooks/use-platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-platform")>()),
  usePlatform: () => mocks.platform,
}));

const initialWidth = window.innerWidth;
let mounts = 0;

function CountingPage() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <div data-testid="settings-page" />;
}

function renderAt(path: string, width: number) {
  window.innerWidth = width;
  mounts = 0;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<CountingPage />} />
          <Route path="connect" element={<CountingPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.platform = { isTauri: true, isMobile: false };
});

afterEach(() => {
  window.innerWidth = initialWidth;
});

describe("SettingsLayout", () => {
  // Regression: a second, CSS-hidden copy of the page opened its dialogs twice.
  it.each([
    ["desktop", 1280],
    ["phone", 390],
  ])("mounts a settings page once on %s", (_, width) => {
    renderAt("/settings/connect", width);

    expect(screen.getAllByTestId("settings-page")).toHaveLength(1);
    expect(mounts).toBe(1);
  });

  it("keeps the page mounted when the window crosses the breakpoint", () => {
    renderAt("/settings/connect", 1280);

    act(() => {
      window.innerWidth = 390;
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getAllByTestId("settings-page")).toHaveLength(1);
    expect(mounts).toBe(1);
  });

  it("shows the settings list instead of the index page on phones", () => {
    renderAt("/settings", 390);

    expect(screen.queryByTestId("settings-page")).not.toBeInTheDocument();
    expect(mounts).toBe(0);
  });

  // The MCP server ships with the desktop app and the web server, not the phone apps.
  it.each([
    ["the desktop app", 1280, true, false, true],
    ["the web app on a phone", 390, false, true, true],
    ["the phone app", 390, true, true, false],
  ])("lists AI Agent Access in %s", (_, width, isTauri, isMobile, listed) => {
    mocks.platform = { isTauri, isMobile };
    renderAt("/settings", width);

    expect(screen.getByText(copy.nav.items.ai_providers)).toBeInTheDocument();
    if (listed) {
      expect(screen.getByText(copy.nav.items.agent_access)).toBeInTheDocument();
    } else {
      expect(screen.queryByText(copy.nav.items.agent_access)).not.toBeInTheDocument();
    }
  });
});
