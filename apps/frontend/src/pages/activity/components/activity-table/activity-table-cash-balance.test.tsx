import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityType } from "@/lib/constants";
import type { ActivityDetails, CashBalanceScope } from "@/lib/types";
import { ActivityTable } from "./activity-table";
import { ActivityTableMobile } from "./activity-table-mobile";

vi.mock("@/pages/activity/hooks/use-activity-mutations", () => ({
  useActivityMutations: () => ({ duplicateActivityMutation: { mutateAsync: vi.fn() } }),
}));

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false }),
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: () => ({ settings: { baseCurrency: "USD" } }),
}));

// Avatars and the row menu's sheets load through the platform adapter, which
// jsdom lacks; neither is under test here.
vi.mock("@/components/ticker-avatar", () => ({ TickerAvatar: () => null }));
vi.mock("../activity-operations", () => ({ ActivityOperations: () => null }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => vi.fn(),
}));

// Lay out every row: jsdom has no sizes for the virtualizer to measure.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 60,
        size: 60,
        end: (index + 1) * 60,
        lane: 0,
      })),
    getTotalSize: () => count * 60,
    measureElement: () => undefined,
    options: { scrollMargin: 0 },
  }),
  observeElementOffset: vi.fn(),
}));

afterEach(cleanup);

function row(id: string, balance: string | null, scope: CashBalanceScope | null): ActivityDetails {
  return {
    id,
    activityType: ActivityType.DEPOSIT,
    date: new Date("2026-04-02T15:00:00Z"),
    quantity: null,
    unitPrice: null,
    amount: "100",
    fee: "0",
    currency: "USD",
    needsReview: false,
    createdAt: new Date("2026-04-02T15:00:00Z"),
    updatedAt: new Date("2026-04-02T15:00:00Z"),
    assetId: "",
    assetSymbol: "",
    accountId: "account-1",
    accountName: "Checking",
    accountCurrency: "USD",
    cashBalance: balance,
    cashBalanceCurrency: balance == null ? null : "USD",
    cashBalanceScope: scope,
  };
}

function renderTable(activities: ActivityDetails[]) {
  return render(
    <ActivityTable
      activities={activities}
      isLoading={false}
      sorting={[{ id: "date", desc: true }]}
      onSortingChange={vi.fn()}
      handleEdit={vi.fn()}
      handleDelete={vi.fn()}
    />,
  );
}

function renderCards(activities: ActivityDetails[], isCompactView: boolean) {
  return render(
    <ActivityTableMobile
      activities={activities}
      isCompactView={isCompactView}
      handleEdit={vi.fn()}
      handleDelete={vi.fn()}
      onDuplicate={vi.fn()}
    />,
  );
}

describe("activity lists' cash balances", () => {
  it("leaves end-of-day balances out of the table", () => {
    renderTable([row("dividend", "3501.35", "DAY"), row("buy", "3501.35", "DAY")]);

    expect(screen.queryByRole("columnheader", { name: /balance/i })).toBeNull();
    expect(screen.queryByText("$3,501.35")).toBeNull();
  });

  it("shows the balance after each row, scoped or not, and no end-of-day value beside them", () => {
    renderTable([
      row("rent", "954.90", "ROW"),
      row("older-client", "1000.00", null),
      row("day-end", "3501.35", "DAY"),
    ]);

    expect(screen.getByRole("columnheader", { name: /balance/i })).toBeInTheDocument();
    expect(screen.getByText("$954.90")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.queryByText("$3,501.35")).toBeNull();
  });

  it.each([true, false])("shows only after-row balances on cards (compact: %s)", (compact) => {
    renderCards([row("rent", "954.90", "ROW"), row("day-end", "3501.35", "DAY")], compact);

    expect(screen.getByText("$954.90")).toBeInTheDocument();
    expect(screen.queryByText("$3,501.35")).toBeNull();
  });
});
