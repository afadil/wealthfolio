import { fireEvent, render, screen, waitFor, within } from "@/test/render";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useIsMobileViewport } from "@/hooks/use-platform";
import type { Quote } from "@/lib/types";

import { QuoteHistoryDataGrid } from "./quote-history-data-grid";

vi.mock("@/hooks/use-platform", () => ({ useIsMobileViewport: vi.fn() }));

vi.mock("@wealthfolio/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wealthfolio/ui")>();
  return {
    ...actual,
    DataGrid: () => <div data-testid="data-grid" />,
    useDataGrid: vi.fn(() => ({
      table: { getSelectedRowModel: () => ({ rows: [] }), resetRowSelection: vi.fn() },
      onRowAdd: vi.fn(),
    })),
  };
});

const assetId = "asset-1";

const createQuote = (date: string, close: number, id = `${assetId}_${date}_MANUAL`): Quote => ({
  id,
  createdAt: `${date}T00:00:00.000Z`,
  dataSource: "MANUAL",
  timestamp: `${date}T00:00:00Z`,
  assetId,
  open: close,
  high: close,
  low: close,
  close,
  adjclose: close,
  volume: 100,
  currency: "EUR",
});

interface RenderGridOptions {
  data?: Quote[];
  isManualDataSource?: boolean;
  onSaveQuote?: (quote: Quote) => Promise<void>;
  onDeleteQuote?: (quoteId: string) => Promise<void>;
}

const grid = ({
  data = [createQuote("2026-08-18", 10)],
  isManualDataSource = true,
  onSaveQuote = vi.fn().mockResolvedValue(undefined),
  onDeleteQuote = vi.fn().mockResolvedValue(undefined),
}: RenderGridOptions = {}) => (
  <QuoteHistoryDataGrid
    data={data}
    assetId={assetId}
    currency="EUR"
    isManualDataSource={isManualDataSource}
    onSaveQuote={onSaveQuote}
    onDeleteQuote={onDeleteQuote}
  />
);

const Router = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const renderGrid = (options: RenderGridOptions = {}) => render(grid(options), { wrapper: Router });

const editButton = () => screen.getByRole("button", { name: /^Edit / });

describe("QuoteHistoryDataGrid mobile editing", () => {
  beforeEach(() => {
    vi.mocked(useIsMobileViewport).mockReturnValue(true);
  });

  it("saves a new quote from its own editor", async () => {
    const onSaveQuote = vi.fn().mockResolvedValue(undefined);
    renderGrid({ data: [], onSaveQuote });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Close" }), {
      target: { value: "11.678" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Volume" }), {
      target: { value: "1200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
    expect(onSaveQuote).toHaveBeenCalledTimes(1);
    expect(onSaveQuote).toHaveBeenCalledWith(
      expect.objectContaining({ assetId, close: 11.678, volume: 1200, dataSource: "MANUAL" }),
    );
    expect(editButton()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });

  it("keeps an existing quote's ID and untouched values when one field changes", async () => {
    const onSaveQuote = vi.fn().mockResolvedValue(undefined);
    renderGrid({ data: [createQuote("2026-08-18", 11.123456789, "quote-1")], onSaveQuote });

    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("textbox", { name: "Open" }), {
      target: { value: "11.6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaveQuote).toHaveBeenCalledTimes(1));
    expect(onSaveQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "quote-1",
        timestamp: "2026-08-18T00:00:00Z",
        open: 11.6,
        close: 11.123456789,
      }),
    );
  });

  it("discards the draft on Cancel without saving", () => {
    const onSaveQuote = vi.fn().mockResolvedValue(undefined);
    renderGrid({ onSaveQuote });

    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("textbox", { name: "Close" }), {
      target: { value: "99" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onSaveQuote).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Close" })).toBeNull();
    expect(editButton()).toBeInTheDocument();
  });

  it("keeps the draft open when saving fails", async () => {
    const onSaveQuote = vi.fn().mockRejectedValue(new Error("save failed"));
    renderGrid({ onSaveQuote });

    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("textbox", { name: "Close" }), {
      target: { value: "12.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaveQuote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: "Close" })).toHaveValue("12.5");
  });

  it("preserves an open draft when external data refreshes", () => {
    const onSaveQuote = vi.fn().mockResolvedValue(undefined);
    const onDeleteQuote = vi.fn().mockResolvedValue(undefined);
    const view = renderGrid({ onSaveQuote, onDeleteQuote });

    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("textbox", { name: "Close" }), {
      target: { value: "12.5" },
    });
    view.rerender(grid({ data: [createQuote("2026-08-18", 10.5)], onSaveQuote, onDeleteQuote }));

    expect(screen.getByRole("textbox", { name: "Close" })).toHaveValue("12.5");
  });

  it("deletes a quote only after confirmation", async () => {
    const onDeleteQuote = vi.fn().mockResolvedValue(undefined);
    renderGrid({ data: [createQuote("2026-08-18", 10, "quote-1")], onDeleteQuote });

    fireEvent.click(screen.getByRole("button", { name: /^Delete / }));
    expect(onDeleteQuote).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "Delete history entry?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onDeleteQuote).toHaveBeenCalledWith("quote-1"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByText("No quotes available.")).toBeInTheDocument();
  });

  it("keeps the row and confirmation open when deletion fails", async () => {
    const onDeleteQuote = vi.fn().mockRejectedValue(new Error("delete failed"));
    renderGrid({ onDeleteQuote });

    fireEvent.click(screen.getByRole("button", { name: /^Delete / }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete history entry?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onDeleteQuote).toHaveBeenCalledTimes(1));
    const openDialog = screen.getByRole("alertdialog", { name: "Delete history entry?" });
    fireEvent.click(within(openDialog).getByRole("button", { name: "Cancel" }));
    expect(editButton()).toBeInTheDocument();
  });

  it("uses the stored manual ID after saving a provider-sourced quote", async () => {
    const onDeleteQuote = vi.fn().mockResolvedValue(undefined);
    renderGrid({
      data: [createQuote("2026-08-18", 10, `${assetId}_2026-08-18_YAHOO`)],
      onDeleteQuote,
    });

    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("textbox", { name: "Close" }), {
      target: { value: "10.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Close" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /^Delete / }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete history entry?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onDeleteQuote).toHaveBeenCalledWith(`${assetId}_2026-08-18_MANUAL`));
  });

  it("drops an open draft when manual tracking is turned off", () => {
    const data = Array.from({ length: 21 }, (_, i) =>
      createQuote(`2026-07-${String(i + 1).padStart(2, "0")}`, 10 + i),
    );
    const view = renderGrid({ data });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    view.rerender(grid({ data, isManualDataSource: false }));

    expect(screen.queryByRole("textbox", { name: "Close" })).toBeNull();
    expect(screen.getAllByText(/^\d+\/\d+\/26$/)).toHaveLength(20);
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    // Turning manual tracking back on must not bring the old draft back.
    view.rerender(grid({ data, isManualDataSource: true }));
    expect(screen.queryByRole("textbox", { name: "Close" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
