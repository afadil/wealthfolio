import { describe, expect, it } from "vitest";
import { PORTFOLIO_SCOPE_ID } from "@/lib/constants";
import type { TrackedItem } from "@/lib/types";
import {
  ALL_PORTFOLIO_ITEM,
  migratePerformanceSelectedItemId,
  migratePerformanceSelectedItems,
  trackedItemForScope,
  prunePerformanceSelectedItems,
} from "./performance-selection";

describe("performance selection migration", () => {
  it("migrates the legacy TOTAL portfolio item to the scoped portfolio item", () => {
    const staleItems: TrackedItem[] = [
      {
        id: "TOTAL",
        type: "account",
        name: "All Portfolio",
      },
    ];

    expect(migratePerformanceSelectedItems(staleItems)).toEqual([ALL_PORTFOLIO_ITEM]);
    expect(migratePerformanceSelectedItemId("TOTAL")).toBe(PORTFOLIO_SCOPE_ID);
  });

  it("keeps stable references when no migration is needed", () => {
    const items: TrackedItem[] = [
      ALL_PORTFOLIO_ITEM,
      {
        id: "acc-1",
        type: "account",
        name: "Brokerage",
        accountScope: { type: "account", accountId: "acc-1" },
      },
    ];

    expect(migratePerformanceSelectedItems(items)).toBe(items);
    expect(migratePerformanceSelectedItemId(PORTFOLIO_SCOPE_ID)).toBe(PORTFOLIO_SCOPE_ID);
  });
});

describe("trackedItemForScope", () => {
  const accounts = [
    { id: "acc-1", name: "Brokerage" },
    { id: "acc-2", name: "TFSA" },
  ];
  const portfolios = [{ id: "p-1", name: "Retirement" }];

  it("maps the all scope onto the shared all-portfolio item", () => {
    expect(trackedItemForScope({ type: "all" }, accounts, portfolios)).toBe(ALL_PORTFOLIO_ITEM);
  });

  it("maps an account scope onto an item keyed by account id", () => {
    expect(
      trackedItemForScope({ type: "account", accountId: "acc-1" }, accounts, portfolios),
    ).toEqual({
      id: "acc-1",
      type: "account",
      name: "Brokerage",
      accountScope: { type: "account", accountId: "acc-1" },
    });
  });

  it("maps a portfolio scope onto an item keyed by portfolio id", () => {
    expect(
      trackedItemForScope({ type: "portfolio", portfolioId: "p-1" }, accounts, portfolios),
    ).toEqual({
      id: "p-1",
      type: "account",
      name: "Retirement",
      accountScope: { type: "portfolio", portfolioId: "p-1" },
    });
  });

  it("maps a multi-account scope onto one aggregated item with an order-insensitive id", () => {
    const forward = trackedItemForScope(
      { type: "accounts", accountIds: ["acc-1", "acc-2"] },
      accounts,
      portfolios,
    );
    const reversed = trackedItemForScope(
      { type: "accounts", accountIds: ["acc-2", "acc-1"] },
      accounts,
      portfolios,
    );

    expect(forward?.id).toBe("accounts:acc-1,acc-2");
    expect(reversed?.id).toBe(forward?.id);
    expect(forward?.name).toBe("Brokerage + TFSA");
  });

  it("returns null when the scope cannot be named", () => {
    expect(
      trackedItemForScope({ type: "account", accountId: "missing" }, accounts, portfolios),
    ).toBeNull();
    expect(
      trackedItemForScope({ type: "portfolio", portfolioId: "missing" }, accounts, portfolios),
    ).toBeNull();
    expect(
      trackedItemForScope(
        { type: "accounts", accountIds: ["acc-1", "missing"] },
        accounts,
        portfolios,
      ),
    ).toBeNull();
    expect(
      trackedItemForScope({ type: "accounts", accountIds: [] }, accounts, portfolios),
    ).toBeNull();
  });
});

describe("prunePerformanceSelectedItems", () => {
  const known = new Set(["a", "hidden", "archived"]);

  it("preserves valid scopes, symbols and intentionally empty comparisons", () => {
    const items = [
      ALL_PORTFOLIO_ITEM,
      { id: "a", type: "account" as const, name: "Legacy account" },
      { id: "symbol", type: "symbol" as const, name: "Benchmark" },
      trackedItemForScope(
        { type: "portfolio", portfolioId: "p" },
        [],
        [{ id: "p", name: "Portfolio" }],
      )!,
      trackedItemForScope(
        { type: "accounts", accountIds: ["hidden", "archived"] },
        [
          { id: "hidden", name: "Hidden" },
          { id: "archived", name: "Archived" },
        ],
        [],
      )!,
    ];
    expect(prunePerformanceSelectedItems(items, known)).toBe(items);
    const empty: typeof items = [];
    expect(prunePerformanceSelectedItems(empty, known)).toBe(empty);
  });

  it("drops the entire scope if any member was deleted and falls back when nothing remains", () => {
    const item = trackedItemForScope(
      { type: "accounts", accountIds: ["a", "deleted"] },
      [
        { id: "a", name: "A" },
        { id: "deleted", name: "Deleted" },
      ],
      [],
    )!;
    expect(prunePerformanceSelectedItems([item], known)).toEqual([ALL_PORTFOLIO_ITEM]);
    const benchmark = { id: "symbol", type: "symbol" as const, name: "Benchmark" };
    expect(prunePerformanceSelectedItems([item, benchmark], known)).toEqual([benchmark]);
  });
});
