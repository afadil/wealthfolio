import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@/test/render";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBalanceUpdate } from "./use-balance-update";

const adapterMocks = vi.hoisted(() => ({
  createActivity: vi.fn(),
}));

vi.mock("@/adapters", () => adapterMocks);
vi.mock("@wealthfolio/ui/components/ui/use-toast", () => ({ toast: vi.fn() }));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function renderBalanceUpdate(accountId = "account-1") {
  return renderHook(() => useBalanceUpdate(accountId), {
    wrapper: createWrapper(),
  });
}

describe("useBalanceUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapterMocks.createActivity.mockResolvedValue({ id: "activity-1" });
  });

  it.each([
    ["KWD", 10, 10.235, "DEPOSIT", 0.235],
    ["KWD", 10, 10.005, "DEPOSIT", 0.005],
    ["KWD", 10, 10.001, "DEPOSIT", 0.001],
    ["KWD", 5.125, 5.12, "WITHDRAWAL", 0.005],
    ["BHD", 0, 1.999, "DEPOSIT", 1.999],
    ["USD", 10, 10.23, "DEPOSIT", 0.23],
    ["USD", 0.1, 0.3, "DEPOSIT", 0.2],
    ["JPY", 1000, 1500, "DEPOSIT", 500],
    ["JPY", 1000, 1000.4, "DEPOSIT", 0.4],
    ["USD", 10.00000001, 10, "WITHDRAWAL", 0.00000001],
    ["USD", 0, 100_000_000.12345679, "DEPOSIT", 100_000_000.12345679],
    ["USD", 100, 0, "WITHDRAWAL", 100],
    ["USD", -5, 0, "DEPOSIT", 5],
  ])(
    "records a %s balance change from %d to %d as a %s of %d",
    async (currency, currentBalance, newBalance, activityType, amount) => {
      const { result } = renderBalanceUpdate();

      await act(() =>
        result.current.updateBalance({ currency, currentBalance, targetBalance: newBalance }),
      );

      expect(adapterMocks.createActivity).toHaveBeenCalledTimes(1);
      expect(adapterMocks.createActivity.mock.calls[0][0]).toMatchObject({
        accountId: "account-1",
        activityType,
        currency,
        amount,
      });
    },
  );

  it.each([
    ["USD", 10.000000004, 10],
    ["KWD", 10, 10],
  ])(
    "records nothing when a %s change from %d to %d rounds to zero",
    async (currency, currentBalance, newBalance) => {
      const { result } = renderBalanceUpdate();

      await act(() =>
        result.current.updateBalance({ currency, currentBalance, targetBalance: newBalance }),
      );

      expect(adapterMocks.createActivity).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["", "USD", 100, 110],
    ["account-1", " ", 100, 110],
    ["account-1", "USD", NaN, 110],
    ["account-1", "USD", Infinity, 110],
    ["account-1", "USD", 100, NaN],
    ["account-1", "USD", 100, Infinity],
    ["account-1", "USD", 100, -1],
    ["account-1", "USD", -Number.MAX_VALUE, Number.MAX_VALUE],
  ])(
    "rejects invalid input (%s, %s, %d, %d) before persistence",
    async (accountId, currency, currentBalance, targetBalance) => {
      const { result } = renderBalanceUpdate(accountId);

      await act(async () => {
        await expect(
          result.current.updateBalance({ currency, currentBalance, targetBalance }),
        ).rejects.toThrow();
      });

      expect(adapterMocks.createActivity).not.toHaveBeenCalled();
    },
  );

  it("propagates a create failure without automatically retrying", async () => {
    const error = new Error("Create failed");
    adapterMocks.createActivity.mockRejectedValue(error);
    const { result } = renderBalanceUpdate();

    await act(async () => {
      await expect(
        result.current.updateBalance({ currency: "USD", currentBalance: 100, targetBalance: 110 }),
      ).rejects.toBe(error);
    });

    expect(adapterMocks.createActivity).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
