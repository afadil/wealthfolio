import { fireEvent, render, screen } from "@/test/render";
import { describe, expect, it } from "vitest";

import type { AssetLotView } from "@/lib/types";

import { AssetLotsTable } from "./asset-lots-table";

const ctyLot: AssetLotView = {
  id: "cty-lot",
  accountId: "isa",
  accountName: "ISA",
  assetId: "CTY",
  source: "TRANSACTION_LOT",
  currency: "GBp",
  baseCurrency: "GBP",
  valuationCurrency: "GBP",
  quantity: 51,
  originalQuantity: 51,
  remainingQuantity: 51,
  costBasis: 28395.015,
  costBasisBase: 283.95015,
  unitCost: 556.765,
  fees: 0,
  taxes: 0,
  taxesBase: 0,
  valuationUnitCost: 5.56765,
  valuationCostBasis: 283.95015,
  fxRateToBase: 0.01,
  splitRatio: 1,
  contractMultiplier: 1,
  acquisitionDate: "2026-03-03",
  snapshotDate: null,
  isClosed: false,
  closeDate: null,
  disposalProceeds: null,
  disposalCostBasis: null,
  disposalCostBasisBase: null,
  realizedPnl: null,
  realizedPnlBase: null,
  valuationDisposalCostBasis: null,
  valuationRealizedPnl: null,
};

const usdLot: AssetLotView = {
  ...ctyLot,
  id: "usd-lot",
  currency: "USD",
  baseCurrency: "USD",
  valuationCurrency: "USD",
  quantity: 3,
  originalQuantity: 3,
  remainingQuantity: 3,
  costBasis: 30.3,
  costBasisBase: 30.3,
  unitCost: 10.1,
  valuationUnitCost: 10.1,
  valuationCostBasis: 30.3,
  fxRateToBase: 1,
};

