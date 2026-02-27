// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import DividendPage from "./dividend-page";

expect.extend(matchers);
afterEach(() => cleanup());

function makeCtx(): AddonContext {
  return {
    api: {
      accounts: { getAll: vi.fn().mockResolvedValue([]) },
      portfolio: { getHoldings: vi.fn().mockResolvedValue([]) },
      activities: {
        search: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
        saveMany: vi.fn().mockResolvedValue({ created: [], errors: [] }),
      },
      assets: { getProfile: vi.fn().mockResolvedValue({}) },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() },
      toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
      query: {
        getClient: vi.fn().mockReturnValue(new QueryClient()),
        invalidateQueries: vi.fn(),
        refetchQueries: vi.fn(),
      },
    },
    sidebar: { addItem: vi.fn() },
    router: { add: vi.fn() },
    onDisable: vi.fn(),
  } as unknown as AddonContext;
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("DividendPage", () => {
  it("renders page header", () => {
    renderWithQuery(<DividendPage ctx={makeCtx()} />);
    expect(screen.getByText("Dividend Tracker")).toBeInTheDocument();
  });

  it("shows Suggestions and History tabs", () => {
    renderWithQuery(<DividendPage ctx={makeCtx()} />);
    expect(screen.getByRole("tab", { name: "Suggestions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "History" })).toBeInTheDocument();
  });

  it("defaults to Suggestions tab", () => {
    renderWithQuery(<DividendPage ctx={makeCtx()} />);
    const suggestionsTab = screen.getByRole("tab", { name: "Suggestions" });
    expect(suggestionsTab).toHaveAttribute("data-state", "active");
  });

  it("switches to History tab on click", async () => {
    const user = userEvent.setup();
    renderWithQuery(<DividendPage ctx={makeCtx()} />);

    const historyTab = screen.getByRole("tab", { name: "History" });
    await user.click(historyTab);

    expect(historyTab).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Suggestions" })).toHaveAttribute(
      "data-state",
      "inactive",
    );
  });
});
