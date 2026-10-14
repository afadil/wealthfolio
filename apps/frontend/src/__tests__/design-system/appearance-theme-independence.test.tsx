import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceForm } from "@/pages/settings/appearance/appearance-form";

const { updateSettings, settings } = vi.hoisted(() => ({
  updateSettings: vi.fn().mockResolvedValue(undefined),
  settings: {} as Record<string, string>,
}));
vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: () => ({ settings, updateSettings }),
}));
vi.mock("@/hooks/use-platform", () => ({ usePlatform: () => ({ isMobile: true }) }));
vi.mock("@/pages/layouts/navigation/navigation-mode-context", () => ({
  useNavigationMode: () => ({ mode: "sidebar", setMode: vi.fn() }),
}));

beforeEach(() => {
  updateSettings.mockClear();
  Object.assign(settings, {
    themeId: "theme-from-a-newer-version",
    theme: "dark",
    font: "font-serif",
  });
});

describe("appearance preference independence", () => {
  it("saves only the chosen palette and does not rewrite an unknown ID on mount", async () => {
    const user = userEvent.setup();
    render(<AppearanceForm />);
    expect(screen.getByRole("radio", { name: "Classic" })).toBeChecked();
    expect(updateSettings).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: "Newspaper" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ themeId: "newspaper" });
  });

  it("changing font saves only font, preserving palette and mode", async () => {
    const user = userEvent.setup();
    render(<AppearanceForm />);
    await user.click(screen.getByRole("button", { name: "Sans" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ font: "font-sans" });
  });

  it("changing appearance mode saves only mode, preserving palette and font", async () => {
    const user = userEvent.setup();
    render(<AppearanceForm />);
    await user.click(screen.getByRole("button", { name: "Light" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ theme: "light" });
  });
});

describe("theme suggestions", () => {
  it("picking Terminal applies its font and leaves a system user's mode alone", async () => {
    settings.theme = "system";
    const user = userEvent.setup();
    render(<AppearanceForm />);
    await user.click(screen.getByRole("radio", { name: "Terminal" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      themeId: "terminal",
      font: "font-mono",
    });
  });

  it("marks themes designed for dark without changing their names", () => {
    render(<AppearanceForm />);
    expect(screen.getByRole("radio", { name: "Terminal" })).toHaveAccessibleDescription(
      "Terminal is designed for dark mode.",
    );
    expect(screen.getByRole("radio", { name: "Classic" })).not.toHaveAttribute("aria-describedby");
  });

  it("offers the mode a theme is designed for and switches only on request", async () => {
    Object.assign(settings, { themeId: "terminal", theme: "light", font: "font-mono" });
    const user = userEvent.setup();
    render(<AppearanceForm />);
    const switchToDark = screen.getByRole("button", { name: "Switch to dark" });
    expect(switchToDark.parentElement).toHaveTextContent("Terminal is designed for dark mode.");
    expect(updateSettings).not.toHaveBeenCalled();
    await user.click(switchToDark);
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ theme: "dark" });
  });

  it("shows the font the theme suggests and restores it on request", async () => {
    Object.assign(settings, { themeId: "terminal", theme: "light", font: "font-serif" });
    const user = userEvent.setup();
    render(<AppearanceForm />);
    expect(screen.getByText("Terminal suggests Mono")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use theme defaults" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      themeId: "terminal",
      font: "font-mono",
    });
  });

  it("hides the reset link once the font matches the theme, whatever the mode", () => {
    Object.assign(settings, { themeId: "terminal", theme: "light", font: "font-mono" });
    render(<AppearanceForm />);
    expect(screen.queryByRole("button", { name: "Use theme defaults" })).not.toBeInTheDocument();
  });
});
