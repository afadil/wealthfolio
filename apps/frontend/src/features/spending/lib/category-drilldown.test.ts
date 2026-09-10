import { describe, expect, it } from "vitest";

import {
  computeCategoryDrilldown,
  DIRECT_ROW_ID,
  type DrilldownBucket,
} from "./category-drilldown";
import { descendantCategoryIds, type RollupMeta } from "./category-rollup";

/** housing → rent → rent_deposit, plus an unrelated top-level tree. */
const meta = new Map<string, RollupMeta>([
  ["housing", { parentId: null }],
  ["rent", { parentId: "housing" }],
  ["rent_deposit", { parentId: "rent" }],
  ["utilities", { parentId: "housing" }],
  ["food", { parentId: null }],
  ["groceries", { parentId: "food" }],
]);

const bucket = (categoryId: string, amount: number, taxonomyId = "spending_categories") =>
  ({ taxonomyId, categoryId, amount }) satisfies DrilldownBucket;

describe("computeCategoryDrilldown", () => {
  it("rolls up the whole subtree, including grandchildren", () => {
    const { spent } = computeCategoryDrilldown({
      categoryId: "housing",
      buckets: [
        bucket("housing", 100), // tagged on the category itself
        bucket("rent", 1000), // child
        bucket("rent_deposit", 250), // grandchild
        bucket("utilities", 50), // child
      ],
      meta,
    });

    expect(spent).toBe(1400);
  });

  it("sums every bucket for a category, not just the first", () => {
    const { spent } = computeCategoryDrilldown({
      categoryId: "housing",
      buckets: Array.from({ length: 120 }, () => bucket("rent", 10)),
      meta,
    });

    expect(spent).toBe(1200);
  });

  it("excludes other top-level trees and other taxonomies", () => {
    const { spent } = computeCategoryDrilldown({
      categoryId: "housing",
      buckets: [
        bucket("rent", 1000),
        bucket("groceries", 400), // different top-level tree
        bucket("rent", 900, "income_categories"), // right id, wrong taxonomy
      ],
      meta,
    });

    expect(spent).toBe(1000);
  });

  it("excludes the uncategorized bucket", () => {
    const { spent, mix } = computeCategoryDrilldown({
      categoryId: "housing",
      buckets: [bucket("rent", 1000), bucket("__uncategorized__", 700)],
      meta,
    });

    expect(spent).toBe(1000);
    expect(mix.map((r) => r.id)).toEqual(["rent"]);
  });

  it("attributes a grandchild to the immediate child, and self-tagged rows to the direct row", () => {
    const { mix } = computeCategoryDrilldown({
      categoryId: "housing",
      buckets: [bucket("rent", 600), bucket("rent_deposit", 200), bucket("housing", 200)],
      meta,
    });

    expect(mix).toEqual([
      { id: "rent", amount: 800, share: 80 },
      { id: DIRECT_ROW_ID, amount: 200, share: 20 },
    ]);
  });

  it("keeps the mix summing to the header total", () => {
    const buckets = [
      bucket("housing", 100),
      bucket("rent", 1000),
      bucket("rent_deposit", 250),
      bucket("utilities", 50),
    ];
    const { spent, mix } = computeCategoryDrilldown({ categoryId: "housing", buckets, meta });

    expect(mix.reduce((sum, r) => sum + r.amount, 0)).toBe(spent);
    expect(mix.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(100, 10);
  });

  it("drills into a subcategory without picking up its parent or siblings", () => {
    const { spent, mix } = computeCategoryDrilldown({
      categoryId: "rent",
      buckets: [
        bucket("housing", 100), // parent — above the drilled-into node
        bucket("utilities", 50), // sibling
        bucket("rent", 600),
        bucket("rent_deposit", 200),
      ],
      meta,
    });

    expect(spent).toBe(800);
    expect(mix).toEqual([
      { id: DIRECT_ROW_ID, amount: 600, share: 75 },
      { id: "rent_deposit", amount: 200, share: 25 },
    ]);
  });

  it("clamps a refund-dominated category to zero and drops its negative rows", () => {
    const { spent, mix } = computeCategoryDrilldown({
      categoryId: "housing",
      buckets: [bucket("rent", 100), bucket("utilities", -400)],
      meta,
    });

    expect(spent).toBe(0);
    expect(mix).toEqual([{ id: "rent", amount: 100, share: 100 }]);
  });

  it("terminates on a cyclic parent chain", () => {
    const cyclic = new Map<string, RollupMeta>([
      ["a", { parentId: "b" }],
      ["b", { parentId: "a" }],
    ]);

    expect(
      computeCategoryDrilldown({ categoryId: "a", buckets: [bucket("b", 10)], meta: cyclic }),
    ).toEqual({ spent: 10, mix: [{ id: "b", amount: 10, share: 100 }] });
  });

  it("treats every leaf as its own top when the taxonomy has not loaded yet", () => {
    const { spent, mix } = computeCategoryDrilldown({
      categoryId: "housing",
      buckets: [bucket("housing", 100), bucket("rent", 1000)],
      meta: new Map(),
    });

    expect(spent).toBe(100);
    expect(mix).toEqual([{ id: DIRECT_ROW_ID, amount: 100, share: 100 }]);
  });

  it("returns an empty result for a category with no buckets", () => {
    expect(computeCategoryDrilldown({ categoryId: "housing", buckets: [], meta })).toEqual({
      spent: 0,
      mix: [],
    });
  });
});

describe("descendantCategoryIds", () => {
  const categories = [
    { id: "housing", parentId: null },
    { id: "rent", parentId: "housing" },
    { id: "rent_deposit", parentId: "rent" },
    { id: "utilities", parentId: "housing" },
    { id: "food", parentId: null },
    { id: "groceries", parentId: "food" },
  ];

  it("returns the category plus every descendant, transitively", () => {
    expect(descendantCategoryIds("housing", categories).sort()).toEqual([
      "housing",
      "rent",
      "rent_deposit",
      "utilities",
    ]);
  });

  it("returns just the leaf for a category with no children", () => {
    expect(descendantCategoryIds("groceries", categories)).toEqual(["groceries"]);
  });

  it("terminates on a cyclic parent chain", () => {
    expect(
      descendantCategoryIds("a", [
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" },
      ]).sort(),
    ).toEqual(["a", "b"]);
  });
});
