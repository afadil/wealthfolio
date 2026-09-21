import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataGridContextMenu } from "@wealthfolio/ui/components/data-grid/data-grid-context-menu";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

function ContextMenuFixture({ onCopy }: { onCopy: () => void }) {
  const dataGridRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  return (
    <>
      <div tabIndex={0} ref={dataGridRef} aria-label="Synthetic grid" role="grid" />
      <DataGridContextMenu
        columns={[]}
        contextMenu={{ open, x: 10, y: 10 }}
        tableMeta={{
          dataGridRef,
          onContextMenuOpenChange: setOpen,
          onCellsCopy: onCopy,
        }}
      />
    </>
  );
}

describe("grid context menu focus preservation", () => {
  it.each(["Escape", "copy"])("restores focus to the grid after %s dismissal", async (action) => {
    const onCopy = vi.fn();
    const user = userEvent.setup();
    render(<ContextMenuFixture onCopy={onCopy} />);
    const copy = await screen.findByRole("menuitem", { name: "Copy" });
    if (action === "copy") {
      await user.click(copy);
      expect(onCopy).toHaveBeenCalledOnce();
    } else {
      await user.keyboard("{Escape}");
      expect(onCopy).not.toHaveBeenCalled();
    }
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("grid")).toHaveFocus());
  });
});
