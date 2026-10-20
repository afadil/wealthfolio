import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
  useDirection,
} from "@wealthfolio/ui";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppDirectionProvider, setLanguageDirection } from "./direction";

type SetDirection = (direction: "ltr" | "rtl" | null) => void;

function setDevelopmentDirection(direction: "ltr" | "rtl" | null) {
  (globalThis as unknown as { __wealthfolioSetDirection: SetDirection }).__wealthfolioSetDirection(
    direction,
  );
}

// Arabic is not a shipped language; i18next still knows it is right-to-left,
// which is the path a shipped right-to-left language will take.
function setLanguage(language: string) {
  act(() => setLanguageDirection(language));
}

function ContextDirection() {
  return <output aria-label="context direction">{useDirection()}</output>;
}

function ReportingTabs() {
  return (
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
        <TabsTrigger value="three">Three</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

describe("document direction", () => {
  afterEach(() => {
    setLanguage("en");
  });

  it("follows the UI language, starting left-to-right", () => {
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
    setLanguage("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    setLanguage("en");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });

  it("reads a development override from ?dir= and lets it be cleared at runtime", async () => {
    // The override is read once, when the module loads.
    window.history.replaceState(null, "", "/?dir=rtl");
    vi.resetModules();
    const fresh = await import("./direction");
    window.history.replaceState(null, "", "/");

    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    // The override wins over the language until it is cleared.
    fresh.setLanguageDirection("en");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    setDevelopmentDirection(null);
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });

  it("gives Base UI the direction, including inside portalled popups", async () => {
    setLanguage("ar");
    const user = userEvent.setup();

    render(
      <AppDirectionProvider>
        <ContextDirection />
        <DropdownMenu>
          <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
          <DropdownMenuContent>
            <ContextDirection />
            <DropdownMenuItem>Edit</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </AppDirectionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await screen.findByRole("menu");

    const outputs = screen.getAllByRole("status", { name: "context direction" });
    expect(outputs.map((output) => output.textContent)).toEqual(["rtl", "rtl"]);
  });

  it("moves tab focus with the arrow that points forward in the reading direction", async () => {
    setLanguage("ar");
    const user = userEvent.setup();
    render(
      <AppDirectionProvider>
        <ReportingTabs />
      </AppDirectionProvider>,
    );

    await user.click(screen.getByRole("tab", { name: "One" }));
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();

    // Switching back to left-to-right takes effect without remounting.
    setLanguage("en");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();
  });

  it("opens a submenu with the arrow that points to its side", async () => {
    setLanguage("ar");
    const user = userEvent.setup();
    render(
      <AppDirectionProvider>
        <DropdownMenu>
          <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Savings</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </AppDirectionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));
    const trigger = await screen.findByRole("menuitem", { name: "Move to" });
    act(() => trigger.focus());

    await user.keyboard("{ArrowRight}");
    expect(screen.queryByRole("menuitem", { name: "Savings" })).not.toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByRole("menuitem", { name: "Savings" })).toBeInTheDocument();
  });
});
