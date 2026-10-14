import { render, screen } from "@testing-library/react";
import { FormattingProvider } from "@wealthfolio/ui";
import { describe, expect, it, vi } from "vitest";
import type { TransactionRowVM } from "../lib/transactions-helpers";
import { SplitTransactionSheet } from "./split-transaction-sheet";

vi.mock("@/hooks/use-platform", () => ({ useIsMobileViewport: () => false }));
vi.mock("./quick-categorize-popover", () => ({ QuickCategorizePopover: () => null }));

function splitRow(amount: string, currency: string, splitAmounts: string[]) {
  return {
    activity: {
      id: "activity-1",
      amount,
      currency,
      notes: "Groceries",
      cashFlowBucket: "spending",
      splits: splitAmounts.map((splitAmount, index) => ({
        id: `split-${index}`,
        taxonomyId: "spending_categories",
        categoryId: "food",
        amount: splitAmount,
        note: null,
        sortOrder: index,
      })),
    },
    category: null,
    splitCount: splitAmounts.length,
    needsReview: false,
  } as unknown as TransactionRowVM;
}

function renderSheet(row: TransactionRowVM) {
  render(
    <FormattingProvider locale="DE">
      <SplitTransactionSheet
        open
        row={row}
        categories={new Map()}
        isSaving={false}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        onClear={vi.fn()}
      />
    </FormattingProvider>,
  );
}

describe("SplitTransactionSheet", () => {
  it("formats the total and remaining amounts for the formatting region", () => {
    renderSheet(splitRow("1234.5", "EUR", ["1000"]));

    expect(screen.getByText(/1\.234,50\s€/)).toBeInTheDocument();
    expect(screen.getByText(/^234,50\sEUR$/)).toBeInTheDocument();
  });

  it("shows the cents left to assign for currencies without minor units", () => {
    renderSheet(splitRow("1000", "JPY", ["333.34", "333.33", "333"]));

    expect(screen.getByText(/^0,33\sJPY$/)).toBeInTheDocument();
  });
});
