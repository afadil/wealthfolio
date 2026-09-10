/**
 * Aggregation for the category drill-down drawer.
 *
 * The drawer used to derive its header totals and subcategory mix by summing
 * the transactions it had loaded — a 50-per-page infinite list — so any
 * category with more than one page of activity reported a fraction of its
 * real spend, and the figure grew as the user pressed "Load more".
 *
 * These helpers read the same server aggregate the breakdown table shows:
 * `insight.byDayByCategory`, which is split-aware, FX-converted, covers the
 * whole period and is never truncated. Keep it that way — deriving these
 * numbers from a paginated list is the bug this module exists to prevent.
 */

import { ancestorChain, type RollupMeta } from "./category-rollup";
import { UNCATEGORIZED_CATEGORY_ID } from "./insight-projection";

const SPENDING_TAXONOMY = "spending_categories";

/** Mix row for amounts tagged on the drilled-into category itself rather
 *  than on one of its descendants. */
export const DIRECT_ROW_ID = "__direct__";

/** Minimal bucket shape — matches `DayCategoryBucket` from the insight
 *  payload without coupling this module to the whole type. */
export interface DrilldownBucket {
  taxonomyId: string;
  categoryId: string;
  amount: number;
}

export interface CategoryMixRow {
  /** An immediate child of the drilled-into category, or `DIRECT_ROW_ID`. */
  id: string;
  amount: number;
  /** Percentage of the mix, 0–100. */
  share: number;
}

export interface CategoryDrilldown {
  /** Total for the category and everything beneath it, clamped at 0 to match
   *  the breakdown table (`buildTree` clamps the same way). */
  spent: number;
  /** Composition by immediate child, descending. Non-positive rows are
   *  dropped and `share` is relative to what remains, matching how the
   *  breakdown table treats refund-dominated categories. */
  mix: CategoryMixRow[];
}

/**
 * Roll every spending bucket beneath `categoryId` into a total plus a
 * per-immediate-child composition. Works the same for a top-level category
 * and a subcategory: a subcategory click simply drills into a smaller
 * subtree.
 */
export function computeCategoryDrilldown(params: {
  categoryId: string;
  buckets: DrilldownBucket[];
  meta: Map<string, RollupMeta>;
}): CategoryDrilldown {
  const { categoryId, buckets, meta } = params;

  let total = 0;
  const byChild = new Map<string, number>();

  for (const bucket of buckets) {
    if (bucket.taxonomyId !== SPENDING_TAXONOMY) continue;
    // Unallocated spend belongs to `insight.uncategorized`, not to any
    // category — and the synthetic row it feeds isn't clickable.
    if (bucket.categoryId === UNCATEGORIZED_CATEGORY_ID) continue;

    const chain = ancestorChain(bucket.categoryId, meta);
    const depth = chain.indexOf(categoryId);
    if (depth < 0) continue; // Outside this subtree.

    total += bucket.amount;
    const childId = depth === 0 ? DIRECT_ROW_ID : chain[depth - 1];
    byChild.set(childId, (byChild.get(childId) ?? 0) + bucket.amount);
  }

  const mixTotal = Array.from(byChild.values()).reduce((sum, a) => (a > 0 ? sum + a : sum), 0);
  const mix = Array.from(byChild.entries())
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([id, amount]) => ({
      id,
      amount,
      share: mixTotal > 0 ? (amount / mixTotal) * 100 : 0,
    }));

  return { spent: Math.max(0, total), mix };
}
