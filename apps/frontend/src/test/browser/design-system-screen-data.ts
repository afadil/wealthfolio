import { ActivityType, HoldingType } from "@/lib/constants";
import type { ActivityDetails, Holding } from "@/lib/types";
const instruments = [
  ["ACME", "Acme Global Equity", 48230.4, 120, 1230.4],
  ["BOND", "Example Short Duration Bonds", 26450, 250, -342.2],
  ["INTL", "International Opportunities", 18670.5, 90, 486.1],
  ["REAL", "Global Real Assets", 12500, 80, 0],
] as const;
export const previewHoldings: Holding[] = instruments.map(
  ([symbol, name, value, quantity, gain], index) => ({
    id: symbol,
    holdingType: HoldingType.SECURITY,
    accountId: "synthetic-account",
    quantity,
    instrument: { id: symbol, symbol, name, currency: "USD", quoteMode: "MARKET" },
    localCurrency: "USD",
    baseCurrency: "USD",
    marketValue: { local: value, base: value },
    costBasis: { local: value - gain, base: value - gain },
    price: value / quantity,
    dayChange: { local: gain, base: gain },
    dayChangePct: gain / value,
    unrealizedGain: { local: gain, base: gain },
    unrealizedGainPct: gain / value,
    totalGain: { local: gain, base: gain },
    totalGainPct: gain / value,
    weight: value / 105850.9,
    asOfDate: "2026-09-07",
    fxRate: 1,
    openDate: `2026-0${index + 1}-15`,
  }),
);
export const previewActivities: ActivityDetails[] = instruments.map(
  ([symbol, name, value, quantity], index) => ({
    id: `synthetic-${index}`,
    activityType: index === 2 ? ActivityType.DIVIDEND : ActivityType.BUY,
    date: new Date(`2026-09-0${7 - index}T12:00:00Z`),
    createdAt: new Date("2026-09-07T12:00:00Z"),
    updatedAt: new Date("2026-09-07T12:00:00Z"),
    quantity: String(quantity),
    unitPrice: String(value / quantity),
    amount: String(index === 2 ? 245.8 : value),
    fee: "2.50",
    currency: "USD",
    needsReview: false,
    assetId: symbol,
    accountId: "synthetic-account",
    accountName: "Investment account",
    accountCurrency: "USD",
    assetSymbol: symbol,
    assetName: name,
  }),
);
