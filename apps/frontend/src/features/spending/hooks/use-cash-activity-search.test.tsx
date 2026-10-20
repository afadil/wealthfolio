import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCashActivitySearch } from "./use-cash-activity-search";

const adapterMocks = vi.hoisted(() => ({
  searchCashActivities: vi.fn(),
}));

vi.mock("../adapters/cash-activities", () => adapterMocks);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useCashActivitySearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes a next-page error without discarding the first page", async () => {
    adapterMocks.searchCashActivities
      .mockResolvedValueOnce({ items: [], totalCount: 100 })
      .mockRejectedValueOnce(new Error("page 2 failed"));

    const { result } = renderHook(() => useCashActivitySearch({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true));
    expect(result.current.totalCount).toBe(100);
    expect(result.current.hasNextPage).toBe(true);
  });

  it("asks for cash balances and keeps them on the rows", async () => {
    adapterMocks.searchCashActivities.mockResolvedValueOnce({
      items: [{ id: "coffee", cashBalance: "50", cashBalanceCurrency: "USD" }],
      totalCount: 1,
    });

    const { result } = renderHook(() => useCashActivitySearch({ includeCashBalances: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(adapterMocks.searchCashActivities).toHaveBeenCalledWith(
      expect.objectContaining({ includeCashBalances: true }),
    );
    expect(result.current.items[0]?.cashBalance).toBe("50");
  });
});
