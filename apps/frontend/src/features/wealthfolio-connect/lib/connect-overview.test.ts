import type { Account } from "@/lib/types";
import { describe, expect, it } from "vitest";
import type { BrokerAccount, BrokerConnection, BrokerSyncState, ImportRun } from "../types";
import { buildAttentionItems, buildBrokerageRows, getLastBrokerSyncAt } from "./connect-overview";

const connection = (id: string, name: string, extra: Partial<BrokerConnection> = {}) =>
  ({ id, status: "connected", disabled: false, brokerage: { name }, ...extra }) as BrokerConnection;

const brokerAccount = (id: string, connectionId: string, syncEnabled = true) =>
  ({
    id,
    name: id,
    brokerage_authorization: connectionId,
    sync_enabled: syncEnabled,
    is_paper: false,
    shared_with_household: false,
  }) as BrokerAccount;

const localAccount = (id: string, providerAccountId: string, trackingMode = "TRANSACTIONS") =>
  ({ id, name: `Local ${id}`, providerAccountId, trackingMode }) as Account;

// `at` is when the state was last written; the attempt it records started then too.
const syncState = (accountId: string, syncStatus: BrokerSyncState["syncStatus"], at?: string) =>
  ({
    accountId,
    provider: "SNAPTRADE",
    syncStatus,
    lastAttemptedAt: at ?? null,
    updatedAt: at,
    lastRunId: null,
  }) as unknown as BrokerSyncState;

const run = (
  accountId: string,
  warnings: number,
  startedAt = "2026-10-13T10:00:00Z",
  status: ImportRun["status"] = "APPLIED",
) =>
  ({
    id: `${accountId}-${startedAt}`,
    accountId,
    status,
    startedAt,
    finishedAt: null,
    summary: { warnings },
  }) as ImportRun;

describe("buildBrokerageRows", () => {
  it("sorts brokerages by urgency, then name, and mutes ones with nothing syncing", () => {
    const rows = buildBrokerageRows(
      [
        connection("ok", "Alpha"),
        connection("excluded", "Aardvark"),
        connection("broken", "Zeta", { status: "disconnected" }),
        connection("review", "Mid"),
      ],
      [
        brokerAccount("a1", "ok"),
        brokerAccount("a2", "excluded", false),
        brokerAccount("a3", "broken"),
        brokerAccount("a4", "review"),
      ],
      [localAccount("l1", "a1"), localAccount("l3", "a3"), localAccount("l4", "a4")],
      [syncState("l4", "NEEDS_REVIEW")],
      "Unknown",
    );

    expect(rows.map((r) => [r.name, r.state])).toEqual([
      ["Zeta", "reconnect"],
      ["Mid", "needsReview"],
      ["Alpha", "ok"],
      ["Aardvark", "inactive"],
    ]);
  });

  it("does not count accounts awaiting setup as syncing", () => {
    const [row] = buildBrokerageRows(
      [connection("c", "Questrade")],
      [brokerAccount("a1", "c"), brokerAccount("a2", "c")],
      [localAccount("l1", "a1"), localAccount("l2", "a2", "NOT_SET")],
      [],
      "Unknown",
    );

    expect(row.state).toBe("needsSetup");
    expect(row.accounts.map((a) => a.state)).toEqual(["syncing", "needsSetup"]);
  });
});

