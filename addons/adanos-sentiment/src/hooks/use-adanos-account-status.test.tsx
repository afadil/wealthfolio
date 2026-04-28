// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdanosAccountStatus } from "../types";
import { useAdanosAccountStatus } from "./use-adanos-account-status";

const mocks = vi.hoisted(() => ({
  fetchAccountStatus: vi.fn(),
  clearStoredAccountStatus: vi.fn(),
  loadStoredAccountStatus: vi.fn(),
  saveStoredAccountStatus: vi.fn(),
}));

vi.mock("../lib/adanos-client", () => ({
  fetchAccountStatus: mocks.fetchAccountStatus,
}));

vi.mock("../lib/account-status-storage", () => ({
  clearStoredAccountStatus: mocks.clearStoredAccountStatus,
  loadStoredAccountStatus: mocks.loadStoredAccountStatus,
  saveStoredAccountStatus: mocks.saveStoredAccountStatus,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useAdanosAccountStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storedStatuses = new Map<string, AdanosAccountStatus>();

    mocks.loadStoredAccountStatus.mockImplementation((apiKey: string | null) => {
      if (!apiKey) {
        return null;
      }

      return storedStatuses.get(apiKey) ?? null;
    });

    mocks.saveStoredAccountStatus.mockImplementation((apiKey: string, status: AdanosAccountStatus) => {
      storedStatuses.set(apiKey, status);
    });

    mocks.clearStoredAccountStatus.mockImplementation(() => {
      storedStatuses.clear();
    });
  });

  it("updates the visible status when the API key changes and a refresh uses the new key", async () => {
    const oldKey = "sk_live_oldprofessional000001";
    const newKey = "sk_live_newfree000000000002";

    const professionalStatus: AdanosAccountStatus = {
      status: "active",
      accountType: "professional",
      monthlyLimit: null,
      monthlyUsed: 39875,
      monthlyRemaining: null,
      hasUnlimitedRequests: true,
      pricingUrl: "https://adanos.org/pricing",
      apiKeyPersistsAfterUpgrade: true,
      checkedAt: "2026-03-16T21:00:00.000Z",
    };

    const freeStatus: AdanosAccountStatus = {
      status: "active",
      accountType: "free",
      monthlyLimit: 250,
      monthlyUsed: 5,
      monthlyRemaining: 245,
      hasUnlimitedRequests: false,
      pricingUrl: "https://adanos.org/pricing",
      apiKeyPersistsAfterUpgrade: true,
      checkedAt: "2026-03-16T21:01:00.000Z",
    };

    mocks.loadStoredAccountStatus.mockImplementation((apiKey: string | null) => {
      if (apiKey === oldKey) {
        return professionalStatus;
      }

      return null;
    });

    mocks.fetchAccountStatus.mockResolvedValue(freeStatus);

    const { result, rerender } = renderHook(
      ({ apiKey }: { apiKey: string | null }) => useAdanosAccountStatus(apiKey),
      {
        initialProps: { apiKey: oldKey },
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.accountStatus).toEqual(professionalStatus);
    });

    await act(async () => {
      const refreshPromise = result.current.refreshAccountStatus(newKey);
      rerender({ apiKey: newKey });
      await refreshPromise;
    });

    await waitFor(() => {
      expect(result.current.accountStatus).toEqual(freeStatus);
    });

    expect(mocks.fetchAccountStatus).toHaveBeenCalledWith(newKey);
    expect(mocks.saveStoredAccountStatus).toHaveBeenCalledWith(newKey, freeStatus);
  });
});
