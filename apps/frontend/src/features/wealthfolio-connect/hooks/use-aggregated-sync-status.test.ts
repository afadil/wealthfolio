import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAggregatedSyncStatus } from "./use-aggregated-sync-status";

const context = vi.hoisted(() => ({
  isConnected: true,
  isEnabled: true,
  isInitializing: false,
  isLoadingUserInfo: false,
  isSessionUnavailable: false,
  error: null as string | null,
  userInfo: null as unknown,
}));
vi.mock("../providers/wealthfolio-connect-provider", () => ({
  useWealthfolioConnect: () => context,
}));
vi.mock("./use-sync-states", () => ({
  useSyncStates: () => ({ data: [], isLoading: false }),
}));
afterEach(() => {
  cleanup();
  context.isConnected = true;
  context.isEnabled = true;
  context.userInfo = null;
  context.isInitializing = false;
  context.isLoadingUserInfo = false;
  context.isSessionUnavailable = false;
  context.error = null;
});

describe("subscription navigation status", () => {
  it.each([null, "canceled", "unpaid", "paused", "unknown"])(
    "distinguishes signed-in status %s from signed out",
    (status) => {
      context.userInfo = { team: { subscription_status: status } };
      const { result } = renderHook(useAggregatedSyncStatus);
      expect(result.current.status).toBe("subscription_required");
    },
  );

  it("shows subscription required when the account has no team", () => {
    context.userInfo = { team: null };
    const { result } = renderHook(useAggregatedSyncStatus);
    expect(result.current.status).toBe("subscription_required");
  });

  it.each(["active", "trialing", "past_due"])("preserves active status %s", (status) => {
    context.userInfo = { team: { subscription_status: status, plan: "basic" } };
    const { result } = renderHook(useAggregatedSyncStatus);
    expect(result.current.status).toBe("idle");
  });

  it("does not infer an inactive subscription before user info is available", () => {
    const { result } = renderHook(useAggregatedSyncStatus);
    expect(result.current.status).toBe("restoring");
  });

  it("shows restoring while session restoration is pending", () => {
    context.isConnected = false;
    context.isInitializing = true;
    const { result } = renderHook(useAggregatedSyncStatus);
    expect(result.current.status).toBe("restoring");
  });

  it("shows unavailable for retained credentials after a transient restore failure", () => {
    context.isConnected = false;
    context.isSessionUnavailable = true;
    const { result } = renderHook(useAggregatedSyncStatus);
    expect(result.current.status).toBe("unavailable");
  });

  it("keeps user-info failure distinct from sign-out or subscription purchase", () => {
    context.error = "Account details unavailable";
    const { result } = renderHook(useAggregatedSyncStatus);
    expect(result.current.status).toBe("unavailable");
  });

  it.each(["isConnected", "isEnabled"] as const)(
    "keeps disconnected status when %s is false",
    (key) => {
      context[key] = false;
      context.userInfo = { team: { subscription_status: null } };
      const { result } = renderHook(useAggregatedSyncStatus);
      expect(result.current.status).toBe("not_connected");
    },
  );
});
