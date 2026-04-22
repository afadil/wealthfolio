import type { ExpenseBudget, ExpenseItem } from "../types";

const DEFAULT_ITEM_LABELS = ["Living", "Healthcare", "Housing", "Travel", "Other spending"];

function fallbackItemLabel(index: number) {
  return DEFAULT_ITEM_LABELS[index] ?? `Spending ${index + 1}`;
}

function cleanItemLabel(label: string | undefined, index: number) {
  if (!label || /^Spending\s+\d+$/i.test(label.trim())) {
    return fallbackItemLabel(index);
  }
  return label;
}

function normalizeOptionalAge(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

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

export function defaultExpenseItems(): ExpenseItem[] {
  return [
    createExpenseItem("Living", 3000, { id: "living", essential: true }),
    createExpenseItem("Healthcare", 300, { id: "healthcare", essential: true }),
  ];
}

function normalizeItem(
  raw: Partial<ExpenseItem>,
  fallbackLabel: string,
  fallbackId: string,
  index = 0,
) {
  return {
    id: raw.id || fallbackId,
    label: cleanItemLabel(raw.label || fallbackLabel, index),
    monthlyAmount: raw.monthlyAmount ?? 0,
    inflationRate:
      typeof raw.inflationRate === "number" && Number.isFinite(raw.inflationRate)
        ? raw.inflationRate
        : undefined,
    startAge: normalizeOptionalAge(raw.startAge),
    endAge: normalizeOptionalAge(raw.endAge),
    essential: raw.essential,
  };
}

export function normalizeExpenseBudget(raw: Partial<ExpenseBudget> | undefined): ExpenseBudget {
  if (Array.isArray(raw?.items)) {
    return {
      items: raw.items.map((item, index) =>
        normalizeItem(item, fallbackItemLabel(index), item.id || `expense-${index}`, index),
      ),
    };
  }

  return { items: defaultExpenseItems() };
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
  const startAge = normalizeOptionalAge(item.startAge);
  const endAge = normalizeOptionalAge(item.endAge);
  const start = startAge === undefined ? "Retirement" : `Age ${startAge}`;
  const end = endAge === undefined ? horizonAge : endAge;
  return `${start} → ${end}`;
}

export function totalMonthlyExpenseAtAge(expenses: ExpenseBudget, age: number) {
  return activeExpenseItems(expenses, age).reduce((sum, item) => sum + item.monthlyAmount, 0);
}
