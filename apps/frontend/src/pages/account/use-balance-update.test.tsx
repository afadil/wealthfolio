import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AccountValuation } from "@/lib/types";
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

function createValuation(accountCurrency: string, cashBalance: number): AccountValuation {
  return {
    id: "valuation-1",
    accountId: "account-1",
    valuationDate: "2026-06-01",
    accountCurrency,
    baseCurrency: accountCurrency,
    fxRateToBase: 1,
    cashBalance,
    investmentMarketValue: 0,
    totalValue: cashBalance,
    costBasis: 0,
    bookBasis: 0,
    netContribution: 0,
    cashBalanceBase: cashBalance,
    investmentMarketValueBase: 0,
    totalValueBase: cashBalance,
    costBasisBase: 0,
    bookBasisBase: 0,
    netContributionBase: 0,
    externalInflowBase: 0,
    externalOutflowBase: 0,
    externalFlowSource: "UNKNOWN",
    performanceEligibleValueBase: 0,
    valueStatus: "complete",
    basisStatus: "notApplicable",
    calculatedAt: "2026-06-01T00:00:00Z",
  };
}

function renderBalanceUpdate(accountCurrency: string, cashBalance: number) {
  return renderHook(() => useBalanceUpdate(createValuation(accountCurrency, cashBalance)), {
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
  ])(
    "records a %s balance change from %d to %d as a %s of %d",
    async (currency, currentBalance, newBalance, activityType, amount) => {
      const { result } = renderBalanceUpdate(currency, currentBalance);

      act(() => result.current.updateBalance(newBalance));

      await waitFor(() => expect(adapterMocks.createActivity).toHaveBeenCalledTimes(1));
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
      const { result } = renderBalanceUpdate(currency, currentBalance);

      act(() => result.current.updateBalance(newBalance));
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

      expect(adapterMocks.createActivity).not.toHaveBeenCalled();
    },
  );
});
