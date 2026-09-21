import { describe, expect, it } from "vitest";
import { categoryComparison, proposedCategoryColor } from "./category-stability-data";

describe("review-only category stability proposal", () => {
  it("keeps identity colors across rank swaps without changing order, values or percentages", () => {
    const before = categoryComparison(false);
    const after = categoryComparison(true);
    const findColor = (rows: typeof before.current, id: string) =>
      rows.find((row) => row.id === id)?.color;
    expect(after.current.map((row) => row.id)).toEqual(["bonds", "equities"]);
    for (const id of ["equities", "bonds"]) {
      expect(findColor(before.current, id)).not.toBe(findColor(after.current, id));
      expect(findColor(before.proposed, id)).toBe(findColor(after.proposed, id));
      // A filtered/remounted view resolves the same identity without session state.
      expect(proposedCategoryColor("asset-class", id)).toBe(findColor(before.proposed, id));
    }
    for (const state of [before, after]) {
      expect(state.proposed.map(({ color: _, ...row }) => row)).toEqual(
        state.current.map(({ color: _, ...row }) => row),
      );
      expect(state.proposed.reduce((sum, row) => sum + row.value, 0)).toBe(100000);
    }
  });
});
