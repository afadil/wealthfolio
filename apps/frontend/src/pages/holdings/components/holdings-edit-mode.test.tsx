import { HoldingType, QuoteMode } from "@/lib/constants";
import type { Account, Holding } from "@/lib/types";
import { fireEvent, render, screen } from "@/test/render";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { HoldingsEditMode } from "./holdings-edit-mode";

vi.mock("@/adapters", () => ({
  getSnapshotByDate: vi.fn(),
  saveManualHoldings: vi.fn(),
  deleteSnapshot: vi.fn(),
}));

vi.mock("@/components/ticker-search", () => ({
  default: () => null,
}));

const account: Account = {
  id: "account-1",
  name: "Brokerage",
  accountType: "SECURITIES" as Account["accountType"],
  balance: 0,
  currency: "USD",
  isDefault: true,
  isActive: true,
  isArchived: false,
  trackingMode: "HOLDINGS" as Account["trackingMode"],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeHolding = (overrides: Partial<Holding> = {}): Holding => ({
  id: "AAPL",
  accountId: "account-1",
  holdingType: HoldingType.SECURITY,
  quantity: 10,
  localCurrency: "USD",
  baseCurrency: "USD",
  marketValue: { local: 250, base: 250 },
  costBasis: { local: 250, base: 250 },
  weight: 100,
  asOfDate: "2026-01-01",
  instrument: {
    id: "AAPL",
    symbol: "AAPL",
    currency: "USD",
    quoteMode: QuoteMode.MARKET,
  },
  ...overrides,
});

const holdingFor = (symbol: string): Holding =>
  makeHolding({
    id: symbol,
    instrument: { id: symbol, symbol, currency: "USD", quoteMode: QuoteMode.MARKET },
  });

const renderHoldings = (holdings: Holding[]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HoldingsEditMode holdings={holdings} account={account} isLoading={false} onClose={vi.fn()} />
    </QueryClientProvider>,
  );

const renderEditMode = (holding: Holding = makeHolding()) => renderHoldings([holding]);

describe("HoldingsEditMode cost fields", () => {
  it("recomputes cost per share when total cost is edited", () => {
    renderEditMode();
    const averageCost = screen.getByTestId("holding-average-cost-AAPL");
    const totalCost = screen.getByTestId("holding-total-cost-AAPL");

    expect(averageCost).toHaveValue("25");
    expect(totalCost).toHaveValue("250");

    fireEvent.change(totalCost, { target: { value: "500" } });

    expect(averageCost).toHaveValue("50");
    expect(totalCost).toHaveValue("500");
  });

  it("recomputes total cost when cost per share is edited", () => {
    renderEditMode();
    const averageCost = screen.getByTestId("holding-average-cost-AAPL");
    const totalCost = screen.getByTestId("holding-total-cost-AAPL");

    fireEvent.change(averageCost, { target: { value: "30" } });

    expect(totalCost).toHaveValue("300");
    expect(averageCost).toHaveValue("30");
  });

  it("recomputes total cost from cost per share when shares change", () => {
    renderEditMode();
    const averageCost = screen.getByTestId("holding-average-cost-AAPL");
    const totalCost = screen.getByTestId("holding-total-cost-AAPL");
    const shares = screen.getByTestId("holding-shares-AAPL");

    fireEvent.change(shares, { target: { value: "20" } });

    expect(averageCost).toHaveValue("25");
    expect(totalCost).toHaveValue("500");
  });

  it("keeps a Total entered before shares and derives cost per share", () => {
    renderEditMode(makeHolding({ quantity: 0, costBasis: { local: 0, base: 0 } }));
    const averageCost = screen.getByTestId("holding-average-cost-AAPL");
    const totalCost = screen.getByTestId("holding-total-cost-AAPL");
    const shares = screen.getByTestId("holding-shares-AAPL");

    // Total is entered first, while shares are still zero.
    fireEvent.change(totalCost, { target: { value: "500" } });
    expect(totalCost).toHaveValue("500");
    expect(averageCost).toHaveValue("");

    // Entering shares should preserve the Total and derive cost per share.
    fireEvent.change(shares, { target: { value: "10" } });

    expect(totalCost).toHaveValue("500");
    expect(averageCost).toHaveValue("50");
  });

  it("keeps a Total edited last when shares change", () => {
    renderEditMode();
    const averageCost = screen.getByTestId("holding-average-cost-AAPL");
    const totalCost = screen.getByTestId("holding-total-cost-AAPL");
    const shares = screen.getByTestId("holding-shares-AAPL");

    fireEvent.change(totalCost, { target: { value: "500" } });
    expect(averageCost).toHaveValue("50");

    fireEvent.change(shares, { target: { value: "20" } });

    expect(totalCost).toHaveValue("500");
    expect(averageCost).toHaveValue("25");
  });

  it("keeps each row's cost fields independent", () => {
    renderHoldings([holdingFor("AAPL"), holdingFor("MSFT")]);

    const aaplAverage = screen.getByTestId("holding-average-cost-AAPL");
    const aaplTotal = screen.getByTestId("holding-total-cost-AAPL");
    const aaplShares = screen.getByTestId("holding-shares-AAPL");
    const msftAverage = screen.getByTestId("holding-average-cost-MSFT");
    const msftTotal = screen.getByTestId("holding-total-cost-MSFT");
    const msftShares = screen.getByTestId("holding-shares-MSFT");

    // Edit only the first row.
    fireEvent.change(aaplTotal, { target: { value: "500" } });
    fireEvent.change(aaplShares, { target: { value: "20" } });

    // The first row honours its own last-touched field (Total kept).
    expect(aaplTotal).toHaveValue("500");
    expect(aaplAverage).toHaveValue("25");

    // The second row kept its own values and its own default, so a shares edit
    // still re-derives Total from Avg Cost: the first row's intent did not leak.
    expect(msftTotal).toHaveValue("250");
    expect(msftAverage).toHaveValue("25");

    fireEvent.change(msftShares, { target: { value: "20" } });

    expect(msftTotal).toHaveValue("500");
    expect(msftAverage).toHaveValue("25");

    // Editing the second row left the first row alone.
    expect(aaplTotal).toHaveValue("500");
    expect(aaplAverage).toHaveValue("25");
  });
});
