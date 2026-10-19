import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DirectionProvider, useDataGrid, type TextDirection } from "@wealthfolio/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

interface Row {
  a: string;
  b: string;
  c: string;
}

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const data: Row[] = [{ a: "1", b: "2", c: "3" }];
const columns: ColumnDef<Row>[] = (["a", "b", "c"] as const).map((key) => ({
  accessorKey: key,
  meta: { cell: { variant: "short-text" } },
}));

function Harness() {
  const grid = useDataGrid<Row>({ data, columns });
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          grid.tableMeta?.onCellClick?.(0, "b", event);
        }}
      >
        Focus b
      </button>
      <button type="button" onClick={() => grid.tableMeta?.onCellEditingStart?.(0, "b")}>
        Edit b
      </button>
      <div ref={grid.dataGridRef}>
        <input aria-label="Cell draft" />
      </div>
      <output data-testid="focused">{grid.focusedCell?.columnId ?? "none"}</output>
    </>
  );
}

async function pressTab(
  direction: TextDirection,
  { editing, shift = false }: { editing: boolean; shift?: boolean },
) {
  render(
    <DirectionProvider direction={direction}>
      <Harness />
    </DirectionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Focus b" }));
  if (editing) fireEvent.click(screen.getByRole("button", { name: "Edit b" }));
  await waitFor(() => expect(screen.getByTestId("focused")).toHaveTextContent("b"));
  const input = screen.getByRole("textbox", { name: "Cell draft" });
  act(() => input.focus());
  fireEvent.keyDown(input, { key: "Tab", shiftKey: shift });
}

// Tab moves to the next column in reading order. In a right-to-left grid that
// column is to the left, but it is still the next one: "c" after "b".
describe("data grid Tab", () => {
  it.each([
    ["ltr", true],
    ["rtl", true],
    ["ltr", false],
    ["rtl", false],
  ] as const)("moves to the next column in %s (editing: %s)", async (direction, editing) => {
    await pressTab(direction, { editing });
    await waitFor(() => expect(screen.getByTestId("focused")).toHaveTextContent("c"));
  });

  it("moves to the previous column with Shift+Tab while editing in rtl", async () => {
    await pressTab("rtl", { editing: true, shift: true });
    await waitFor(() => expect(screen.getByTestId("focused")).toHaveTextContent("a"));
  });
});
