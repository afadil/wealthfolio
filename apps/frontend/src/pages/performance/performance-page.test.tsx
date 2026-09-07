import { useAccountScopeStore } from "@/lib/account-scope-store";
import { QueryKeys } from "@/lib/query-keys";
import type { Account, AccountScope, TrackedItem } from "@/lib/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PerformancePage from "./performance-page";
import { ALL_PORTFOLIO_ITEM } from "./performance-selection";

const mocks = vi.hoisted(() => ({ performance: vi.fn(), getAccounts: vi.fn() }));
vi.mock("@/adapters", () => ({ getAccounts: mocks.getAccounts }));
vi.mock("@/hooks/use-portfolios", () => ({ usePortfolios: () => ({ data: [] }) }));
vi.mock("@/hooks/use-platform", () => ({ useIsMobileViewport: () => false }));
vi.mock("./hooks/use-performance-data", () => ({
  useCalculatePerformanceHistory: mocks.performance,
}));
vi.mock("@/components/account-filter-selector", () => ({ AccountScopeSelector: () => null }));
vi.mock("@/components/account-selector", () => ({ AccountSelector: () => null }));
vi.mock("@/components/account-selector-mobile", () => ({ AccountSelectorMobile: () => null }));
vi.mock("@/components/benchmark-symbol-selector", () => ({ BenchmarkSymbolSelector: () => null }));
vi.mock("@/components/benchmark-symbol-selector-mobile", () => ({
  BenchmarkSymbolSelectorMobile: () => null,
}));
vi.mock("@wealthfolio/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wealthfolio/ui")>();
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    ...actual,
    Carousel: Container,
    CarouselContent: Container,
    CarouselItem: Container,
    DateRangeSelector: () => null,
  };
});

const accounts = [
  { id: "a", name: "Brokerage", accountType: "SECURITIES", isActive: true },
  { id: "b", name: "Hidden TFSA", accountType: "SECURITIES", isActive: false },
  { id: "card", name: "Credit Card", accountType: "CREDIT_CARD", isActive: true },
].map((account) => ({ ...account, isArchived: false, currency: "USD" })) as Account[];
const initialState = useAccountScopeStore.getState();

function setScope(scope: AccountScope) {
  act(() => useAccountScopeStore.getState().setScope(scope));
}

function savedItems(): TrackedItem[] {
  return JSON.parse(localStorage.getItem("performance:selectedItems") ?? "[]");
}

function renderPage(seedAccounts = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (seedAccounts) {
    client.setQueryData([QueryKeys.ACCOUNTS, false], accounts);
    client.setQueryData([QueryKeys.ACCOUNTS, true], accounts);
  }
  return {
    client,
    ...render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <PerformancePage />
        </QueryClientProvider>
      </StrictMode>,
    ),
  };
}

describe("PerformancePage shared scope", () => {
  beforeEach(() => {
    localStorage.clear();
    useAccountScopeStore.setState(initialState, true);
    mocks.performance.mockReturnValue({
      data: [],
      isLoading: false,
      hasErrors: false,
      errorMessages: [],
    });
    mocks.getAccounts.mockResolvedValue(accounts);
  });

  it("retains and requests a hidden account selected elsewhere", async () => {
    setScope({ type: "account", accountId: "b" });
    renderPage();
    await waitFor(() =>
      expect(savedItems().map((item) => item.id)).toEqual([ALL_PORTFOLIO_ITEM.id, "b"]),
    );
    expect(mocks.performance).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedItems: savedItems() }),
    );
    expect(JSON.parse(localStorage.getItem("performance:selectedItemId")!)).toBe("b");
  });

  it("requests mixed scopes and credit-card-only scopes instead of leaving the old focus", async () => {
    renderPage();
    setScope({ type: "account", accountId: "a" });
    setScope({ type: "accounts", accountIds: ["a", "card"] });
    await waitFor(() =>
      expect(savedItems().at(-1)?.accountScope).toEqual({
        type: "accounts",
        accountIds: ["a", "card"],
      }),
    );
    expect(JSON.parse(localStorage.getItem("performance:selectedItemId")!)).toBe("accounts:a,card");
    setScope({ type: "account", accountId: "card" });
    await waitFor(() =>
      expect(savedItems().map((item) => item.id)).toEqual([ALL_PORTFOLIO_ITEM.id, "card"]),
    );
    expect(JSON.parse(localStorage.getItem("performance:selectedItemId")!)).toBe("card");
  });

  it("preserves saved comparisons when the account inventory fails to load", async () => {
    const selected: TrackedItem = {
      id: "b",
      type: "account",
      name: "Hidden TFSA",
      accountScope: { type: "account", accountId: "b" },
    };
    localStorage.setItem("performance:selectedItems", JSON.stringify([selected]));
    localStorage.setItem("performance:selectedItemId", JSON.stringify("b"));
    mocks.getAccounts.mockRejectedValue(new Error("offline"));
    const { client } = renderPage(false);
    await waitFor(() =>
      expect(client.getQueryState([QueryKeys.ACCOUNTS, true])?.status).toBe("error"),
    );
    expect(savedItems()).toEqual([selected]);
    expect(JSON.parse(localStorage.getItem("performance:selectedItemId")!)).toBe("b");
  });

  it("applies the pending scope after the full account inventory loads", async () => {
    let resolveAccounts!: (value: Account[]) => void;
    mocks.getAccounts.mockReturnValue(
      new Promise<Account[]>((resolve) => {
        resolveAccounts = resolve;
      }),
    );
    setScope({ type: "account", accountId: "b" });
    renderPage(false);
    expect(savedItems().some((item) => item.id === "b")).toBe(false);
    await act(async () => resolveAccounts(accounts));
    await waitFor(() => expect(savedItems().some((item) => item.id === "b")).toBe(true));
  });
});
