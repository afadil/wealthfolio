import type { CategoryAllocation } from "@/lib/types";
import {
  buildBreakdownTree,
  CHART_PALETTE,
} from "@/pages/insights/overview/allocation-derivations";

// Review-only identity mapping; no production consumer imports this fixture.
export function proposedCategoryColor(taxonomyId: string, categoryId: string): string {
  let hash = 0;
  for (const character of `${taxonomyId}:${categoryId}`) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  return CHART_PALETTE[hash % CHART_PALETTE.length];
}

export function categoryComparison(swapped: boolean) {
  const categories: CategoryAllocation[] = [
    {
      categoryId: "equities",
      categoryName: "Equities",
      value: swapped ? 40000 : 60000,
      percentage: swapped ? 40 : 60,
      color: "",
    },
    {
      categoryId: "bonds",
      categoryName: "Bonds",
      value: swapped ? 60000 : 40000,
      percentage: swapped ? 60 : 40,
      color: "",
    },
  ];
  const current = buildBreakdownTree(categories, 100000, (name) => `${name} remainder`);
  return {
    current,
    proposed: current.map((item) => ({
      ...item,
      color: proposedCategoryColor("asset-class", item.id),
    })),
  };
}
