import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSelector } from "./account-selector";

vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: () => ({ accounts: [], isLoading: true }),
}));
vi.mock("@/hooks/use-portfolios", () => ({
  usePortfolios: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ data: undefined, isLoading: false }),
}));

describe("AccountSelector", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the loading card skeleton without making it a popover trigger", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { container } = render(<AccountSelector variant="card" setSelectedAccount={vi.fn()} />);

    expect(container.querySelector("[data-slot=skeleton]")).toBeInTheDocument();
    expect(container.querySelector("[data-slot=popover-trigger]")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("nativeButton"));
  });
});
