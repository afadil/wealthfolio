import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FormattingProvider, useDataGrid } from "@wealthfolio/ui";
import { useIsMobileViewport } from "@/hooks/use-platform";
import type { Quote } from "@/lib/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuoteEntry } from "./quote-history-utils";
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

const quote: Quote = {
  id: "quote-1",
  createdAt: "2026-08-18T12:00:00Z",
  dataSource: "MANUAL",
  timestamp: "2026-08-18T12:00:00Z",
  assetId: "asset-1",
  open: 10,
  high: 11,
  low: 9,
  close: 10,
  adjclose: 10,
  volume: 100,
  currency: "EUR",
};

describe("QuoteHistoryDataGrid localization", () => {
  beforeEach(() => {
    vi.mocked(useIsMobileViewport).mockReturnValue(true);
    vi.mocked(useDataGrid).mockClear();
  });

  it("formats mobile quote dates with the formatting locale", () => {
    render(
      <FormattingProvider locale="de-DE" uiLocale="en">
        <QuoteHistoryDataGrid
          data={[quote]}
          assetId="asset-1"
          currency="EUR"
          onSaveQuote={vi.fn()}
          onDeleteQuote={vi.fn()}
        />
      </FormattingProvider>,
    );

    expect(screen.getByText("18.08.26")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-18")).not.toBeInTheDocument();
  });
  it.each([false, true])("preserves the quote day through editing (mobile: %s)", (mobile) => {
    vi.mocked(useIsMobileViewport).mockReturnValue(mobile);
    const onSaveQuote = vi.fn();
    render(
      <MemoryRouter>
        <FormattingProvider locale="en-US" uiLocale="en">
          <QuoteHistoryDataGrid
            data={[quote]}
            assetId="asset-1"
            currency="EUR"
            isManualDataSource
            onSaveQuote={onSaveQuote}
            onDeleteQuote={vi.fn()}
          />
        </FormattingProvider>
      </MemoryRouter>,
    );
    const grid = vi.mocked(useDataGrid).mock.calls.at(-1)![0] as unknown as {
      data: QuoteEntry[];
      onDataChange: (entries: QuoteEntry[]) => void;
    };
    expect([
      grid.data[0].date.getFullYear(),
      grid.data[0].date.getMonth(),
      grid.data[0].date.getDate(),
    ]).toEqual([2026, 7, 18]);
    act(() => grid.onDataChange(grid.data.map((entry) => ({ ...entry, close: 12 }))));
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    expect(onSaveQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: "2026-08-18T00:00:00Z",
        close: 12,
      }),
    );
  });
});
