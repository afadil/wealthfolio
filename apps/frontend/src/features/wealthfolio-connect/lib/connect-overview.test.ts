import { describe, expect, it } from "vitest";
import type { BrokerSyncState, ImportRun } from "../types";
import { getLastBrokerSyncAt } from "./connect-overview";

const syncState = (accountId: string, syncStatus: BrokerSyncState["syncStatus"], at?: string) =>
  ({
    accountId,
    provider: "SNAPTRADE",
    syncStatus,
    lastAttemptedAt: at ?? null,
  }) as BrokerSyncState;

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
