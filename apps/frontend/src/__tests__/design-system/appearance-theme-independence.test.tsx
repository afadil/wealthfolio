import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppearanceForm } from "@/pages/settings/appearance/appearance-form";

const { updateSettings } = vi.hoisted(() => ({
  updateSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: () => ({
    settings: { themeId: "theme-from-a-newer-version", theme: "dark", font: "font-serif" },
    updateSettings,
  }),
}));
vi.mock("@/hooks/use-platform", () => ({ usePlatform: () => ({ isMobile: true }) }));
vi.mock("@/pages/layouts/navigation/navigation-mode-context", () => ({
  useNavigationMode: () => ({ mode: "sidebar", setMode: vi.fn() }),
}));

describe("appearance preference independence", () => {
  it("saves only the chosen palette and does not rewrite an unknown ID on mount", async () => {
    updateSettings.mockClear();
    const user = userEvent.setup();
    render(<AppearanceForm />);
    expect(screen.getByRole("radio", { name: "Flexoki" })).toBeChecked();
    expect(updateSettings).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: "Newspaper" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ themeId: "newspaper" });
  });

  it("changing font saves only font, preserving palette and mode", async () => {
    updateSettings.mockClear();
    const user = userEvent.setup();
    render(<AppearanceForm />);
    await user.click(screen.getByRole("button", { name: "Aa Sans" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ font: "font-sans" });
  });

  it("changing appearance mode saves only mode, preserving palette and font", async () => {
    updateSettings.mockClear();
    const user = userEvent.setup();
    render(<AppearanceForm />);
    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ theme: "light" });
  });
});
