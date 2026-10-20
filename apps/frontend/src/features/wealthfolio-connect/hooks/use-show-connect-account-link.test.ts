import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useShowConnectAccountLink } from "./use-show-connect-account-link";

const mocks = vi.hoisted(() => ({
  isTauri: false,
  platform: { isMobile: false, loading: false },
  connect: {} as Record<string, unknown>,
}));

vi.mock("@/adapters", () => ({
  get isTauri() {
    return mocks.isTauri;
  },
}));

vi.mock("@/hooks/use-platform", () => ({
  usePlatform: () => mocks.platform,
}));

vi.mock("../providers/wealthfolio-connect-provider", () => ({
  useWealthfolioConnect: () => mocks.connect,
}));

const signedOut = {
  isEnabled: true,
  isConnected: false,
  isInitializing: false,
  isLoadingUserInfo: false,
  isSessionUnavailable: false,
  userInfo: null,
  error: null,
};

function teamWithStatus(subscription_status: string) {
  return { team: { plan: "basic", subscription_status } };
}

describe("useShowConnectAccountLink", () => {
  beforeEach(() => {
    mocks.isTauri = false;
    mocks.platform = { isMobile: false, loading: false };
    mocks.connect = { ...signedOut };
  });

  const show = () => renderHook(() => useShowConnectAccountLink()).result.current;

  it("shows to a signed-out user on desktop or web", () => {
    expect(show()).toBe(true);

    mocks.isTauri = true;
    expect(show()).toBe(true);
  });

  it("stays hidden in the phone apps", () => {
    mocks.isTauri = true;
    mocks.platform = { isMobile: true, loading: false };

    expect(show()).toBe(false);
  });

  it("shows in a phone browser on the web build", () => {
    mocks.platform = { isMobile: true, loading: false };

    expect(show()).toBe(true);
  });

  it("waits for the platform to resolve", () => {
    mocks.platform = { isMobile: false, loading: true };

    expect(show()).toBe(false);
  });

  it("stays hidden for an active subscription and shows after it lapses", () => {
    mocks.connect = { ...signedOut, isConnected: true, userInfo: teamWithStatus("active") };
    expect(show()).toBe(false);

    mocks.connect = { ...signedOut, isConnected: true, userInfo: teamWithStatus("canceled") };
    expect(show()).toBe(true);
  });

  it.each([
    ["Connect is starting", { isInitializing: true }],
    ["user info is loading", { isConnected: true, isLoadingUserInfo: true }],
    ["the session is unavailable", { isSessionUnavailable: true }],
    ["Connect reported an error", { error: "failed" }],
  ])("stays hidden while %s", (_, state) => {
    mocks.connect = { ...signedOut, ...state };

    expect(show()).toBe(false);
  });
});
