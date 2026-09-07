import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "@wealthfolio/ui/components/ui/dialog";
import { describe, expect, it, vi } from "vitest";

const useDesktop = () => false;
const useMobile = () => true;

describe.each([
  { layout: "desktop", useIsMobile: useDesktop },
  { layout: "mobile", useIsMobile: useMobile },
])("Dialog $layout Escape callbacks", ({ useIsMobile }) => {
  it("ignores composition and preserves the caller's ordinary Escape veto", () => {
    const onOpenChange = vi.fn();
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault());
    render(
      <Dialog defaultOpen onOpenChange={onOpenChange} useIsMobile={useIsMobile}>
        <DialogContent onEscapeKeyDown={onEscapeKeyDown}>
          <DialogTitle>Edit name</DialogTitle>
          <input aria-label="Name" defaultValue="候選" />
        </DialogContent>
      </Dialog>,
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    input.focus();
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    fireEvent.keyDown(input, { key: "Escape", isComposing: false, keyCode: 229 });
    expect(onEscapeKeyDown).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onEscapeKeyDown).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(input).toHaveValue("候選");
  });
});
