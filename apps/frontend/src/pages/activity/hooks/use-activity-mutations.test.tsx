import { ActivityType } from "@/lib/constants";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityMutations } from "./use-activity-mutations";

const adapterMocks = vi.hoisted(() => ({
  createActivity: vi.fn(),
  deleteActivity: vi.fn(),
  logger: {
    error: vi.fn(),
  },
  saveActivities: vi.fn(),
  updateActivity: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock("@/adapters", () => adapterMocks);
vi.mock("sonner", () => ({
  toast: toastMocks,
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

describe("useActivityMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    adapterMocks.createActivity.mockResolvedValue({ id: "created-buy", accountId: "acc-1" });
    adapterMocks.saveActivities.mockResolvedValue({
      created: [
        {
          id: "created-deposit",
          accountId: "acc-1",
          activityType: ActivityType.DEPOSIT,
        },
        {
          id: "created-buy",
          accountId: "acc-1",
          activityType: ActivityType.BUY,
        },
      ],
      updated: [],
      deleted: [],
      createdMappings: [],
      errors: [],
    });
  });

  it("bulk-creates deposit and buy when includeCashDeposit is enabled", async () => {
    const { result } = renderHook(() => useActivityMutations(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.addActivityMutation.mutateAsync({
        accountId: "acc-1",
        activityType: ActivityType.BUY,
        activityDate: "2026-03-19T00:00:00.000Z",
        assetId: "AAPL260417C00150000",
        quantity: 2,
        unitPrice: 3,
        fee: 1,
        currency: "USD",
        symbolInstrumentType: "OPTION",
        contractMultiplier: 100,
        includeCashDeposit: true,
      } as never);
    });

    expect(adapterMocks.createActivity).not.toHaveBeenCalled();
    expect(adapterMocks.saveActivities).toHaveBeenCalledTimes(1);
    expect(adapterMocks.saveActivities).toHaveBeenCalledWith({
      creates: [
        expect.objectContaining({
          accountId: "acc-1",
          activityType: ActivityType.DEPOSIT,
          activityDate: "2026-03-19T00:00:00.000Z",
          amount: "601",
          currency: "USD",
          comment: "Cash deposit for AAPL260417C00150000 purchase",
        }),
        expect.objectContaining({
          accountId: "acc-1",
          activityType: ActivityType.BUY,
          quantity: "2",
          unitPrice: "3",
          fee: "1",
        }),
      ],
    });
  });
});
