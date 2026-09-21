import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@wealthfolio/ui";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

// Compare CSSOM-normalized expressions: jsdom serializes env() differently from browsers.
function cssValue(property: "paddingTop" | "top", value: string) {
  const element = document.createElement("div");
  element.style[property] = value;
  return element.style[property];
}

function Content() {
  return (
    <>
      <SheetTitle>Synthetic account</SheetTitle>
      <SheetDescription>Edit the sample account name.</SheetDescription>
      <input aria-label="Account name" defaultValue="Long-term savings" />
    </>
  );
}

describe("Sheet preservation contracts", () => {
  it("uses the translated close label and returns focus to its composed trigger", async () => {
    const translations = i18next.createInstance();
    await translations.init({
      lng: "fr",
      resources: { fr: { ui: { sheet: { close: "Fermer" } } } },
    });
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={translations}>
        <Sheet>
          <SheetTrigger asChild>
            <button>Edit sample</button>
          </SheetTrigger>
          <SheetContent>
            <Content />
          </SheetContent>
        </Sheet>
      </I18nextProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Edit sample" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Synthetic account" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it.each(["top", "left", "right"] as const)(
    "keeps safe-area offsets for the %s sheet and its close control",
    (side) => {
      render(
        <Sheet defaultOpen>
          <SheetContent side={side}>
            <Content />
          </SheetContent>
        </Sheet>,
      );
      expect(screen.getByRole("dialog").style.paddingTop).toBe(
        cssValue("paddingTop", "calc(env(safe-area-inset-top, 0px) + 1.5rem)"),
      );
      expect(screen.getByRole("button", { name: "Close" }).style.top).toBe(
        cssValue("top", "calc(env(safe-area-inset-top, 0px) + 1rem)"),
      );
    },
  );

  it("keeps bottom sheets clear of the top inset and honors custom padding", () => {
    const { rerender } = render(
      <Sheet defaultOpen>
        <SheetContent side="bottom">
          <Content />
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("dialog").style.paddingTop).toBe("");
    expect(screen.getByRole("button", { name: "Close" }).style.top).toBe("1rem");
    rerender(
      <Sheet defaultOpen>
        <SheetContent side="right" showCloseButton={false} style={{ paddingTop: "8px" }}>
          <Content />
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("dialog").style.paddingTop).toBe("8px");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});