describe("AssetLotsTable", () => {
  it.each([
    { marketPrice: 10.1, costBasis: 30.3 },
    { marketPrice: 0.1, costBasis: 0.3 },
  ])("shows break-even lots as neutral zero at $marketPrice", ({ marketPrice, costBasis }) => {
    render(
      <AssetLotsTable
        lots={[{ ...usdLot, valuationCostBasis: costBasis }]}
        currency="USD"
        marketPrice={marketPrice}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand all/i }));

    // Overall total, account subtotal, desktop lot row and mobile lot row.
    const gains = screen.getAllByText("0.00");
    expect(gains).toHaveLength(4);
    gains.forEach((gain) => expect(gain.parentElement).toHaveClass("text-foreground"));
    expect(screen.getAllByText("0.00%")).toHaveLength(4);
  });

  it.each([
    { currency: "USD", costBasis: 30.296, expected: "+0.004" },
    { currency: "USD", costBasis: 30.304, expected: "-0.004" },
    { currency: "JPY", costBasis: 29.9, expected: "+0.4" },
    { currency: "JPY", costBasis: 30.7, expected: "-0.4" },
    { currency: "KWD", costBasis: 30.2996, expected: "+0.0004" },
    { currency: "KWD", costBasis: 30.3004, expected: "-0.0004" },
  ])(
    "keeps genuine $currency lot gains and losses visible ($expected)",
    ({ currency, costBasis, expected }) => {
      render(
        <AssetLotsTable
          lots={[{ ...usdLot, valuationCurrency: currency, valuationCostBasis: costBasis }]}
          currency={currency}
          marketPrice={10.1}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /expand all/i }));

      const gains = screen.getAllByText(expected);
      expect(gains).toHaveLength(4);
      gains.forEach((gain) =>
        expect(gain.parentElement).toHaveClass(
          expected.startsWith("+") ? "text-success" : "text-destructive",
        ),
      );
    },
  );

  it("keeps many break-even lots neutral in account and overall totals", () => {
    render(
      <AssetLotsTable
        lots={Array.from({ length: 100 }, (_, index) => ({
          ...usdLot,
          id: `lot-${index}`,
          accountId: `account-${index % 2}`,
        }))}
        currency="USD"
        marketPrice={10.1}
      />,
    );

    const gains = screen.getAllByText("0.00");
    expect(gains).toHaveLength(3);
    gains.forEach((gain) => expect(gain.parentElement).toHaveClass("text-foreground"));
  });

  it.each([false, true])(
    "normalizes cancelling gains within or across accounts (separate: %s)",
    (separateAccounts) => {
      render(
        <AssetLotsTable
          lots={[
            { ...usdLot, id: "gain-1", remainingQuantity: 1, valuationCostBasis: 0 },
            { ...usdLot, id: "gain-2", remainingQuantity: 2, valuationCostBasis: 0 },
            {
              ...usdLot,
              id: "loss",
              accountId: separateAccounts ? "other" : usdLot.accountId,
              valuationCostBasis: 0.6,
            },
          ]}
          currency="USD"
          marketPrice={0.1}
        />,
      );

      const gains = screen.getAllByText("0.00");
      expect(gains).toHaveLength(separateAccounts ? 1 : 2);
      gains.forEach((gain) => expect(gain.parentElement).toHaveClass("text-foreground"));
    },
  );

  it.each([
    { separateAccounts: false, costBasis: 0, expected: "+0.00000001" },
    { separateAccounts: true, costBasis: 0, expected: "+0.00000001" },
    { separateAccounts: false, costBasis: 0.00000002, expected: "-0.00000001" },
    { separateAccounts: true, costBasis: 0.00000002, expected: "-0.00000001" },
  ])(
    "preserves a $expected gain beside a large break-even lot (separate: $separateAccounts)",
    ({ separateAccounts, costBasis, expected }) => {
      render(
        <AssetLotsTable
          lots={[
            {
              ...usdLot,
              id: "large",
              remainingQuantity: 100_000_000_000,
              valuationCostBasis: 1_000_000_000_000,
            },
            {
              ...usdLot,
              id: "small",
              accountId: separateAccounts ? "other" : usdLot.accountId,
              remainingQuantity: 0.000000001,
              valuationCostBasis: costBasis,
            },
          ]}
          currency="USD"
          marketPrice={10}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /expand all/i }));

      // The small gain survives in its lot, account subtotal and overall total.
      expect(screen.getAllByText(expected)).toHaveLength(4);
    },
  );

  it("uses valuation-normalized lot values for GBp lots", () => {
    render(<AssetLotsTable lots={[ctyLot]} currency="GBP" marketPrice={5.65} />);

    expect(screen.getAllByText("£283.95").length).toBeGreaterThan(0);
    expect(screen.getAllByText("£288.15").length).toBeGreaterThan(0);
    expect(screen.queryByText("£28,395.02")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand all/i }));

    expect(screen.getAllByText("£5.57").length).toBeGreaterThan(0);
    expect(screen.queryByText("£556.77")).not.toBeInTheDocument();
  });

  it("excludes lots without valuation cost from both cost and market aggregates", () => {
    render(
      <AssetLotsTable
        lots={[{ ...ctyLot, id: "cty-lot-without-valuation-cost", valuationCostBasis: null }]}
        currency="GBP"
        marketPrice={5.65}
      />,
    );

    expect(screen.getAllByText("£0.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("£288.15")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand all/i }));

    expect(screen.getAllByText("£288.15").length).toBeGreaterThan(0);
  });

  it("shows disposed cost basis and realized gain for closed lots", () => {
    render(
      <AssetLotsTable
        lots={[
          {
            ...ctyLot,
            id: "closed-cty-lot",
            quantity: 0,
            remainingQuantity: 0,
            costBasis: 0,
            valuationCostBasis: 0,
            isClosed: true,
            closeDate: "2026-04-10",
            disposalCostBasis: 28395.015,
            disposalCostBasisBase: 283.95015,
            realizedPnl: 2604.985,
            realizedPnlBase: 26.04985,
            valuationDisposalCostBasis: 283.95015,
            valuationRealizedPnl: 26.04985,
          },
        ]}
        currency="GBP"
        marketPrice={5.65}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /expand all/i }));

    expect(screen.getByText("Gain/Loss")).toBeInTheDocument();
    expect(screen.getAllByText("£283.95").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+26.05").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+9.17%").length).toBeGreaterThan(0);
  });
});
