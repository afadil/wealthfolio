import type { ExpenseBudget, ExpenseItem } from "../types";

const LEGACY_LABELS = {
  living: "Living",
  healthcare: "Healthcare",
  housing: "Housing",
  discretionary: "Discretionary",
} as const;

export function createExpenseItem(
  label: string,
  monthlyAmount = 0,
  patch: Partial<ExpenseItem> = {},
): ExpenseItem {
  return {
    id: patch.id ?? crypto.randomUUID?.() ?? `expense-${Date.now()}`,
    label,
    monthlyAmount,
    essential: true,
    ...patch,
  };
}

function normalizeItem(raw: Partial<ExpenseItem>, fallbackLabel: string, fallbackId: string) {
  return {
    id: raw.id || fallbackId,
    label: raw.label || fallbackLabel,
    monthlyAmount: raw.monthlyAmount ?? 0,
    inflationRate: raw.inflationRate,
    startAge: raw.startAge,
    endAge: raw.endAge,
    essential: raw.essential,
  };
}

export function normalizeExpenseBudget(raw: Partial<ExpenseBudget> | undefined): ExpenseBudget {
  if (raw?.items?.length) {
    return {
      items: raw.items.map((item, index) =>
        normalizeItem(item, item.label || `Spending ${index + 1}`, item.id || `expense-${index}`),
      ),
    };
  }

  const items: ExpenseItem[] = [
    normalizeItem(raw?.living ?? {}, LEGACY_LABELS.living, "living"),
    normalizeItem(raw?.healthcare ?? {}, LEGACY_LABELS.healthcare, "healthcare"),
  ];

  if (raw?.housing) {
    items.push(
      normalizeItem(
        { ...raw.housing, essential: raw.housing.essential ?? false },
        LEGACY_LABELS.housing,
        "housing",
      ),
    );
  }
  if (raw?.discretionary) {
    items.push(
      normalizeItem(
        { ...raw.discretionary, essential: raw.discretionary.essential ?? false },
        LEGACY_LABELS.discretionary,
        "discretionary",
      ),
    );
  }

  return { items };
}

export function expenseItems(expenses: ExpenseBudget): ExpenseItem[] {
  return normalizeExpenseBudget(expenses).items;
}

export function activeExpenseItems(expenses: ExpenseBudget, age: number): ExpenseItem[] {
  return expenseItems(expenses).filter((item) => isExpenseActiveAtAge(item, age));
}

export function isExpenseActiveAtAge(item: ExpenseItem, age: number) {
  return (
    (item.startAge === undefined || age >= item.startAge) &&
    (item.endAge === undefined || age < item.endAge)
  );
}

export function expenseAgeRangeLabel(item: ExpenseItem, horizonAge: number) {
  const start = item.startAge === undefined ? "Retirement" : `Age ${item.startAge}`;
  const end = item.endAge === undefined ? horizonAge : item.endAge;
  return `${start} → ${end}`;
}

export function totalMonthlyExpenseAtAge(expenses: ExpenseBudget, age: number) {
  return activeExpenseItems(expenses, age).reduce((sum, item) => sum + item.monthlyAmount, 0);
}
