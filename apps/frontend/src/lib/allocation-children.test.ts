import { describe, expect, it } from "vitest";
import type { CategoryAllocation } from "@/lib/types";
import { namedChildren } from "./allocation-children";

const residualName = (name: string) => `Other ${name}`;

const fixedIncome: CategoryAllocation = {
  categoryId: "FIXED_INCOME",
  categoryName: "Fixed Income",
  color: "#d14d41",
  value: 2000,
  percentage: 20,
  children: [
    {
      categoryId: "FI_MUNICIPAL",
      categoryName: "Municipal Bonds",
      color: "#d14d41",
      value: 1200,
      percentage: 12,
      children: [],
    },
    {
      categoryId: "FIXED_INCOME:__residual__",
      categoryName: "Other Fixed Income",
      color: "#d14d41",
      value: 800,
      percentage: 8,
      children: [],
      isResidual: true,
    },
  ],
};

describe("namedChildren", () => {
  it("renames the residual row after its parent, leaving real categories alone", () => {
    const children = namedChildren(fixedIncome, residualName);

    expect(children.map((c) => c.categoryName)).toEqual(["Municipal Bonds", "Other Fixed Income"]);
    expect(children[1].value).toBe(800);
    expect(children.reduce((sum, c) => sum + c.value, 0)).toBe(2000);
  });

  it("uses the localized parent name, not the backend fallback", () => {
    const [, residual] = namedChildren(fixedIncome, (name) => `Autre ${name}`);

    expect(residual.categoryName).toBe("Autre Fixed Income");
    expect(residual.categoryId).toBe("FIXED_INCOME:__residual__");
  });

  it("leaves a child alone when the id looks residual but the flag is absent", () => {
    const [child] = namedChildren(
      { ...fixedIncome, children: [{ ...fixedIncome.children![1], isResidual: undefined }] },
      () => "RENAMED",
    );

    expect(child.categoryName).toBe("Other Fixed Income");
  });

  it("returns an empty list for a leaf category", () => {
    expect(namedChildren({ ...fixedIncome, children: [] }, residualName)).toEqual([]);
    expect(namedChildren({ ...fixedIncome, children: undefined }, residualName)).toEqual([]);
  });
});
