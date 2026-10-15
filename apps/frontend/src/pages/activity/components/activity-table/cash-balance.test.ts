import { describe, expect, it } from "vitest";

import type { ActivityDetails, CashBalanceScope } from "@/lib/types";
import { shownCashBalanceIds } from "./cash-balance";

function row(
  id: string,
  date: string,
  scope: CashBalanceScope | null,
  accountId = "brokerage",
  createdAt = "2026-04-01T00:00:00Z",
): ActivityDetails {
  return {
    id,
    accountId,
    date: date as unknown as Date,
    createdAt: createdAt as unknown as Date,
    cashBalance: scope ? "750" : null,
    cashBalanceCurrency: scope ? "USD" : null,
    cashBalanceScope: scope,
  } as ActivityDetails;
}

describe("shownCashBalanceIds", () => {
  it("breaks a shared timestamp by creation time, then id, in either order", () => {
    // Date-only imports share a timestamp: the engine applies them by
    // created_at, then id, and the day's balance belongs on the last one.
    const day = "2026-04-02T00:00:00Z";
    const byCreation = [
      row("saved-first", day, "DAY", "brokerage", "2026-04-05T09:00:00Z"),
      row("saved-last", day, "DAY", "brokerage", "2026-04-05T10:00:00Z"),
    ];
    const byId = [row("a-row", day, "DAY"), row("b-row", day, "DAY")];

    // Within one millisecond the stored microseconds still order the rows,
    // ahead of creation time.
    const byMicros = [
      row("later-micro", "2026-04-02T10:00:00.000002Z", "DAY", "brokerage", "2026-04-05T09:00:00Z"),
      row(
        "earlier-micro",
        "2026-04-02T10:00:00.000001Z",
        "DAY",
        "brokerage",
        "2026-04-05T10:00:00Z",
      ),
    ].reverse();

    for (const rows of [byCreation, byId, byMicros]) {
      const last = rows[1].id;
      expect(shownCashBalanceIds(rows)).toEqual(new Set([last]));
      expect(shownCashBalanceIds([...rows].reverse())).toEqual(new Set([last]));
    }
  });

  it("shows every row balance", () => {
    const shown = shownCashBalanceIds([
      row("rent", "2026-04-02T10:00:00Z", "ROW"),
      row("coffee", "2026-04-02T09:00:00Z", "ROW"),
    ]);

    expect([...shown]).toEqual(["rent", "coffee"]);
  });

  it("shows a day-end balance once, on the day's latest row, in either order", () => {
    const newestFirst = [
      row("dividend", "2026-04-02T15:00:00Z", "DAY"),
      row("buy", "2026-04-02T10:00:00Z", "DAY"),
      row("deposit", "2026-04-01T10:00:00Z", "DAY"),
    ];

    expect(shownCashBalanceIds(newestFirst)).toEqual(new Set(["dividend", "deposit"]));
    expect(shownCashBalanceIds([...newestFirst].reverse())).toEqual(
      new Set(["dividend", "deposit"]),
    );
  });

  it("groups rows by their day in the configured timezone", () => {
    // 02:00 UTC on April 2 is still April 1 in Toronto.
    const rows = [
      row("late", "2026-04-02T02:00:00Z", "DAY"),
      row("morning", "2026-04-01T14:00:00Z", "DAY"),
    ];

    expect(shownCashBalanceIds(rows, "America/Toronto")).toEqual(new Set(["late"]));
    expect(shownCashBalanceIds(rows)).toEqual(new Set(["late", "morning"]));
  });

  it("keeps each account's days apart and skips rows without a balance", () => {
    const shown = shownCashBalanceIds([
      row("brokerage-buy", "2026-04-02T10:00:00Z", "DAY", "brokerage"),
      row("ira-buy", "2026-04-02T09:00:00Z", "DAY", "ira"),
      row("draft", "2026-04-02T16:00:00Z", null),
    ]);

    expect(shown).toEqual(new Set(["brokerage-buy", "ira-buy"]));
  });
});
