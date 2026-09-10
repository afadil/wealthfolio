import type { CategoryAllocation } from "@/lib/types";

/**
 * A residual child holds the part of a category carrying no sub-category assignment (e.g. holdings
 * classified as "Fixed Income" but no bond type). The backend emits it so drill-downs always
 * account for their parent, flagging it with `isResidual` and naming it in English for consumers
 * that render the raw response.
 */
export function namedChild(
  parent: CategoryAllocation,
  child: CategoryAllocation,
  residualName: (categoryName: string) => string,
): CategoryAllocation {
  return child.isResidual ? { ...child, categoryName: residualName(parent.categoryName) } : child;
}

/** Drill-down children of a category, with any residual row renamed in the user's language. */
export function namedChildren(
  parent: CategoryAllocation,
  residualName: (categoryName: string) => string,
): CategoryAllocation[] {
  return (parent.children ?? []).map((child) => namedChild(parent, child, residualName));
}