describe("buildAttentionItems", () => {
  it("folds a broken connection's account failures into one reconnect item", () => {
    const connections = [connection("c", "Wealthsimple", { disabled: true })];
    const accounts = [localAccount("l1", "a1"), localAccount("l2", "a2")];
    const states = [syncState("l1", "FAILED"), syncState("l2", "FAILED")];
    const rows = buildBrokerageRows(
      connections,
      [brokerAccount("a1", "c"), brokerAccount("a2", "c")],
      accounts,
      states,
      "Unknown",
    );

    expect(buildAttentionItems(rows, states, accounts, [])).toEqual([
      { kind: "reconnect", key: "connection:c", name: "Wealthsimple", accountCount: 2 },
    ]);
  });

  it("names the brokerage, not the provider, and counts reviewable warnings", () => {
    const accounts = [localAccount("l1", "a1"), localAccount("l2", "a2")];
    const states = [
      syncState("l1", "FAILED"),
      { ...syncState("l2", "NEEDS_REVIEW"), lastRunId: "l2-2026-10-13T10:00:00Z" },
    ];
    const rows = buildBrokerageRows(
      [connection("c", "Schwab")],
      [brokerAccount("a1", "c"), brokerAccount("a2", "c")],
      accounts,
      states,
      "Unknown",
    );
    // The state's run has the warnings; a newer holdings run has none.
    const runs = [run("l2", 0, "2026-10-13T10:05:00Z"), run("l2", 3)];

    expect(buildAttentionItems(rows, states, accounts, runs)).toEqual([
      {
        kind: "failed",
        key: "account:l1",
        accountId: "l1",
        name: "Local l1",
        brokerage: "Schwab",
        issueMessage: null,
      },
      {
        kind: "needsReview",
        key: "account:l2",
        accountId: "l2",
        name: "Local l2",
        brokerage: "Schwab",
        issueMessage: null,
        reviewCount: 3,
      },
    ]);
  });

  it("doesn't explain a review with warnings from a run the state doesn't point to", () => {
    const accounts = [localAccount("l1", "a1")];
    // Deferred activity sync: NEEDS_REVIEW with no run of its own.
    const states = [
      { ...syncState("l1", "NEEDS_REVIEW"), lastError: "Holdings sync deferred: provider busy" },
    ];
    const rows = buildBrokerageRows(
      [connection("c", "Schwab")],
      [brokerAccount("a1", "c")],
      accounts,
      states,
      "Unknown",
    );
    const olderRunWithWarnings = run("l1", 4, "2026-10-01T10:00:00Z");

    expect(buildAttentionItems(rows, states, accounts, [olderRunWithWarnings])).toEqual([
      expect.objectContaining({ kind: "needsReview", reviewCount: 0 }),
    ]);
  });

  it("keeps issues for accounts whose connection is no longer listed", () => {
    const accounts = [localAccount("l1", "gone")];
    const states = [syncState("l1", "FAILED")];

    expect(buildAttentionItems([], states, accounts, [])).toEqual([
      {
        kind: "failed",
        key: "account:l1",
        accountId: "l1",
        name: "Local l1",
        brokerage: undefined,
        issueMessage: null,
      },
    ]);
  });

  it("explains known partial failures with their specific message", () => {
    const accounts = [localAccount("l1", "a1")];
    const states = [
      {
        ...syncState("l1", "NEEDS_REVIEW"),
        lastError: "Holdings synced, but activity sync failed: timeout",
      },
    ];
    const rows = buildBrokerageRows(
      [connection("c", "Kraken")],
      [brokerAccount("a1", "c")],
      accounts,
      states,
      "Unknown",
    );

    const [item] = buildAttentionItems(rows, states, accounts, []);
    expect(item).toMatchObject({ kind: "needsReview", issueMessage: expect.any(String) });
    expect(item.kind === "needsReview" && item.issueMessage).toMatch(/^Holdings synced/);
  });

  it("groups accounts awaiting setup into one item", () => {
    const accounts = [
      localAccount("l1", "a1", "NOT_SET"),
      localAccount("l2", "a2", "NOT_SET"),
      { id: "manual", name: "Manual", trackingMode: "NOT_SET" } as Account,
    ];

    expect(buildAttentionItems([], [], accounts, [])).toEqual([
      { kind: "setup", key: "setup", accounts: [accounts[0], accounts[1]] },
    ]);
  });
});

describe("getLastBrokerSyncAt", () => {
  it("uses sync attempts and runs, not the provider data date", () => {
    const states = [
      {
        ...syncState("l1", "IDLE", "2026-10-13T09:00:00Z"),
        lastSuccessfulAt: "2026-10-10T00:00:00Z",
      },
    ];
    const runs = [{ ...run("l1", 0, "2026-10-13T10:00:00Z"), finishedAt: "2026-10-13T10:01:00Z" }];

    expect(getLastBrokerSyncAt(states, runs)?.toISOString()).toBe("2026-10-13T10:01:00.000Z");
    expect(getLastBrokerSyncAt([], [])).toBeNull();
  });

  it("uses when a completed sync finished, not when it started", () => {
    const states = [
      {
        ...syncState("l1", "IDLE", "2026-10-13T09:20:00Z"),
        lastAttemptedAt: "2026-10-13T09:00:00Z",
      },
    ];

    expect(getLastBrokerSyncAt(states, [])?.toISOString()).toBe("2026-10-13T09:20:00.000Z");
  });

  it("ignores attempts and runs that failed or are still running", () => {
    const states = [
      syncState("l1", "FAILED", "2026-10-13T12:00:00Z"),
      syncState("l2", "RUNNING", "2026-10-13T12:00:00Z"),
      syncState("l3", "NEEDS_REVIEW", "2026-10-13T08:00:00Z"),
    ];
    const runs = [
      { ...run("l1", 0, "2026-10-13T12:00:00Z", "FAILED"), finishedAt: "2026-10-13T12:00:05Z" },
      run("l2", 0, "2026-10-13T12:00:00Z", "RUNNING"),
    ];

    expect(getLastBrokerSyncAt(states, runs)?.toISOString()).toBe("2026-10-13T08:00:00.000Z");
    // A sync in which every account failed has no completed time to show.
    expect(getLastBrokerSyncAt(states.slice(0, 2), runs)).toBeNull();
  });
});
