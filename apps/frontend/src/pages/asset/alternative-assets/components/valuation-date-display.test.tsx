import { render, screen } from "@testing-library/react";
import { FormattingProvider } from "@wealthfolio/ui";
import { describe, expect, it, vi } from "vitest";
import type { AlternativeAssetHolding } from "@/lib/types";
import { AlternativeHoldingsTable } from "@/pages/holdings/components/alternative-holdings-table";
import { UpdateValuationModal } from "./update-valuation-modal";

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false }),
}));
vi.mock("../hooks/use-alternative-asset-mutations", () => ({
  useAlternativeAssetMutations: () => ({
    updateValuationMutation: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

const holding: AlternativeAssetHolding = {
  id: "asset-1",
  kind: "other",
  name: "Test asset",
  symbol: "Other",
  currency: "USD",
  marketValue: "100",
  valuationDate: "2026-09-06T12:00:00+00:00",
};

describe("valuation calendar dates", () => {
  it.each(["Pacific/Auckland", "Pacific/Kiritimati", "America/Los_Angeles"])(
    "preserves Last Valued in %s",
    (timezone) => {
      render(
        <FormattingProvider locale="en-US" timezone={timezone}>
          <AlternativeHoldingsTable holdings={[holding]} isLoading={false} />
        </FormattingProvider>,
      );
      expect(screen.getByText("Sep 6, 2026")).toBeInTheDocument();
    },
  );

  it.each(["2026-09-06", "2026-09-06T12:00:00+00:00", "2026-09-06T00:00:00+00:00"])(
    "shows the last valuation for date input %s",
    (lastUpdatedDate) => {
      render(
        <FormattingProvider locale="en-US" timezone="Pacific/Kiritimati">
          <UpdateValuationModal
            open
            onOpenChange={vi.fn()}
            assetId={holding.id}
            assetName={holding.name}
            currentValue={holding.marketValue}
            currency={holding.currency}
            lastUpdatedDate={lastUpdatedDate}
          />
        </FormattingProvider>,
      );
      expect(screen.getByText(/Last updated: Sep 6, 2026/)).toBeInTheDocument();
    },
  );
});
