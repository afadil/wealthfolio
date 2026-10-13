import { render, screen } from "@/test/render";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import type { AlternativeAssetHolding } from "@/lib/types";
import { LinkedLiabilitiesCard, LinkedLiabilitiesSection } from "./linked-liabilities-card";

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false }),
}));

it.each([LinkedLiabilitiesCard, LinkedLiabilitiesSection])(
  "keeps an unknown linked balance distinct from a recorded zero",
  (Component) => {
    const holding = {
      id: "loan",
      name: "Manual loan",
      kind: "liability",
      currency: "USD",
      marketValue: "0",
      loan: { balanceSource: null },
    } as AlternativeAssetHolding;
    const { rerender } = render(
      <MemoryRouter>
        <Component liabilities={[holding]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <Component
          liabilities={[{ ...holding, loan: { ...holding.loan!, balanceSource: "recorded" } }]}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
    expect(screen.getByText(/0\.00/)).toBeInTheDocument();
  },
);
