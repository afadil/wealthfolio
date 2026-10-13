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

const renderEditMode = (holding: Holding = makeHolding()) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HoldingsEditMode
        holdings={[holding]}
        account={account}
        isLoading={false}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );

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
});
