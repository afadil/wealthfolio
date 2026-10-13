import { describe, expect, it } from "vitest";

import type { TaxonomyCategory } from "@/lib/types";

import { DIRECT_ROW_ID } from "../../../lib/category-drilldown";
import type { CategoryBreakdownRow } from "../../../types/report";
import { buildTree } from "./builders";

const category = (id: string, name: string, parentId: string | null = null): TaxonomyCategory => ({
  id,
  taxonomyId: "spending_categories",
  parentId,
  name,
  key: id,
  color: "#A35742",
  sortOrder: 0,
  createdAt: "",
  updatedAt: "",
});

const row = (categoryId: string, amount: number): CategoryBreakdownRow => ({
  taxonomyId: "spending_categories",
  categoryId,
  amount,
  count: 1,
});

const taxonomyCategories = [
  category("housing", "Housing"),
  category("rent", "Rent", "housing"),
  category("utilities", "Utilities", "housing"),
  category("furnishing", "Furnishing", "housing"),
  category("groceries", "Groceries"),
];

const tree = (breakdown: CategoryBreakdownRow[], priorBreakdown: CategoryBreakdownRow[] = []) =>
  buildTree({
    breakdown,
    priorBreakdown,
    budgetRows: [],
    taxonomyCategories,
    sort: "spent",
    compareNames: (a, b) => a.localeCompare(b),
    directLabel: "Direct",
  });

const childRows = (node: { children: { id: string; name: string; spent: number }[] }) =>
  node.children.map(({ id, name, spent }) => [id, name, spent]);

describe("buildTree subcategories", () => {
  it("lists subcategories largest first, with direct spending and refunds, adding up to the parent", () => {
    const [housing] = tree([
      row("utilities", 210),
      row("rent", 1800),
      row("housing", 60),
      // Refunds outweighed what was spent on furnishing this period.
      row("furnishing", -250),
    ]);

    expect(housing.spent).toBe(1820);
    expect(childRows(housing)).toEqual([
      ["rent", "Rent", 1800],
      ["utilities", "Utilities", 210],
      [DIRECT_ROW_ID, "Direct", 60],
      ["furnishing", "Furnishing", -250],
    ]);
    expect(housing.children.reduce((total, child) => total + child.spent, 0)).toBe(housing.spent);
  });

  it("adds no direct row to a category without subcategory rows", () => {
    const nodes = tree([row("housing", 1820), row("groceries", 640)], [row("housing", 1700)]);

    expect(nodes.map((node) => [node.id, node.spent, node.priorSpent, node.children])).toEqual([
      ["housing", 1820, 1700, []],
      ["groceries", 640, 0, []],
    ]);
  });

  it("drops sub-cent noise instead of drawing a $0.00 row", () => {
    const [housing] = tree([row("rent", 1800), row("utilities", 0.001), row("housing", -0.002)]);

    expect(childRows(housing)).toEqual([["rent", "Rent", 1800]]);
  });
});
