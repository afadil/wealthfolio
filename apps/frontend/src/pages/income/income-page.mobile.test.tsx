import { useAccountScopeStore } from "@/lib/account-scope-store";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IncomePage from "./income-page";

vi.mock("@/adapters", () => ({ getIncomeSummary: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false }),
}));
vi.mock("@/hooks", () => ({ useIsMobileViewport: () => true }));
vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: () => ({
    accounts: [
      { id: "a", name: "Brokerage", currency: "USD" },
      { id: "b", name: "TFSA", currency: "USD" },
    ],
  }),
}));
vi.mock("@/hooks/use-portfolios", () => ({
  usePortfolios: () => ({ data: [{ id: "p", name: "Retirement" }] }),
}));

const initialState = useAccountScopeStore.getState();

async function openMobileSelector() {
  const { container } = render(<IncomePage />);
  const toolbar = container.querySelector<HTMLElement>(".md\\:hidden")!;
  await userEvent.click(within(toolbar).getByRole("combobox"));
  return within(screen.getByRole("dialog"));
}

function expectChecked(option: HTMLElement) {
  expect(option.querySelector(".opacity-100")).toBeInTheDocument();
}

describe("IncomePage mobile account scope", () => {
  beforeEach(() => {
    useAccountScopeStore.setState(initialState, true);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows imported members and edits them without discarding the other selection", async () => {
    useAccountScopeStore.getState().setScope({ type: "accounts", accountIds: ["a", "b"] });
    const sheet = await openMobileSelector();
    expectChecked(sheet.getByRole("option", { name: /Brokerage/ }));
    expectChecked(sheet.getByRole("option", { name: /TFSA/ }));

    await userEvent.click(sheet.getByRole("option", { name: /Brokerage/ }));
    expect(useAccountScopeStore.getState().scope).toEqual({ type: "account", accountId: "b" });
    expectChecked(sheet.getByRole("option", { name: /TFSA/ }));

    await userEvent.click(sheet.getByRole("option", { name: /TFSA/ }));
    expect(useAccountScopeStore.getState().scope).toEqual({ type: "all" });
    expectChecked(sheet.getByRole("option", { name: /All Accounts/ }));
  });

  it("retains portfolio selection and can switch back to accounts", async () => {
    useAccountScopeStore.getState().setScope({ type: "portfolio", portfolioId: "p" });
    const sheet = await openMobileSelector();
    expectChecked(sheet.getByRole("option", { name: /Retirement/ }));
    await userEvent.click(sheet.getByRole("option", { name: /Brokerage/ }));
    expect(useAccountScopeStore.getState().scope).toEqual({ type: "account", accountId: "a" });
    expectChecked(sheet.getByRole("option", { name: /Brokerage/ }));
  });
});
