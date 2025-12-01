import { Asset, Country, Sector } from "@/lib/types";

export type WeightedBreakdown = { name: string; weight: number };

export interface ParsedAsset extends Asset {
  sectorsList: Sector[];
  countriesList: Country[];
}

const normalizeWeight = (weight: unknown): number => {
  const parsed =
    typeof weight === "number" ? weight : parseFloat(String(weight ?? "").replace("%", ""));
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
};

const parseJsonBreakdown = (value?: string | null): WeightedBreakdown[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as WeightedBreakdown[];
    return parsed
      .map((item) => ({ name: item.name?.trim() ?? "", weight: normalizeWeight(item.weight) }))
      .filter((item) => item.name);
  } catch (error) {
    console.warn("Failed to parse breakdown", error);
    return [];
  }
};

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

export const toParsedAsset = (asset: Asset): ParsedAsset => ({
  ...asset,
  sectorsList: parseJsonBreakdown(asset.sectors),
  countriesList: parseJsonBreakdown(asset.countries),
});
