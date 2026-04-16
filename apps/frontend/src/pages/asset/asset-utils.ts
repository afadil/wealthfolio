import { Asset, LatestQuoteSnapshot } from "@/lib/types";

export interface WeightedBreakdown {
  name: string;
  weight: number;
}

/** One line in `profile.fundHoldings` (Yahoo top fund positions). */
export interface FundHoldingRow {
  /** Ticker e.g. HMAX.TO */
  symbol: string;
  /** Issuer long name */
  description: string;
  /** Fallback label (legacy / API without split fields) */
  name: string;
  weight: number;
}

export interface ParsedAsset extends Asset {
  sectorsList: WeightedBreakdown[];
  countriesList: WeightedBreakdown[];
}

export const isStaleQuote = (snapshot?: LatestQuoteSnapshot, asset?: ParsedAsset): boolean => {
  if (!snapshot || asset?.isActive === false) {
    return true;
  }

  return snapshot.isStale;
};

const normalizeWeight = (weight: unknown): number => {
  if (weight === null || weight === undefined) {
    return 0;
  }
  if (typeof weight === "number") {
    return Number.isNaN(weight) ? 0 : weight;
  }
  if (typeof weight !== "string") {
    return 0;
  }
  const parsed = parseFloat(weight.replace("%", ""));
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
};

/** Map array items to breakdown (shared by string and array inputs). */
function breakdownFromArray(arr: unknown[]): WeightedBreakdown[] {
  return arr
    .map((item) => {
      const row = item as { name?: unknown; weight?: unknown };
      return {
        name: typeof row.name === "string" ? row.name.trim() : "",
        weight: normalizeWeight(row.weight),
      };
    })
    .filter((item) => item.name);
}

/**
 * Parses weighted breakdown from DB/API: `profile.sectors` / legacy fields are often a
 * JSON **string** containing `[{name, weight}, …]`; some paths already provide an array.
 */
function parseBreakdownField(value: unknown): WeightedBreakdown[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return breakdownFromArray(value);
  }
  if (typeof value !== "string" || value.trim() === "" || value === "null") {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return breakdownFromArray(parsed);
  } catch {
    return [];
  }
}

/** Prefer legacy JSON; else `metadata.profile` (Yahoo enrichment). */
function pickLegacyOrProfileRaw(
  legacyVal: unknown | undefined,
  profileVal: unknown | undefined,
): unknown {
  if (typeof legacyVal === "string" && legacyVal.trim()) {
    return legacyVal;
  }
  if (Array.isArray(legacyVal) && legacyVal.length > 0) {
    return legacyVal;
  }
  if (typeof profileVal === "string" && profileVal.trim()) {
    return profileVal;
  }
  if (Array.isArray(profileVal) && profileVal.length > 0) {
    return profileVal;
  }
  return null;
}

export const formatBreakdownTags = (items: WeightedBreakdown[]): string[] =>
  items.map(
    (item) => `${item.name}:${item.weight <= 1 ? (item.weight * 100).toFixed(0) : item.weight}%`,
  );

export const tagsToBreakdown = (values: string[]): WeightedBreakdown[] =>
  values
    .map((value) => {
      const [rawName, rawWeight] = value.split(":");
      const name = rawName?.trim();
      if (!name) return null;
      const cleanedWeight = rawWeight?.replace("%", "").trim();
      const weight = cleanedWeight ? parseFloat(cleanedWeight) : 0;
      return {
        name,
        weight: Number.isFinite(weight) ? weight : 0,
      };
    })
    .filter(Boolean) as WeightedBreakdown[];

/** Prefer legacy.*; fall back to metadata.profile.* (Yahoo enrichment stores sectors/countries there). */
function mergedSectorsCountriesRaw(asset: Asset): {
  sectors: unknown;
  countries: unknown;
} {
  const legacy = asset.metadata?.legacy as
    | {
        sectors?: unknown;
        countries?: unknown;
      }
    | undefined;
  const profile = asset.metadata?.profile as
    | {
        sectors?: unknown;
        countries?: unknown;
      }
    | undefined;

  return {
    sectors: pickLegacyOrProfileRaw(legacy?.sectors, profile?.sectors),
    countries: pickLegacyOrProfileRaw(legacy?.countries, profile?.countries),
  };
}

/** Sector / fund composition from stored JSON (legacy or enriched profile). */
export function getSectorsListFromAsset(asset: Asset): WeightedBreakdown[] {
  const { sectors } = mergedSectorsCountriesRaw(asset);
  return parseBreakdownField(sectors);
}

/** Geographic breakdown from stored JSON (legacy or enriched profile). */
export function getCountriesListFromAsset(asset: Asset): WeightedBreakdown[] {
  const { countries } = mergedSectorsCountriesRaw(asset);
  return parseBreakdownField(countries);
}

function rowFromFundHoldingItem(item: unknown, weight: number): FundHoldingRow | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const o = item as Record<string, unknown>;
  const sym = typeof o.symbol === "string" ? o.symbol.trim() : "";
  const desc = typeof o.description === "string" ? o.description.trim() : "";
  const legacyName = typeof o.name === "string" ? o.name.trim() : "";
  if (!sym && !desc && !legacyName) {
    return null;
  }
  return {
    symbol: sym,
    description: desc,
    name: legacyName || desc || sym,
    weight,
  };
}

function parseFundHoldingsField(value: unknown): FundHoldingRow[] {
  if (value === null || value === undefined) {
    return [];
  }
  const toRows = (arr: unknown[]): FundHoldingRow[] =>
    arr
      .map((item) => {
        if (typeof item === "object" && item !== null && "weight" in item) {
          const w = normalizeWeight((item as { weight?: unknown }).weight);
          return rowFromFundHoldingItem(item, w);
        }
        return null;
      })
      .filter(Boolean) as FundHoldingRow[];

  if (Array.isArray(value)) {
    return toRows(value);
  }
  if (typeof value !== "string" || value.trim() === "" || value === "null") {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return toRows(parsed);
  } catch {
    return [];
  }
}

/** Top underlying positions (Yahoo `topHoldings.holdings`), stored as `profile.fundHoldings`. */
export function getFundHoldingsListFromAsset(asset: Asset): FundHoldingRow[] {
  const legacy = asset.metadata?.legacy as { fundHoldings?: unknown } | undefined;
  const profile = asset.metadata?.profile as { fundHoldings?: unknown } | undefined;
  return parseFundHoldingsField(pickLegacyOrProfileRaw(legacy?.fundHoldings, profile?.fundHoldings));
}

export const toParsedAsset = (asset: Asset): ParsedAsset => {
  const { sectors, countries } = mergedSectorsCountriesRaw(asset);

  return {
    ...asset,
    sectorsList: parseBreakdownField(sectors),
    countriesList: parseBreakdownField(countries),
  };
};
