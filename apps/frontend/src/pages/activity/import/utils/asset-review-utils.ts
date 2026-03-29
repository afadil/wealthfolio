import { isCashSymbol, needsImportAssetResolution } from "@/lib/activity-utils";
import type { ImportAssetCandidate, NewAsset, SymbolSearchResult } from "@/lib/types";
import type { DraftActivity } from "../context";

export function applyAssetResolution(
  drafts: DraftActivity[],
  key: string,
  draft: NewAsset,
  options: { assetId?: string; importAssetKey?: string },
): DraftActivity[] {
  return drafts.map((row) => {
    if (row.assetCandidateKey !== key) {
      return row;
    }
    return {
      ...row,
      symbol: draft.instrumentSymbol || draft.displayCode || row.symbol,
      symbolName: draft.name || row.symbolName,
      exchangeMic: draft.instrumentExchangeMic || undefined,
      quoteCcy: draft.quoteCcy || row.quoteCcy,
      instrumentType: draft.instrumentType || row.instrumentType,
      quoteMode: draft.quoteMode || row.quoteMode,
      assetId: options.assetId,
      importAssetKey: options.importAssetKey,
    };
  });
}

export function mapQuoteTypeToInstrumentType(quoteType?: string): string | undefined {
  switch ((quoteType ?? "").toUpperCase()) {
    case "EQUITY":
    case "ETF":
    case "MUTUALFUND":
    case "INDEX":
    case "ECNQUOTE":
      return "EQUITY";
    case "CRYPTO":
    case "CRYPTOCURRENCY":
      return "CRYPTO";
    case "BOND":
    case "MONEYMARKET":
      return "BOND";
    case "OPTION":
      return "OPTION";
    case "METAL":
    case "COMMODITY":
      return "METAL";
    case "FX":
    case "FOREX":
      return "FX";
    default:
      return undefined;
  }
}

export function buildImportAssetCandidateKey(input: {
  accountId: string;
  symbol: string;
  instrumentType?: string;
  quoteMode?: string;
  quoteCcy?: string;
  exchangeMic?: string;
  isin?: string;
}): string {
  // quoteCcy is included so that the same symbol with different currencies
  // (e.g. SHOP on NASDAQ/USD vs TSX/CAD) resolves independently.
  // ISIN is included so same-ticker rows from different instruments do not
  // collapse before preview/validation can disambiguate them.
  return [
    input.symbol.trim().toUpperCase(),
    input.instrumentType?.trim().toUpperCase() ?? "",
    input.quoteMode?.trim().toUpperCase() ?? "",
    input.exchangeMic?.trim().toUpperCase() ?? "",
    input.quoteCcy?.trim().toUpperCase() ?? "",
    input.isin?.trim().toUpperCase() ?? "",
  ].join("::");
}

export function buildImportAssetCandidateFromDraft(
  draft: DraftActivity,
): ImportAssetCandidate | null {
  if (!draft.symbol || !draft.activityType) {
    return null;
  }
  if (
    !needsImportAssetResolution(draft.activityType, draft.subtype) ||
    isCashSymbol(draft.symbol)
  ) {
    return null;
  }
  if (!draft.accountId) {
    return null;
  }

  return {
    key:
      draft.assetCandidateKey ||
      buildImportAssetCandidateKey({
        accountId: draft.accountId,
        symbol: draft.symbol,
        instrumentType: draft.instrumentType,
        quoteMode: draft.quoteMode,
        quoteCcy: draft.quoteCcy || draft.currency,
        exchangeMic: draft.exchangeMic,
        isin: draft.isin,
      }),
    accountId: draft.accountId,
    symbol: draft.symbol,
    currency: draft.currency,
    instrumentType: draft.instrumentType,
    quoteCcy: draft.quoteCcy,
    quoteMode: draft.quoteMode,
    exchangeMic: draft.exchangeMic,
    isin: draft.isin,
  };
}

export function buildNewAssetFromSearchResult(
  result: SymbolSearchResult,
  fallbackCurrency: string,
): NewAsset {
  const instrumentType = mapQuoteTypeToInstrumentType(result.quoteType);
  const kind =
    instrumentType === "METAL" ? "PRECIOUS_METAL" : instrumentType === "FX" ? "FX" : "INVESTMENT";
  const quoteMode = result.dataSource === "MANUAL" ? "MANUAL" : "MARKET";

  return {
    kind,
    name: result.longName || result.shortName || result.symbol,
    displayCode: result.symbol,
    isActive: true,
    quoteMode,
    quoteCcy: result.currency || fallbackCurrency,
    instrumentType,
    instrumentSymbol: result.symbol,
    instrumentExchangeMic: result.exchangeMic,
  };
}

export function buildNewAssetFromDraft(draft: DraftActivity): NewAsset | null {
  if (!draft.symbol || !draft.instrumentType || !draft.quoteCcy) {
    return null;
  }

  const normalizedInstrumentType = draft.instrumentType.toUpperCase();
  const kind =
    normalizedInstrumentType === "METAL"
      ? "PRECIOUS_METAL"
      : normalizedInstrumentType === "FX"
        ? "FX"
        : "INVESTMENT";

  return {
    kind,
    name: draft.symbolName || draft.symbol,
    displayCode: draft.symbol,
    isActive: true,
    quoteMode: draft.quoteMode === "MANUAL" ? "MANUAL" : "MARKET",
    quoteCcy: draft.quoteCcy,
    instrumentType: draft.instrumentType,
    instrumentSymbol: draft.symbol,
    instrumentExchangeMic: draft.exchangeMic,
  };
}
