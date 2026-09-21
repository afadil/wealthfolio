import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "@wealthfolio/ui";

describe.each([false, true])("Dialog props with mobile=%s", (mobile) => {
  it("forwards content ref, accessible description, style and autofocus veto", () => {
    const ref = createRef<HTMLDivElement>();
    const onOpenAutoFocus = vi.fn((event: Event) => event.preventDefault());
    render(
      <Dialog defaultOpen useIsMobile={() => mobile}>
        <DialogContent
          ref={ref}
          aria-describedby="dialog-explanation"
          style={{ maxWidth: "700px" }}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <DialogTitle>Activity details</DialogTitle>
          <p id="dialog-explanation">Synthetic activity</p>
          <input aria-label="Activity note" />
        </DialogContent>
      </Dialog>,
    );
    const content = screen.getByRole("dialog");
    expect(ref.current).toBe(content);
    expect(content).toHaveAccessibleDescription("Synthetic activity");
    expect(content).toHaveStyle({ maxWidth: "700px" });
    expect(onOpenAutoFocus).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Activity note")).not.toHaveFocus();
  });
});
