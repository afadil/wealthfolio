import type { TFunction } from "i18next";
import english from "@/i18n/locales/en/common.json";
import type { TaxonomyAllocation, CategoryAllocation } from "@/lib/types";

const taxonomyNames: Record<string, string> = english.taxonomyNames;
const categoryNames: Record<string, Record<string, string>> = english.categoryNames;

/** Only unchanged built-in names are translated; custom and renamed records stay verbatim. */
export function getTaxonomyLabel(t: TFunction, taxonomyId: string, name: string): string {
  return taxonomyNames[taxonomyId] === name
    ? t(`common:taxonomyNames.${taxonomyId}`, { defaultValue: name })
    : name;
}

export function getCategoryLabel(
  t: TFunction,
  taxonomyId: string,
  categoryId: string,
  name: string,
): string {
  if (categoryId === "__UNKNOWN__") return t("common:unknown");
  return categoryNames[taxonomyId]?.[categoryId] === name
    ? t(`common:categoryNames.${taxonomyId}.${categoryId}`, { defaultValue: name })
    : name;
}

/** A view copy only: never use these names as mutation or persistence input. */
export function localizeAllocation(
  t: TFunction,
  allocation: TaxonomyAllocation,
): TaxonomyAllocation {
  const category = (row: CategoryAllocation, parentName?: string): CategoryAllocation => {
    const name =
      row.isResidual && parentName
        ? t("common:allocation_other_in_category", { category: parentName })
        : getCategoryLabel(t, allocation.taxonomyId, row.categoryId, row.categoryName);
    return {
      ...row,
      categoryName: name,
      children: row.children?.map((child) => category(child, name)),
    };
  };
  return {
    ...allocation,
    taxonomyName: getTaxonomyLabel(t, allocation.taxonomyId, allocation.taxonomyName),
    categories: allocation.categories.map((row) => category(row)),
  };
}

/** Seeded budget groups are editable too; never translate a user rename. */
export function getBudgetGroupLabel(t: TFunction, id: string, name: string): string {
  const names: Record<string, string> = english.budgetGroupNames;
  return names[id] === name ? t(`common:budgetGroupNames.${id}`, { defaultValue: name }) : name;
}
