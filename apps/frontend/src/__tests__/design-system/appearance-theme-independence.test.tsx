import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceForm } from "@/pages/settings/appearance/appearance-form";

const { updateSettings, settings, toastMessage } = vi.hoisted(() => ({
  updateSettings: vi.fn().mockResolvedValue(undefined),
  settings: {} as Record<string, string>,
  toastMessage: vi.fn(),
}));
vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: () => ({ settings, updateSettings }),
}));
vi.mock("@wealthfolio/ui/components/ui/use-toast", () => ({ toast: { message: toastMessage } }));
vi.mock("@/hooks/use-platform", () => ({ usePlatform: () => ({ isMobile: true }) }));
vi.mock("@/pages/layouts/navigation/navigation-mode-context", () => ({
  useNavigationMode: () => ({ mode: "sidebar", setMode: vi.fn() }),
}));

beforeEach(() => {
  updateSettings.mockClear();
  toastMessage.mockClear();
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
    expect(screen.getByRole("radio", { name: "Flexoki" })).toBeChecked();
    expect(updateSettings).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: "Newspaper" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ themeId: "newspaper" });
    expect(toastMessage).not.toHaveBeenCalled();
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
  it("picking Terminal switches a system user to dark and mono, and Undo restores both", async () => {
    settings.theme = "system";
    const user = userEvent.setup();
    render(<AppearanceForm />);
    await user.click(screen.getByRole("radio", { name: "Terminal" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      themeId: "terminal",
      font: "font-mono",
      theme: "dark",
    });
    await waitFor(() => expect(toastMessage).toHaveBeenCalledOnce());
    const [message, options] = toastMessage.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("Terminal switched you to Dark and Mono");
    expect(options.action.label).toBe("Undo");
    options.action.onClick();
    expect(updateSettings).toHaveBeenLastCalledWith({ theme: "system", font: "font-serif" });
  });

  it("says nothing when the theme's suggestions are already in effect", async () => {
    Object.assign(settings, { theme: "dark", font: "font-mono" });
    const user = userEvent.setup();
    render(<AppearanceForm />);
    await user.click(screen.getByRole("radio", { name: "Terminal" }));
    expect(updateSettings).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(toastMessage).not.toHaveBeenCalled();
  });

  it("shows what the theme suggests and restores it on request", async () => {
    Object.assign(settings, { themeId: "terminal", theme: "light", font: "font-serif" });
    const user = userEvent.setup();
    render(<AppearanceForm />);
    expect(screen.getByText("Terminal suggests Dark")).toBeInTheDocument();
    expect(screen.getByText("Terminal suggests Mono")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use theme defaults" }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      themeId: "terminal",
      font: "font-mono",
      theme: "dark",
    });
  });

  it("hides the reset link once the user's choices match the theme", () => {
    Object.assign(settings, { themeId: "terminal", theme: "dark", font: "font-mono" });
    render(<AppearanceForm />);
    expect(screen.queryByRole("button", { name: "Use theme defaults" })).not.toBeInTheDocument();
  });
});
