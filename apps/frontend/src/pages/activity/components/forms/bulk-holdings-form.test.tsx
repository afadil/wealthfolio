import { render, screen } from "@testing-library/react";
import { FormattingProvider } from "@wealthfolio/ui";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { BulkHoldingsForm } from "./bulk-holdings-form";

vi.mock("@/hooks/use-accounts", () => ({ useAccounts: () => ({ accounts: [] }) }));
vi.mock("@/components/account-selector", () => ({ AccountSelector: () => null }));
vi.mock("@/components/ticker-search", () => ({ default: () => null }));
vi.mock("@/components/ticker-avatar", () => ({ TickerAvatar: () => null }));

function FormWrapper({ children }: { children: ReactNode }) {
  const form = useForm({
    defaultValues: {
      accountId: "account-1",
      activityDate: new Date(2026, 9, 14),
      currency: "EUR",
      holdings: [{ id: "holding-1", ticker: "SAP", sharesOwned: 10, averageCost: 123.45 }],
    },
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

describe("BulkHoldingsForm", () => {
  it("formats each row total in the form's currency", () => {
    render(
      <FormattingProvider locale="DE">
        <FormWrapper>
          <BulkHoldingsForm />
        </FormWrapper>
      </FormattingProvider>,
    );

    expect(screen.getByText(/^1\.234,50\s€$/)).toBeInTheDocument();
  });
});
