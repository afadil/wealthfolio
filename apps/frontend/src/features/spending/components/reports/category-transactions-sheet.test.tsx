import { render, screen } from "@testing-library/react";
import { FormattingProvider } from "@wealthfolio/ui";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaxonomyCategory } from "@/lib/types";

import type { DrilldownBucket } from "../../lib/category-drilldown";
import type { CashActivity } from "../../types/cash-activity";
import { CategoryTransactionsSheet } from "./category-transactions-sheet";

// The transaction list renders each note in a tooltip; irrelevant here, and
// it would need a TooltipProvider in the tree.
vi.mock("@/components/truncated-text", () => ({
  TruncatedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false }),
}));

vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: () => ({
    accounts: [{ id: "acct", name: "Checking", accountType: "CASH" }],
  }),
}));

const searchResult = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock("../../hooks/use-cash-activity-search", () => ({
  useCashActivitySearch: () => searchResult.current,
}));

const categories: TaxonomyCategory[] = [
  {
    id: "housing",
    taxonomyId: "spending_categories",
    parentId: null,
    name: "Housing",
    key: "housing",
    color: "#8B5E4B",
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "rent",
    taxonomyId: "spending_categories",
    parentId: "housing",
    name: "Rent",
    key: "rent",
    color: "#A97C68",
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

/** Every bucket the server reported for Housing over the period. */
const buckets: DrilldownBucket[] = [
  { taxonomyId: "spending_categories", categoryId: "rent", amount: 200_000 },
  { taxonomyId: "spending_categories", categoryId: "housing", amount: 36_000 },
];
const BUCKET_TOTAL = 236_000;

/** A page of the transaction list — deliberately far short of the real total. */
function page(count: number, amountEach: number): CashActivity[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `act_${i}`,
    accountId: "acct",
    activityType: "WITHDRAWAL",
    activityDate: "2026-03-04T12:00:00Z",
    amount: String(amountEach),
    currency: "USD",
    notes: `Payment ${i}`,
    cashFlowBucket: "spending",
    assignments: [],
    splits: [],
    netAmount: -amountEach,
  })) as unknown as CashActivity[];
}

function setSearchResult(items: CashActivity[]) {
  searchResult.current = {
    items,
    totalCount: 144,
    isLoading: false,
    isError: false,
    error: null,
    hasNextPage: items.length < 144,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  };
}

function sheet() {
  return (
    <MemoryRouter>
      <FormattingProvider locale="en-US" uiLocale="en" timezone="UTC">
        <CategoryTransactionsSheet
          open
          onOpenChange={() => {}}
          category={categories[0]}
          taxonomyCategories={categories}
          rangeStart={new Date("2026-01-01T00:00:00Z")}
          rangeEnd={new Date("2026-09-06T23:59:59.999Z")}
          buckets={buckets}
          isStatsLoading={false}
          currency="USD"
        />
      </FormattingProvider>
    </MemoryRouter>
  );
}

/** Reads the value rendered beside a stat label in the header. */
function statValue(label: string): string {
  const labelEl = screen.getByText(label);
  return labelEl.nextElementSibling?.textContent ?? "";
}

function amountOf(text: string): number {
  const parsed = Number(text.replace(/[^0-9.]/g, ""));
  return /K/i.test(text) ? parsed * 1_000 : parsed;
}

describe("CategoryTransactionsSheet", () => {
  beforeEach(() => {
    // One page loaded out of 144 rows — the state the drawer opens in.
    setSearchResult(page(50, 1_686));
  });

  it("reports the whole period, not just the transactions loaded so far", () => {
    render(sheet());

    // The loaded page sums to 84.3K; the category actually spent 236K.
    expect(amountOf(statValue("Spent"))).toBeCloseTo(BUCKET_TOTAL, -3);
    expect(statValue("Spent")).not.toMatch(/84/);
  });

  it("does not change when another page of transactions loads", () => {
    const { rerender } = render(sheet());
    const spentBefore = statValue("Spent");
    const paceBefore = statValue("Daily pace");

    setSearchResult(page(100, 1_686));
    rerender(sheet());

    expect(statValue("Spent")).toBe(spentBefore);
    expect(statValue("Daily pace")).toBe(paceBefore);
  });

  it("averages over every matching transaction, not the loaded page", () => {
    render(sheet());

    // 236K / 144 ≈ 1.64K. Dividing by the 50 loaded rows would give 4.7K.
    expect(amountOf(statValue("Avg / tx"))).toBeCloseTo(BUCKET_TOTAL / 144, -2);
  });

  it("builds the subcategory mix from the aggregate", () => {
    render(sheet());

    const rent = screen.getByText("Rent").closest("div")?.parentElement;
    expect(rent?.textContent).toMatch(/85%/);
  });
});
