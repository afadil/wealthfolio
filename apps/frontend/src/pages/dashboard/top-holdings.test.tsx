import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import TopHoldings from "./top-holdings";
import type { Holding } from "@/lib/types";

const { mockTickerAvatar } = vi.hoisted(() => ({
  mockTickerAvatar: vi.fn(
    ({ symbol, exchangeMic }: { symbol: string; exchangeMic?: string; className?: string }) => (
      <div data-testid={`ticker-avatar-${symbol}`}>{exchangeMic ?? ""}</div>
    ),
  ),
}));

vi.mock("@/components/ticker-avatar", () => ({
  TickerAvatar: mockTickerAvatar,
}));

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false }),
}));

const holding: Holding = {
  id: "holding-1",
  accountId: "acc-1",
  holdingType: "security",
  instrument: {
    id: "asset-1",
    symbol: "DTE",
    exchangeMic: "XETR",
    name: "Deutsche Telekom AG",
    currency: "EUR",
    quoteMode: "MARKET",
    preferredProvider: null,
    notes: null,
    classifications: null,
  },
  assetKind: "INVESTMENT",
  quantity: 10,
  openDate: null,
  lots: null,
  localCurrency: "EUR",
  baseCurrency: "EUR",
  fxRate: null,
  marketValue: { local: 230, base: 230 },
  costBasis: null,
  price: 23,
  unrealizedGain: { local: 10, base: 10 },
  unrealizedGainPct: 0.045,
  realizedGain: null,
  realizedGainPct: null,
  totalGain: null,
  totalGainPct: null,
  dayChange: null,
  dayChangePct: null,
  prevCloseValue: null,
  weight: 1,
  asOfDate: "2026-03-15",
};

describe("TopHoldings", () => {
  it("passes exchangeMic through to ticker avatars", () => {
    render(
      <MemoryRouter>
        <TopHoldings holdings={[holding]} isLoading={false} baseCurrency="EUR" />
      </MemoryRouter>,
    );

    expect(mockTickerAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "DTE",
        exchangeMic: "XETR",
      }),
      undefined,
    );
  });
});
