import type { Holding, RetirementOverview, RetirementTrajectoryPoint } from "@/lib/types";
import { GoalFundingEditor } from "@/pages/goals/components/goal-funding-editor";
import {
  AnimatedToggleGroup,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  formatAmount,
  formatCompactAmount,
  formatPercent,
  Input,
  MoneyInput,
} from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CHART_COLORS,
  PROJECTED_CHART_COLORS,
  RetirementChart,
  type ChartPoint,
} from "../components/retirement-portfolio-chart";
import {
  COVERAGE_COLORS,
  RetirementCoverageChart,
  type CoverageProjectionPoint,
} from "../components/retirement-coverage-chart";
import { RetirementDashboardSkeleton } from "../components/retirement-dashboard-skeleton";
import { RetirementSnapshotTable } from "../components/retirement-snapshot-table";
import {
  ValueModeToggle,
  ValueModeTooltip,
  type ChartValueMode,
} from "../components/value-mode-toggle";
import { DEFAULT_DC_PAYOUT_ESTIMATE_RATE } from "../lib/constants";
import {
  deriveRetirementReadiness,
  resolveCoverageAnnualNominalValues,
  resolveFundedProgress,
  resolvePortfolioDrawRate,
} from "../lib/dashboard-math";
import {
  activeExpenseItems,
  createExpenseItem,
  expenseAgeRangeLabel,
  expenseItems,
  isExpenseActiveAtAge,
  totalMonthlyExpenseAtAge,
} from "../lib/expense-items";
import {
  ageFromBirthYearMonth,
  inferBirthYearMonthFromAge,
  normalizeDashboardRetirementPlan,
} from "../lib/plan-adapter";
import type {
  ExpenseItem,
  InvestmentAssumptions,
  RetirementIncomeStream,
  RetirementPlan,
  TaxProfile,
} from "../types";

type PlannerMode = "fire" | "traditional";

interface Props {
  plan: RetirementPlan;
  portfolioData: {
    holdings: Holding[];
    totalValue: number;
    isLoading: boolean;
    error: Error | null;
  };
  isLoading: boolean;
  plannerMode?: PlannerMode;
  onSavePlan?: (plan: RetirementPlan, plannerMode?: PlannerMode) => void;
  onNavigateToTab?: (tab: string) => void;
  retirementOverview?: RetirementOverview;
  goalId?: string;
  dcLinkedAccountIds?: string[];
}

function modeLabel(mode: PlannerMode) {
  return {
    target: mode === "fire" ? "FIRE Target" : "Retirement Target",
    targetNet: mode === "fire" ? "FIRE Target (net)" : "Retirement Target (net)",
    estAge: mode === "fire" ? "Projected FI Age" : "Target Retirement Age",
    progress: mode === "fire" ? "FIRE Progress" : "Retirement Progress",
    coast: "Coast FIRE",
    budgetAt: "Retirement spending coverage",
    prefix: mode === "fire" ? "FIRE" : "Retirement",
    targetAge: mode === "fire" ? "Desired retirement age" : "Retirement age",
    horizonAge: mode === "fire" ? "Plan through age" : "Life expectancy",
  };
}

function currencySymbol(currency: string) {
  try {
    return (
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency || "USD",
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0,
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? "$"
    );
  } catch {
    return "$";
  }
}

function boundedInflationFactor(rate: number, years: number) {
  return Math.max(0.01, Math.pow(1 + rate, Math.max(0, years)));
}

type CoverageView = "at-retirement" | "over-time";

// ─── Chart types & helpers ───────────────────────────────────────

// Warm olive palette for income streams (coverage bar + row dots).
// Values come from --fi-stream-N CSS variables which swap between light/dark themes.
const INCOME_STREAM_COLORS = [
  "var(--fi-stream-1)",
  "var(--fi-stream-2)",
  "var(--fi-stream-3)",
  "var(--fi-stream-4)",
  "var(--fi-stream-5)",
];

function projectedAnnualExpenseNominalAtAge(plan: RetirementPlan, age: number) {
  const yearsFromNow = Math.max(0, age - plan.personal.currentAge);
  return activeExpenseItems(plan.expenses, age).reduce((sum, item) => {
    const rate = item.inflationRate ?? plan.investment.inflationRate;
    return sum + item.monthlyAmount * 12 * Math.pow(1 + rate, yearsFromNow);
  }, 0);
}

function projectedDcMonthlyPayout(
  stream: RetirementIncomeStream,
  currentAge: number,
  retirementAge: number,
  defaultAccumulationReturn: number,
) {
  if (stream.startAge <= currentAge) {
    const fallback = (Math.max(0, stream.currentValue ?? 0) * DEFAULT_DC_PAYOUT_ESTIMATE_RATE) / 12;
    return Math.max(0, stream.monthlyAmount ?? fallback);
  }
  const totalYears = Math.max(0, stream.startAge - currentAge);
  const contribYears = Math.max(0, Math.min(stream.startAge, retirementAge) - currentAge);
  const growthOnlyYears = totalYears - contribYears;
  const r = stream.accumulationReturn ?? defaultAccumulationReturn;
  const initial = stream.currentValue ?? 0;
  const monthly = stream.monthlyContribution ?? 0;
  const fvLump = initial * Math.pow(1 + r, totalYears);
  const monthlyGrowth = Math.pow(Math.max(0.01, 1 + r), 1 / 12);
  const monthlyReturn = monthlyGrowth - 1;
  const annualContributionEndValue =
    Math.abs(monthlyReturn) <= 1e-9
      ? monthly * 12
      : (monthly * (Math.pow(monthlyGrowth, 12) - 1)) / monthlyReturn;
  const fvAnnuityAtStop =
    r > 1e-9
      ? (annualContributionEndValue * (Math.pow(1 + r, contribYears) - 1)) / r
      : monthly * 12 * contribYears;
  const fvAnnuity = fvAnnuityAtStop * Math.pow(1 + r, growthOnlyYears);
  return ((fvLump + fvAnnuity) * DEFAULT_DC_PAYOUT_ESTIMATE_RATE) / 12;
}

function projectedAnnualIncomeNominalAtAge(
  plan: RetirementPlan,
  age: number,
  retirementAge: number,
) {
  const yearsFromNow = Math.max(0, age - plan.personal.currentAge);

  return plan.incomeStreams.reduce((sum, stream) => {
    if (age < stream.startAge) return sum;

    const baseMonthly =
      stream.streamType === "dc"
        ? projectedDcMonthlyPayout(
            stream,
            plan.personal.currentAge,
            retirementAge,
            plan.investment.preRetirementAnnualReturn,
          )
        : (stream.monthlyAmount ?? 0);
    const annual = baseMonthly * 12;

    if (stream.annualGrowthRate !== undefined) {
      return sum + annual * Math.pow(1 + stream.annualGrowthRate, yearsFromNow);
    }
    if (stream.adjustForInflation) {
      return sum + annual * Math.pow(1 + plan.investment.inflationRate, yearsFromNow);
    }
    return sum + annual;
  }, 0);
}

function incomeStreamMonthlyAmount(plan: RetirementPlan, stream: RetirementIncomeStream) {
  if (stream.streamType === "dc") {
    return projectedDcMonthlyPayout(
      stream,
      plan.personal.currentAge,
      plan.personal.targetRetirementAge,
      plan.investment.preRetirementAnnualReturn,
    );
  }
  return stream.monthlyAmount ?? 0;
}

function incomeAgeRangeLabel(stream: RetirementIncomeStream, horizonAge: number) {
  return `Age ${stream.startAge} → ${horizonAge}`;
}

function isIncomeActiveAtAge(stream: RetirementIncomeStream, age: number) {
  return age >= stream.startAge;
}

function coverageTimingLabel(
  isActive: boolean,
  startAge: number | undefined,
  endAge: number | undefined,
  age: number,
) {
  if (isActive) return null;
  if (startAge !== undefined && age < startAge) return `Starts at ${startAge}`;
  if (endAge !== undefined && age >= endAge) return `Ended at ${endAge}`;
  return "Not active";
}

// ─── Sidebar cards ──────────────────────────────────────────────

// ─── Sidebar Configurator ─────────────────────────────────────────────────────

/** Read-only label:value row */
function InfoLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/70 hover:text-foreground inline-flex rounded-full transition-colors"
            aria-label={`More info about ${label}`}
          >
            <Icons.Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{children}</TooltipContent>
      </Tooltip>
    </span>
  );
}

function ConfigRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-1">
      <span className="text-foreground/85 text-sm">{label}</span>
      <span className="text-right text-sm font-semibold tabular-nums">{children}</span>
    </div>
  );
}

/** Sidebar monthly row: name + age-range meta on the left, big amount + /mo on the right. */
function SidebarMonthlyRow({
  label,
  meta,
  amount,
  currency,
}: {
  label: string;
  meta?: string;
  amount: number;
  currency: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
      <div className="min-w-0">
        <div className="text-foreground text-sm font-semibold leading-tight">{label}</div>
        {meta && <div className="text-muted-foreground mt-0.5 text-xs leading-tight">{meta}</div>}
      </div>
      <div className="whitespace-nowrap tabular-nums">
        <span className="text-foreground text-sm font-semibold">
          {formatAmount(amount, currency)}
        </span>
        <span className="text-muted-foreground text-xs">/mo</span>
      </div>
    </div>
  );
}

/** Sidebar totals row: uppercase tracked label on the left, amount + /mo on the right. */
function SidebarTotalRow({ amount, currency }: { amount: number; currency: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-muted-foreground text-xs uppercase tracking-[0.15em]">Total</span>
      <div className="whitespace-nowrap tabular-nums">
        <span className="text-foreground text-sm font-semibold">
          {formatAmount(amount, currency)}
        </span>
        <span className="text-muted-foreground text-xs">/mo</span>
      </div>
    </div>
  );
}

/** A lever: title + hint + compact readout input + full-width slider. */
function LeverRow({
  label,
  hint,
  kind = "number",
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  format,
}: {
  label: React.ReactNode;
  hint?: string;
  kind?: "money" | "number";
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  format: (v: number) => string;
}) {
  const clampedValue = Math.min(max, Math.max(min, value));
  const pct = max > min ? ((clampedValue - min) / (max - min)) * 100 : 0;
  const inputScale = suffix === "%" ? 100 : 1;
  const clampInputValue = (next: number) =>
    Math.min(max * inputScale, Math.max(min * inputScale, next)) / inputScale;
  const [draftValue, setDraftValue] = useState(format(value));
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    if (!inputFocused) {
      setDraftValue(format(value));
    }
  }, [format, inputFocused, value]);

  const commitDraftValue = () => {
    const raw = draftValue.trim();
    if (!raw) {
      setDraftValue(format(value));
      return;
    }

    const parsed = parseFloat(raw.replace(/,/g, ""));
    if (Number.isNaN(parsed)) {
      setDraftValue(format(value));
      return;
    }

    const next = clampInputValue(parsed);
    onChange(next);
    setDraftValue(format(next));
  };

  return (
    <div className="py-4 first:pt-1 last:pb-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-foreground text-sm font-semibold leading-tight">{label}</div>
          {hint && <div className="text-muted-foreground mt-1 text-xs leading-tight">{hint}</div>}
        </div>
        <div className="bg-muted/70 flex h-8 w-32 items-center gap-1 rounded-md border px-2.5">
          {prefix && <span className="text-muted-foreground text-xs tabular-nums">{prefix}</span>}
          {kind === "money" ? (
            <MoneyInput
              value={value}
              onValueChange={(next) => onChange(Math.min(max, Math.max(min, next ?? 0)))}
              thousandSeparator
              maxDecimalPlaces={0}
              className="text-foreground h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-right text-sm tabular-nums shadow-none outline-none ring-0 focus-visible:ring-0"
            />
          ) : (
            <input
              type="text"
              inputMode={suffix === "%" ? "decimal" : "numeric"}
              value={draftValue}
              onFocus={() => {
                setInputFocused(true);
                setDraftValue(format(value));
              }}
              onChange={(e) => {
                const next = e.target.value;
                if (/^-?\d*([.,]\d*)?$/.test(next)) {
                  setDraftValue(next);
                }
              }}
              onBlur={() => {
                setInputFocused(false);
                commitDraftValue();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  setDraftValue(format(value));
                  e.currentTarget.blur();
                }
              }}
              className="text-foreground w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none"
            />
          )}
          {suffix && <span className="text-muted-foreground text-xs tabular-nums">{suffix}</span>}
        </div>
      </div>
      <input
        type="range"
        value={clampedValue}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="lever-slider mt-3 w-full"
        style={{ ["--lever-pct" as string]: `${pct}%` }}
      />
    </div>
  );
}

function pctOfTotal(value: number, total: number) {
  return total > 0 ? ((value / total) * 100).toFixed(0) + "%" : "0%";
}

function sliderMaxFor(value: number, baseMax: number, increment: number) {
  return Math.max(baseMax, Math.ceil(value / increment) * increment + increment);
}

function AgeBoundInput({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  placeholder: string;
  min: number;
  max: number;
}) {
  const [draftValue, setDraftValue] = useState(value === undefined ? "" : String(value));
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    if (!inputFocused) {
      setDraftValue(value === undefined ? "" : String(value));
    }
  }, [inputFocused, value]);

  const commitDraftValue = () => {
    const raw = draftValue.trim();
    if (!raw) {
      onChange(undefined);
      setDraftValue("");
      return;
    }

    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setDraftValue(value === undefined ? "" : String(value));
      return;
    }

    const next = Math.min(max, Math.max(min, parsed));
    onChange(next);
    setDraftValue(String(next));
  };

  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={draftValue}
        placeholder={placeholder}
        onFocus={() => {
          setInputFocused(true);
          setDraftValue(value === undefined ? "" : String(value));
        }}
        onChange={(e) => {
          const next = e.target.value;
          if (/^\d*$/.test(next)) {
            setDraftValue(next);
          }
        }}
        onBlur={() => {
          setInputFocused(false);
          commitDraftValue();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraftValue(value === undefined ? "" : String(value));
            e.currentTarget.blur();
          }
        }}
        className="bg-muted/70 text-foreground h-8 w-full rounded-md border px-2.5 text-right text-sm tabular-nums outline-none placeholder:text-left placeholder:text-xs"
      />
    </label>
  );
}

function PercentOverrideInput({
  value,
  placeholder,
  onChange,
}: {
  value?: number;
  placeholder: string;
  onChange: (value: number | undefined) => void;
}) {
  const formatDraft = useCallback(
    (next?: number) => (next === undefined ? "" : (next * 100).toFixed(1)),
    [],
  );
  const [draft, setDraft] = useState(formatDraft(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatDraft(value));
  }, [focused, formatDraft, value]);

  return (
    <div className="bg-muted/70 flex h-8 w-full items-center gap-1 rounded-md border px-2.5">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDraft(formatDraft(value));
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/,/g, "");
          setDraft(raw);
          if (!raw.trim()) {
            onChange(undefined);
            return;
          }
          const parsed = parseFloat(raw);
          if (!Number.isNaN(parsed)) {
            onChange(Math.min(50, Math.max(0, parsed)) / 100);
          }
        }}
        className="text-foreground min-w-0 flex-1 bg-transparent text-right text-sm tabular-nums outline-none placeholder:text-left placeholder:text-xs"
      />
      <span className="text-muted-foreground text-xs tabular-nums">%</span>
    </div>
  );
}

/** A single sidebar card: title + edit button → read rows or edit fields */
function SidebarCard({
  kicker,
  title,
  editing,
  onEdit,
  onSave,
  onCancel,
  dirty,
  readContent,
  editContent,
}: {
  kicker?: string;
  title: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  dirty: boolean;
  readContent: React.ReactNode;
  editContent: React.ReactNode;
}) {
  const renderEditActions = () => (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="sm" className="h-7 text-xs" onClick={onSave} disabled={!dirty}>
        Save
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between pb-4">
        <div className="min-w-0">
          {kicker && (
            <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-[0.15em]">
              {kicker}
            </div>
          )}
          <CardTitle className="text-md leading-none tracking-tight">{title}</CardTitle>
        </div>
        {editing ? (
          renderEditActions()
        ) : (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${title}`}
            className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1.5 text-sm transition-colors"
          >
            <Icons.Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <div className="space-y-2.5">{editContent}</div>
            <div className="border-border flex justify-end border-t pt-3">
              {renderEditActions()}
            </div>
          </div>
        ) : (
          readContent
        )}
      </CardContent>
    </Card>
  );
}

/** Complete sidebar configurator — each section is its own card */
function SidebarConfigurator({
  plan,
  currency,
  plannerMode,
  onSavePlan,
  retirementOverview,
  goalId,
  dcLinkedAccountIds,
}: {
  plan: RetirementPlan;
  currency: string;
  plannerMode: PlannerMode;
  onSavePlan?: (plan: RetirementPlan, plannerMode?: PlannerMode) => void;
  retirementOverview?: RetirementOverview;
  goalId?: string;
  dcLinkedAccountIds?: string[];
}) {
  const [draft, setDraft] = useState<RetirementPlan>(() => structuredClone(plan));
  const [draftMode, setDraftMode] = useState<PlannerMode>(plannerMode);
  const [dirty, setDirty] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [expandedIncomeId, setExpandedIncomeId] = useState<string | null>(null);
  const L = modeLabel(draftMode);
  const moneyPrefix = currencySymbol(currency);

  const planKey = JSON.stringify(plan);
  useEffect(() => {
    setDraft(structuredClone(plan));
    setDraftMode(plannerMode);
    setDirty(false);
    setEditingSection(null);
    setExpandedExpenseId(null);
    setExpandedIncomeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, plannerMode]);

  const update = useCallback((updater: (d: RetirementPlan) => RetirementPlan) => {
    setDraft((prev) => updater(prev));
    setDirty(true);
  }, []);

  const saveDraft = useCallback(() => {
    onSavePlan?.(normalizeDashboardRetirementPlan(draft), draftMode);
    setDirty(false);
    setEditingSection(null);
    setExpandedExpenseId(null);
    setExpandedIncomeId(null);
  }, [draft, draftMode, onSavePlan]);

  const cancelEdit = useCallback(() => {
    setDraft(structuredClone(plan));
    setDraftMode(plannerMode);
    setDirty(false);
    setEditingSection(null);
    setExpandedExpenseId(null);
    setExpandedIncomeId(null);
  }, [plan, plannerMode]);

  // Shorthand updaters
  const setPersonal = <K extends keyof RetirementPlan["personal"]>(
    key: K,
    val: RetirementPlan["personal"][K],
  ) => update((d) => ({ ...d, personal: { ...d.personal, [key]: val } }));

  const setInvestment = <K extends keyof InvestmentAssumptions>(
    key: K,
    val: InvestmentAssumptions[K],
  ) => update((d) => ({ ...d, investment: { ...d.investment, [key]: val } }));

  const setPlannerModeDraft = (mode: PlannerMode) => {
    setDraftMode(mode);
    setDirty(true);
  };

  const setTax = <K extends keyof TaxProfile>(key: K, val: TaxProfile[K]) =>
    update((d) => ({
      ...d,
      tax: {
        taxableWithdrawalRate: 0,
        taxDeferredWithdrawalRate: 0,
        taxFreeWithdrawalRate: 0,
        ...d.tax,
        [key]: val,
      },
    }));

  const updateExpenseItem = (id: string, patch: Partial<ExpenseItem>) =>
    update((d) => ({
      ...d,
      expenses: {
        items: expenseItems(d.expenses).map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    }));

  const addExpenseItem = (label: string, patch: Partial<ExpenseItem> = {}) => {
    const item = createExpenseItem(label, 0, patch);
    update((d) => ({
      ...d,
      expenses: {
        items: [...expenseItems(d.expenses), item],
      },
    }));
    setExpandedExpenseId(item.id);
  };

  const removeExpenseItem = (id: string) => {
    update((d) => ({
      ...d,
      expenses: { items: expenseItems(d.expenses).filter((item) => item.id !== id) },
    }));
    setExpandedExpenseId((current) => (current === id ? null : current));
  };

  const addStream = (preset?: Partial<RetirementIncomeStream>) => {
    const id = crypto.randomUUID?.() ?? `stream-${Date.now()}`;
    update((d) => ({
      ...d,
      incomeStreams: [
        ...d.incomeStreams,
        {
          id,
          label: preset?.label ?? `Income ${d.incomeStreams.length + 1}`,
          streamType: "db" as const,
          startAge: preset?.startAge ?? d.personal.targetRetirementAge,
          adjustForInflation: preset?.adjustForInflation ?? true,
          monthlyAmount: preset?.monthlyAmount ?? 0,
          ...preset,
        },
      ],
    }));
    setEditingSection("income");
    setExpandedIncomeId(id);
  };

  const updateStream = (id: string, patch: Partial<RetirementIncomeStream>) =>
    update((d) => ({
      ...d,
      incomeStreams: d.incomeStreams.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const removeStream = (id: string) => {
    update((d) => ({ ...d, incomeStreams: d.incomeStreams.filter((s) => s.id !== id) }));
    setExpandedIncomeId((current) => (current === id ? null : current));
  };

  const taxBucketBalances = retirementOverview?.taxBucketBalances;
  const taxBucketTotal = taxBucketBalances
    ? taxBucketBalances.taxable + taxBucketBalances.taxDeferred + taxBucketBalances.taxFree
    : 0;
  const averageWithdrawalTaxRate =
    taxBucketBalances && taxBucketTotal > 0
      ? (taxBucketBalances.taxable * (draft.tax?.taxableWithdrawalRate ?? 0) +
          taxBucketBalances.taxDeferred * (draft.tax?.taxDeferredWithdrawalRate ?? 0) +
          taxBucketBalances.taxFree * (draft.tax?.taxFreeWithdrawalRate ?? 0)) /
        taxBucketTotal
      : 0;
  const effectivePreRetirementReturn =
    draft.investment.preRetirementAnnualReturn - draft.investment.annualInvestmentFeeRate;
  const effectiveRetirementReturn =
    draft.investment.retirementAnnualReturn - draft.investment.annualInvestmentFeeRate;
  const allTaxRatesZero =
    (draft.tax?.taxableWithdrawalRate ?? 0) === 0 &&
    (draft.tax?.taxDeferredWithdrawalRate ?? 0) === 0 &&
    (draft.tax?.taxFreeWithdrawalRate ?? 0) === 0;

  const birthYearMonth =
    draft.personal.birthYearMonth ?? inferBirthYearMonthFromAge(draft.personal.currentAge);
  const maxBirthYearMonth = inferBirthYearMonthFromAge(0);
  const updateBirthYearMonth = (nextBirthYearMonth: string) => {
    if (!nextBirthYearMonth) return;
    const nextAge = ageFromBirthYearMonth(nextBirthYearMonth) ?? draft.personal.currentAge;
    update((d) => {
      const targetRetirementAge = Math.max(nextAge + 1, d.personal.targetRetirementAge);
      const planningHorizonAge = Math.max(targetRetirementAge + 1, d.personal.planningHorizonAge);
      return {
        ...d,
        personal: {
          ...d.personal,
          birthYearMonth: nextBirthYearMonth,
          currentAge: nextAge,
          targetRetirementAge,
          planningHorizonAge,
        },
      };
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Plan ── */}
      <SidebarCard
        kicker="Plan"
        title="Plan inputs"
        editing={editingSection === "plan"}
        onEdit={() => setEditingSection("plan")}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={
          <div className="divide-border divide-y">
            <ConfigRow label="Plan type">{draftMode === "fire" ? "FIRE" : "Traditional"}</ConfigRow>
            <ConfigRow label="Current age">{draft.personal.currentAge}</ConfigRow>
            <ConfigRow label={L.targetAge}>{draft.personal.targetRetirementAge}</ConfigRow>
            <ConfigRow label={L.horizonAge}>{draft.personal.planningHorizonAge}</ConfigRow>
            <ConfigRow label="Monthly contribution until retirement">
              {formatAmount(draft.investment.monthlyContribution, currency)}
            </ConfigRow>
          </div>
        }
        editContent={
          <div className="divide-border -my-1 divide-y">
            <div className="space-y-3 py-4 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Plan type</p>
                  <p className="text-muted-foreground mt-1 max-w-[260px] text-xs leading-snug">
                    Choose whether your target age is a traditional retirement date or the age you
                    want to reach financial independence.
                  </p>
                </div>
                <AnimatedToggleGroup<PlannerMode>
                  value={draftMode}
                  onValueChange={setPlannerModeDraft}
                  items={[
                    { value: "fire", label: "FIRE" },
                    { value: "traditional", label: "Traditional" },
                  ]}
                  size="xs"
                  rounded="md"
                  className="bg-muted/30 shrink-0 border"
                />
              </div>
              {draftMode !== plannerMode && (
                <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                  This changes the calculation model only.{" "}
                  {draftMode === "traditional"
                    ? "Your desired retirement age becomes a fixed retirement start age."
                    : "Your retirement age becomes the desired FI age; the planner will search for the first sustainable age."}
                </p>
              )}
            </div>
            <div className="py-4 first:pt-1 last:pb-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-foreground text-sm font-semibold leading-tight">
                    Birth month
                  </div>
                  <div className="text-muted-foreground mt-1 max-w-[240px] text-xs leading-tight">
                    Keeps your age updated automatically.
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <input
                    type="month"
                    value={birthYearMonth}
                    max={maxBirthYearMonth}
                    onChange={(e) => updateBirthYearMonth(e.target.value)}
                    className="bg-muted/70 text-foreground h-8 w-36 rounded-md border px-2.5 text-right text-sm tabular-nums outline-none"
                  />
                  <span className="text-muted-foreground text-xs">
                    Current age {draft.personal.currentAge}
                  </span>
                </div>
              </div>
            </div>
            <LeverRow
              label={draftMode === "fire" ? "Desired retirement age" : "Retirement age"}
              hint={
                draftMode === "fire"
                  ? "Age you want to become financially independent."
                  : "Age you want to retire."
              }
              value={draft.personal.targetRetirementAge}
              onChange={(v) => {
                const targetRetirementAge = Math.round(v);
                update((d) => ({
                  ...d,
                  personal: {
                    ...d.personal,
                    targetRetirementAge: Math.min(
                      targetRetirementAge,
                      d.personal.planningHorizonAge - 1,
                    ),
                  },
                }));
              }}
              min={draft.personal.currentAge + 1}
              max={110}
              step={1}
              format={(v) => String(Math.round(v))}
            />
            <LeverRow
              label={L.horizonAge}
              hint="Age the plan should cover through."
              value={draft.personal.planningHorizonAge}
              onChange={(v) =>
                setPersonal(
                  "planningHorizonAge",
                  Math.max(Math.round(v), draft.personal.targetRetirementAge + 1),
                )
              }
              min={draft.personal.currentAge + 2}
              max={110}
              step={1}
              format={(v) => String(Math.round(v))}
            />
            <LeverRow
              label="Monthly contribution"
              hint="How much you add each month until retirement."
              kind="money"
              value={draft.investment.monthlyContribution}
              onChange={(v) => setInvestment("monthlyContribution", v)}
              min={0}
              max={sliderMaxFor(draft.investment.monthlyContribution, 20000, 5000)}
              step={100}
              prefix={moneyPrefix}
              format={(v) => String(Math.round(v))}
            />
            <LeverRow
              label="Return before retirement"
              hint="Expected yearly return while you are saving."
              value={draft.investment.preRetirementAnnualReturn}
              onChange={(v) => setInvestment("preRetirementAnnualReturn", v)}
              min={0}
              max={0.12}
              step={0.001}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
            <LeverRow
              label="Return during retirement"
              hint="Expected yearly return after withdrawals begin."
              value={draft.investment.retirementAnnualReturn}
              onChange={(v) => setInvestment("retirementAnnualReturn", v)}
              min={0}
              max={0.1}
              step={0.001}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
            <LeverRow
              label="Annual investment fee"
              hint="Estimated yearly portfolio fees."
              value={draft.investment.annualInvestmentFeeRate}
              onChange={(v) => setInvestment("annualInvestmentFeeRate", v)}
              min={0}
              max={0.03}
              step={0.0005}
              suffix="%"
              format={(v) => (v * 100).toFixed(2)}
            />
            <LeverRow
              label="Inflation"
              hint="Expected yearly increase in prices."
              value={draft.investment.inflationRate}
              onChange={(v) => setInvestment("inflationRate", v)}
              min={0}
              max={0.06}
              step={0.001}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
          </div>
        }
      />

      {/* ── Expenses ── */}
      <SidebarCard
        kicker="Spending"
        title="Retirement Spending"
        editing={editingSection === "expenses"}
        onEdit={() => {
          setEditingSection("expenses");
          setExpandedExpenseId(null);
        }}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={(() => {
          const retireAge = draft.personal.targetRetirementAge;
          const horizonAge = draft.personal.planningHorizonAge;
          const items = expenseItems(draft.expenses);
          const total = totalMonthlyExpenseAtAge(draft.expenses, retireAge);
          if (items.length === 0) {
            return (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">No retirement spending configured</p>
                <SidebarTotalRow amount={0} currency={currency} />
              </div>
            );
          }
          return (
            <div className="divide-border divide-y">
              {items.map((it) => (
                <SidebarMonthlyRow
                  key={it.id}
                  label={it.label}
                  meta={[
                    expenseAgeRangeLabel(it, horizonAge),
                    (it.essential ?? true) ? "Must-have" : "Flexible",
                    it.inflationRate !== undefined
                      ? `${(it.inflationRate * 100).toFixed(1)}% inflation`
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  amount={it.monthlyAmount}
                  currency={currency}
                />
              ))}
              <SidebarTotalRow amount={total} currency={currency} />
            </div>
          );
        })()}
        editContent={
          <div className="space-y-3">
            {expenseItems(draft.expenses).map((item) => {
              const expanded = expandedExpenseId === item.id;
              const meta = [
                expenseAgeRangeLabel(item, draft.personal.planningHorizonAge),
                (item.essential ?? true) ? "Must-have" : "Flexible",
                item.inflationRate !== undefined
                  ? `${(item.inflationRate * 100).toFixed(1)}% inflation`
                  : undefined,
              ].join(" · ");

              return (
                <div
                  key={item.id}
                  className={`overflow-hidden rounded-lg border transition-colors ${
                    expanded ? "bg-muted/20" : "bg-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedExpenseId(expanded ? null : item.id)}
                      className="hover:bg-muted/30 flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors"
                      aria-expanded={expanded}
                    >
                      <Icons.ChevronDown
                        className={`text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block truncate text-sm font-semibold">
                          {item.label || "Spending"}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block truncate text-[11px]">
                          {meta}
                        </span>
                      </span>
                      <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
                        {formatAmount(item.monthlyAmount, currency)}
                        <span className="text-muted-foreground text-xs font-normal">/mo</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeExpenseItem(item.id)}
                      className="text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground mr-2 rounded-md p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Remove ${item.label || "spending item"}`}
                    >
                      <Icons.X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {expanded && (
                    <div className="space-y-4 border-t px-3 pb-3 pt-3">
                      <Input
                        value={item.label}
                        onChange={(e) => updateExpenseItem(item.id, { label: e.target.value })}
                        placeholder="Spending name"
                        className="bg-muted/70 h-8 px-2 text-sm font-semibold shadow-none"
                      />
                      <LeverRow
                        label="Monthly spending"
                        kind="money"
                        value={item.monthlyAmount}
                        onChange={(v) => updateExpenseItem(item.id, { monthlyAmount: v })}
                        min={0}
                        max={sliderMaxFor(item.monthlyAmount, 20000, 5000)}
                        step={100}
                        prefix={moneyPrefix}
                        suffix="/mo"
                        format={(v) => String(Math.round(v))}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <AgeBoundInput
                          label="From age"
                          value={item.startAge}
                          onChange={(v) => updateExpenseItem(item.id, { startAge: v })}
                          placeholder="Retirement"
                          min={draft.personal.currentAge}
                          max={draft.personal.planningHorizonAge}
                        />
                        <AgeBoundInput
                          label="To age"
                          value={item.endAge}
                          onChange={(v) => updateExpenseItem(item.id, { endAge: v })}
                          placeholder={`${draft.personal.planningHorizonAge}`}
                          min={draft.personal.currentAge + 1}
                          max={draft.personal.planningHorizonAge}
                        />
                      </div>
                      <div className="bg-muted/20 grid gap-3 rounded-lg border p-3">
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3">
                          <div className="min-w-0">
                            <div className="text-foreground text-xs font-semibold">
                              Spending type
                            </div>
                            <div className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
                              Must-have spending is protected before flexible spending.
                            </div>
                          </div>
                          <AnimatedToggleGroup<"essential" | "flexible">
                            variant="secondary"
                            size="xs"
                            items={[
                              { value: "essential", label: "Must-have" },
                              { value: "flexible", label: "Flexible" },
                            ]}
                            value={(item.essential ?? true) ? "essential" : "flexible"}
                            onValueChange={(value) =>
                              updateExpenseItem(item.id, { essential: value === "essential" })
                            }
                          />
                        </div>
                        <div className="border-border grid gap-2 border-t pt-3 sm:grid-cols-[1fr_8rem] sm:items-center sm:gap-3">
                          <div className="min-w-0">
                            <div className="text-foreground text-xs font-semibold">
                              Inflation override
                            </div>
                            <div className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
                              Leave blank to use plan inflation.
                            </div>
                          </div>
                          <PercentOverrideInput
                            value={item.inflationRate}
                            placeholder={`Plan ${(draft.investment.inflationRate * 100).toFixed(1)}`}
                            onChange={(value) =>
                              updateExpenseItem(item.id, { inflationRate: value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {expenseItems(draft.expenses).length === 0 && (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs leading-relaxed">
                No spending items. Add a preset below, then adjust the amount and dates.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-3">
              <button
                className="text-muted-foreground hover:text-foreground rounded-md border border-dashed py-1.5 text-xs transition-colors"
                onClick={() => addExpenseItem("Living", { essential: true })}
              >
                + Living
              </button>
              <button
                className="text-muted-foreground hover:text-foreground rounded-md border border-dashed py-1.5 text-xs transition-colors"
                onClick={() => addExpenseItem("Healthcare", { essential: true })}
              >
                + Healthcare
              </button>
              <button
                className="text-muted-foreground hover:text-foreground rounded-md border border-dashed py-1.5 text-xs transition-colors"
                onClick={() => addExpenseItem("Housing", { essential: false })}
              >
                + Housing
              </button>
              <button
                className="text-muted-foreground hover:text-foreground rounded-md border border-dashed py-1.5 text-xs transition-colors"
                onClick={() => addExpenseItem("Travel", { essential: false })}
              >
                + Travel
              </button>
              <button
                className="text-muted-foreground hover:text-foreground col-span-2 rounded-md border border-dashed py-1.5 text-xs transition-colors"
                onClick={() => addExpenseItem("Other spending", { essential: false })}
              >
                + Other
              </button>
            </div>
          </div>
        }
      />

      {/* ── Income Streams ── */}
      <SidebarCard
        kicker="Income"
        title="Retirement Income"
        editing={editingSection === "income"}
        onEdit={() => {
          setEditingSection("income");
          setExpandedIncomeId(null);
        }}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={
          draft.incomeStreams.length > 0 ? (
            <div className="space-y-2.5">
              <div className="divide-border divide-y">
                {draft.incomeStreams.map((s) => (
                  <SidebarMonthlyRow
                    key={s.id}
                    label={s.label || "Stream"}
                    meta={`${s.streamType === "dc" ? "Pension fund" : "Income"} · Age ${s.startAge} → ${draft.personal.planningHorizonAge}`}
                    amount={incomeStreamMonthlyAmount(draft, s)}
                    currency={currency}
                  />
                ))}
                <SidebarTotalRow
                  amount={draft.incomeStreams.reduce(
                    (sum, s) => sum + incomeStreamMonthlyAmount(draft, s),
                    0,
                  )}
                  currency={currency}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">No retirement income configured</p>
              <p className="text-muted-foreground rounded-md border border-dashed px-2.5 py-2 text-xs leading-relaxed">
                Public pensions (e.g. CPP/OAS in Canada, Social Security in the US) aren't included
                automatically. Add them here if you want them in the projection.
              </p>
            </div>
          )
        }
        editContent={
          <div className="space-y-3">
            {draft.incomeStreams.map((s) => {
              const expanded = expandedIncomeId === s.id;
              const amount = incomeStreamMonthlyAmount(draft, s);
              const growthMeta =
                s.streamType === "dc"
                  ? "Balance-derived payout"
                  : s.annualGrowthRate !== undefined
                    ? `${(s.annualGrowthRate * 100).toFixed(1)}% growth`
                    : s.adjustForInflation
                      ? "Inflation indexed"
                      : "Fixed nominal";
              const meta = [
                `Age ${s.startAge} → ${draft.personal.planningHorizonAge}`,
                growthMeta,
              ].join(" · ");

              return (
                <div
                  key={s.id}
                  className={`overflow-hidden rounded-lg border transition-colors ${
                    expanded ? "bg-muted/20" : "bg-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedIncomeId(expanded ? null : s.id)}
                      className="hover:bg-muted/30 flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors"
                      aria-expanded={expanded}
                    >
                      <Icons.ChevronDown
                        className={`text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block truncate text-sm font-semibold">
                          {s.label || "Income"}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block truncate text-[11px]">
                          {meta}
                        </span>
                      </span>
                      <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
                        {formatAmount(amount, currency)}
                        <span className="text-muted-foreground text-xs font-normal">/mo</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStream(s.id)}
                      className="text-muted-foreground hover:text-foreground mr-2 rounded-md p-1 transition-colors"
                      aria-label={`Remove ${s.label || "retirement income"}`}
                    >
                      <Icons.X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {expanded && (
                    <div className="space-y-4 border-t px-3 pb-3 pt-3">
                      <Input
                        value={s.label}
                        onChange={(e) => updateStream(s.id, { label: e.target.value })}
                        placeholder="Income name"
                        className="bg-muted/70 h-8 px-2 text-sm font-semibold shadow-none"
                      />
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3">
                        <div className="min-w-0">
                          <div className="text-foreground text-xs font-semibold">Income type</div>
                          <div className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
                            Use income for pensions paid monthly. Use fund for balances that convert
                            to an estimated payout (e.g. RRSP/RRIF in Canada, 401(k)/IRA in the US).
                          </div>
                        </div>
                        <AnimatedToggleGroup<"db" | "dc">
                          variant="secondary"
                          size="xs"
                          items={[
                            { value: "db", label: "Income" },
                            { value: "dc", label: "Fund" },
                          ]}
                          value={s.streamType}
                          onValueChange={(value) =>
                            updateStream(s.id, {
                              streamType: value,
                              currentValue: value === "dc" ? (s.currentValue ?? 0) : s.currentValue,
                              monthlyContribution:
                                value === "dc"
                                  ? (s.monthlyContribution ?? 0)
                                  : s.monthlyContribution,
                              accumulationReturn:
                                value === "dc"
                                  ? (s.accumulationReturn ??
                                    draft.investment.preRetirementAnnualReturn)
                                  : s.accumulationReturn,
                            })
                          }
                        />
                      </div>
                      <div className="divide-border divide-y">
                        {s.streamType !== "dc" && (
                          <LeverRow
                            label="Monthly income after tax"
                            kind="money"
                            value={s.monthlyAmount ?? 0}
                            onChange={(v) => updateStream(s.id, { monthlyAmount: v })}
                            min={0}
                            max={sliderMaxFor(amount, 10000, 2500)}
                            step={50}
                            prefix={moneyPrefix}
                            suffix="/mo"
                            format={(v) => String(Math.round(v))}
                          />
                        )}
                        {s.streamType === "dc" && (
                          <>
                            <LeverRow
                              label="Current fund balance"
                              kind="money"
                              value={s.currentValue ?? 0}
                              onChange={(v) => updateStream(s.id, { currentValue: v })}
                              min={0}
                              max={sliderMaxFor(s.currentValue ?? 0, 2_000_000, 250_000)}
                              step={1000}
                              prefix={moneyPrefix}
                              format={(v) => String(Math.round(v))}
                            />
                            <LeverRow
                              label="Monthly fund contribution"
                              kind="money"
                              value={s.monthlyContribution ?? 0}
                              onChange={(v) => updateStream(s.id, { monthlyContribution: v })}
                              min={0}
                              max={sliderMaxFor(s.monthlyContribution ?? 0, 10000, 2500)}
                              step={50}
                              prefix={moneyPrefix}
                              suffix="/mo"
                              format={(v) => String(Math.round(v))}
                            />
                            <LeverRow
                              label="Fund return before payout"
                              value={
                                s.accumulationReturn ?? draft.investment.preRetirementAnnualReturn
                              }
                              onChange={(v) => updateStream(s.id, { accumulationReturn: v })}
                              min={0}
                              max={0.12}
                              step={0.001}
                              suffix="%"
                              format={(v) => (v * 100).toFixed(1)}
                            />
                            {s.startAge <= draft.personal.currentAge && (
                              <LeverRow
                                label="Monthly payout after tax"
                                kind="money"
                                value={s.monthlyAmount ?? amount}
                                onChange={(v) => updateStream(s.id, { monthlyAmount: v })}
                                min={0}
                                max={sliderMaxFor(s.monthlyAmount ?? amount, 10000, 2500)}
                                step={50}
                                prefix={moneyPrefix}
                                suffix="/mo"
                                format={(v) => String(Math.round(v))}
                              />
                            )}
                            <p className="text-muted-foreground px-1 text-[11px] leading-relaxed">
                              Estimated payout uses{" "}
                              {(DEFAULT_DC_PAYOUT_ESTIMATE_RATE * 100).toFixed(1)}%/yr of the
                              projected fund balance unless you enter a monthly payout.
                            </p>
                          </>
                        )}
                        <LeverRow
                          label="Start age"
                          value={s.startAge}
                          onChange={(v) => updateStream(s.id, { startAge: Math.round(v) })}
                          min={draft.personal.currentAge}
                          max={draft.personal.planningHorizonAge}
                          step={1}
                          format={(v) => String(Math.round(v))}
                        />
                      </div>
                      <div className="bg-muted/20 grid gap-3 rounded-lg border p-3">
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3">
                          <div className="min-w-0">
                            <div className="text-foreground text-xs font-semibold">
                              Income growth
                            </div>
                            <div className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
                              Choose whether this income rises with plan inflation or stays fixed.
                            </div>
                          </div>
                          <AnimatedToggleGroup<"indexed" | "fixed">
                            variant="secondary"
                            size="xs"
                            items={[
                              { value: "indexed", label: "Indexed" },
                              { value: "fixed", label: "Fixed" },
                            ]}
                            value={s.adjustForInflation ? "indexed" : "fixed"}
                            onValueChange={(value) =>
                              updateStream(s.id, {
                                adjustForInflation: value === "indexed",
                                annualGrowthRate: undefined,
                              })
                            }
                          />
                        </div>
                        <div className="border-border grid gap-2 border-t pt-3 sm:grid-cols-[1fr_8rem] sm:items-center sm:gap-3">
                          <div className="min-w-0">
                            <div className="text-foreground text-xs font-semibold">
                              Custom annual growth
                            </div>
                            <div className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
                              Optional override for pensions or fixed-step benefits.
                            </div>
                          </div>
                          <PercentOverrideInput
                            value={s.annualGrowthRate}
                            placeholder={
                              s.adjustForInflation
                                ? `Inflation ${(draft.investment.inflationRate * 100).toFixed(1)}`
                                : "Fixed 0.0"
                            }
                            onChange={(value) => updateStream(s.id, { annualGrowthRate: value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <button
              className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-xs transition-colors"
              onClick={() => addStream()}
            >
              <Icons.Plus className="h-3 w-3" /> Add retirement income
            </button>
            <button
              className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-xs transition-colors"
              onClick={() =>
                addStream({
                  label: "Pension fund",
                  streamType: "dc",
                  startAge: draft.personal.targetRetirementAge,
                  monthlyAmount: undefined,
                  currentValue: 0,
                  monthlyContribution: 0,
                  accumulationReturn: draft.investment.preRetirementAnnualReturn,
                  adjustForInflation: false,
                })
              }
            >
              <Icons.Plus className="h-3 w-3" /> Add pension fund
            </button>
          </div>
        }
      />

      {/* ── Investment ── */}
      <SidebarCard
        kicker="Assumptions"
        title="Projection Assumptions"
        editing={editingSection === "investment"}
        onEdit={() => setEditingSection("investment")}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={
          <div className="divide-border divide-y">
            <ConfigRow label="Return before retirement">
              {formatPercent(draft.investment.preRetirementAnnualReturn)}
            </ConfigRow>
            <ConfigRow label="Return during retirement">
              {formatPercent(draft.investment.retirementAnnualReturn)}
            </ConfigRow>
            <ConfigRow label="Annual investment fee">
              {formatPercent(draft.investment.annualInvestmentFeeRate)}
            </ConfigRow>
            <ConfigRow label="Effective before-retirement return">
              {formatPercent(effectivePreRetirementReturn)}
            </ConfigRow>
            <ConfigRow label="Effective retirement return">
              {formatPercent(effectiveRetirementReturn)}
            </ConfigRow>
            <ConfigRow
              label={
                <InfoLabel label="Annual volatility">
                  How much yearly returns can vary around the expected return. Higher volatility
                  widens the market-path outcome range.
                </InfoLabel>
              }
            >
              {formatPercent(draft.investment.annualVolatility)}
            </ConfigRow>
            <ConfigRow label="Inflation">{formatPercent(draft.investment.inflationRate)}</ConfigRow>
            {draft.investment.contributionGrowthRate > 0 && (
              <ConfigRow label="Contribution growth per year">
                {formatPercent(draft.investment.contributionGrowthRate)}
              </ConfigRow>
            )}
          </div>
        }
        editContent={
          <div className="divide-border -my-1 divide-y">
            <LeverRow
              label="Return before retirement"
              value={draft.investment.preRetirementAnnualReturn}
              onChange={(v) => setInvestment("preRetirementAnnualReturn", v)}
              min={0}
              max={0.12}
              step={0.001}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
            <LeverRow
              label="Return during retirement"
              value={draft.investment.retirementAnnualReturn}
              onChange={(v) => setInvestment("retirementAnnualReturn", v)}
              min={0}
              max={0.1}
              step={0.001}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
            <LeverRow
              label="Annual investment fee"
              value={draft.investment.annualInvestmentFeeRate}
              onChange={(v) => setInvestment("annualInvestmentFeeRate", v)}
              min={0}
              max={0.03}
              step={0.0005}
              suffix="%"
              format={(v) => (v * 100).toFixed(2)}
            />
            <LeverRow
              label={
                <InfoLabel label="Annual volatility">
                  How much yearly returns can vary around the expected return. Higher volatility
                  widens the market-path outcome range.
                </InfoLabel>
              }
              value={draft.investment.annualVolatility}
              onChange={(v) => setInvestment("annualVolatility", v)}
              min={0}
              max={0.5}
              step={0.005}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
            <LeverRow
              label="Inflation"
              value={draft.investment.inflationRate}
              onChange={(v) => setInvestment("inflationRate", v)}
              min={0}
              max={0.06}
              step={0.001}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
            <LeverRow
              label="Contribution growth per year"
              value={draft.investment.contributionGrowthRate}
              onChange={(v) => setInvestment("contributionGrowthRate", v)}
              min={0}
              max={0.1}
              step={0.001}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
          </div>
        }
      />

      {/* ── Tax ── */}
      <SidebarCard
        kicker="Taxes"
        title="Withdrawal Taxes"
        editing={editingSection === "tax"}
        onEdit={() => setEditingSection("tax")}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={
          <div className="space-y-3">
            <div className="divide-border divide-y">
              <ConfigRow
                label={
                  <InfoLabel label="Taxable account rate">
                    Effective tax rate applied when the planner withdraws from regular taxable or
                    non-registered accounts. Higher rates increase gross withdrawals and can delay
                    FI.
                  </InfoLabel>
                }
              >
                {formatPercent(draft.tax?.taxableWithdrawalRate ?? 0)}
              </ConfigRow>
              <ConfigRow
                label={
                  <InfoLabel label="Tax-deferred account rate">
                    Effective tax rate applied to RRSP, IRA, pension, or similar tax-deferred
                    withdrawals. The planner grosses up withdrawals so spending is funded after
                    taxes.
                  </InfoLabel>
                }
              >
                {formatPercent(draft.tax?.taxDeferredWithdrawalRate ?? 0)}
              </ConfigRow>
              <ConfigRow
                label={
                  <InfoLabel label="Tax-free account rate">
                    Effective tax rate applied to TFSA, Roth, or similar tax-free withdrawals. This
                    is usually 0%.
                  </InfoLabel>
                }
              >
                {formatPercent(draft.tax?.taxFreeWithdrawalRate ?? 0)}
              </ConfigRow>
              <ConfigRow
                label={
                  <InfoLabel label="Early withdrawal penalty">
                    Extra penalty applied to tax-deferred withdrawals before the cutoff age. Use 0%
                    when the country or account wrapper has no early-withdrawal penalty.
                  </InfoLabel>
                }
              >
                {formatPercent(draft.tax?.earlyWithdrawalPenaltyRate ?? 0)}
              </ConfigRow>
              {(draft.tax?.earlyWithdrawalPenaltyRate ?? 0) > 0 && (
                <ConfigRow
                  label={
                    <InfoLabel label="Penalty cutoff age">
                      Age when the early-withdrawal penalty stops applying to tax-deferred
                      withdrawals.
                    </InfoLabel>
                  }
                >
                  {draft.tax?.earlyWithdrawalPenaltyAge ?? 59}
                </ConfigRow>
              )}
              {averageWithdrawalTaxRate > 0 && (
                <ConfigRow
                  label={
                    <InfoLabel label="Estimated average withdrawal tax">
                      Weighted average tax rate based on included account balances and each account
                      bucket's withdrawal tax rate. This is a portfolio-level estimate; yearly
                      withdrawals still follow the withdrawal order.
                    </InfoLabel>
                  }
                >
                  {(averageWithdrawalTaxRate * 100).toFixed(1)}%
                </ConfigRow>
              )}
            </div>

            {taxBucketBalances && taxBucketTotal > 0 && (
              <div className="border-t pt-3">
                <p className="text-muted-foreground mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider">
                  Account buckets
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground/70 hover:text-foreground rounded-full transition-colors"
                        aria-label="More info about account tax buckets"
                      >
                        <Icons.Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Value-weighted account shares used by the withdrawal engine. These come from
                      the Account Shares section, not from the tax rate fields above.
                    </TooltipContent>
                  </Tooltip>
                </p>
                <div className="divide-border divide-y">
                  <ConfigRow
                    label={
                      <InfoLabel label="Taxable bucket">
                        Portion of the retirement portfolio assigned to taxable or non-registered
                        accounts.
                      </InfoLabel>
                    }
                  >
                    {formatAmount(taxBucketBalances.taxable, currency)}{" "}
                    <span className="text-muted-foreground ml-1 font-normal">
                      {pctOfTotal(taxBucketBalances.taxable, taxBucketTotal)}
                    </span>
                  </ConfigRow>
                  <ConfigRow
                    label={
                      <InfoLabel label="Tax-deferred bucket">
                        Portion assigned to tax-deferred accounts such as RRSP, IRA, or pension-like
                        accounts.
                      </InfoLabel>
                    }
                  >
                    {formatAmount(taxBucketBalances.taxDeferred, currency)}{" "}
                    <span className="text-muted-foreground ml-1 font-normal">
                      {pctOfTotal(taxBucketBalances.taxDeferred, taxBucketTotal)}
                    </span>
                  </ConfigRow>
                  <ConfigRow
                    label={
                      <InfoLabel label="Tax-free bucket">
                        Portion assigned to tax-free accounts such as TFSA or Roth-style accounts.
                      </InfoLabel>
                    }
                  >
                    {formatAmount(taxBucketBalances.taxFree, currency)}{" "}
                    <span className="text-muted-foreground ml-1 font-normal">
                      {pctOfTotal(taxBucketBalances.taxFree, taxBucketTotal)}
                    </span>
                  </ConfigRow>
                </div>
              </div>
            )}

            {allTaxRatesZero && taxBucketTotal > 0 && (
              <p className="text-muted-foreground text-[10px]">
                Account bucket tags are applied, but 0% withdrawal rates mean no tax drag is
                modeled.
              </p>
            )}
          </div>
        }
        editContent={
          <div className="divide-border -my-1 divide-y">
            <LeverRow
              label={
                <InfoLabel label="Taxable account rate">
                  Effective tax rate applied when withdrawing from taxable or non-registered
                  accounts.
                </InfoLabel>
              }
              value={draft.tax?.taxableWithdrawalRate ?? 0}
              onChange={(v) => setTax("taxableWithdrawalRate", v)}
              min={0}
              max={0.6}
              step={0.005}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
            <LeverRow
              label={
                <InfoLabel label="Tax-deferred account rate">
                  Effective tax rate applied to RRSP, IRA, pension, or similar withdrawals.
                </InfoLabel>
              }
              value={draft.tax?.taxDeferredWithdrawalRate ?? 0}
              onChange={(v) => setTax("taxDeferredWithdrawalRate", v)}
              min={0}
              max={0.6}
              step={0.005}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
            <LeverRow
              label={
                <InfoLabel label="Tax-free account rate">
                  Effective tax rate applied to TFSA, Roth, or similar withdrawals. Usually 0%.
                </InfoLabel>
              }
              value={draft.tax?.taxFreeWithdrawalRate ?? 0}
              onChange={(v) => setTax("taxFreeWithdrawalRate", v)}
              min={0}
              max={0.3}
              step={0.005}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
            <LeverRow
              label={
                <InfoLabel label="Early withdrawal penalty">
                  Extra penalty applied to tax-deferred withdrawals before the cutoff age.
                </InfoLabel>
              }
              hint="Leave at 0% unless your jurisdiction applies an early-withdrawal penalty (e.g. US 10% before 59½). Canadian RRSPs don't use a separate penalty."
              value={draft.tax?.earlyWithdrawalPenaltyRate ?? 0}
              onChange={(v) => setTax("earlyWithdrawalPenaltyRate", v)}
              min={0}
              max={0.3}
              step={0.005}
              suffix="%"
              format={(v) => (v * 100).toFixed(1)}
            />
            <LeverRow
              label={
                <InfoLabel label="Penalty cutoff age">
                  Age when the early-withdrawal penalty stops applying. The tax rate above still
                  applies after this age.
                </InfoLabel>
              }
              value={draft.tax?.earlyWithdrawalPenaltyAge ?? 59}
              onChange={(v) => setTax("earlyWithdrawalPenaltyAge", Math.round(v))}
              min={draft.personal.currentAge}
              max={draft.personal.planningHorizonAge}
              step={1}
              format={(v) => String(Math.round(v))}
            />
          </div>
        }
      />

      {/* ── Eligible Accounts ── */}
      {goalId && (
        <GoalFundingEditor
          goalId={goalId}
          goalType="retirement"
          dcLinkedAccountIds={dcLinkedAccountIds}
          editing={editingSection === "funding"}
          onEditingChange={(next) => setEditingSection(next ? "funding" : null)}
        />
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────

export default function DashboardPage({
  plan,
  portfolioData,
  isLoading,
  plannerMode = "fire",
  onSavePlan,
  retirementOverview,
  goalId,
  dcLinkedAccountIds,
}: Props) {
  const L = modeLabel(plannerMode);
  const isTraditionalMode = plannerMode === "traditional";
  const { totalValue, error } = portfolioData;
  const portfolioNow = retirementOverview?.portfolioNow ?? totalValue;
  const currency = plan.currency;
  const [chartValueMode, setChartValueMode] = useState<ChartValueMode>("real");
  const [coverageView, setCoverageView] = useState<CoverageView>("at-retirement");
  const valueModeLabel = chartValueMode === "real" ? "today's value" : "nominal";
  const toTodayValueAtAge = useCallback(
    (value: number, age: number) => {
      const yearsFromNow = Math.max(0, age - plan.personal.currentAge);
      return value / boundedInflationFactor(plan.investment.inflationRate, yearsFromNow);
    },
    [plan.investment.inflationRate, plan.personal.currentAge],
  );
  const scaleForModeAtAge = useCallback(
    (value: number, age: number) => {
      if (chartValueMode === "nominal") return value;
      return toTodayValueAtAge(value, age);
    },
    [chartValueMode, toTodayValueAtAge],
  );

  // All numbers come from the backend DTO
  const retireTodayTarget = retirementOverview?.netFireTarget ?? 0;
  const targetReconciliation = retirementOverview?.targetReconciliation;
  const fallbackInflationFactorToGoal = boundedInflationFactor(
    plan.investment.inflationRate,
    Math.max(0, plan.personal.targetRetirementAge - plan.personal.currentAge),
  );
  const inflationFactorToGoal =
    targetReconciliation?.inflationFactorToTarget ?? fallbackInflationFactorToGoal;
  const targetNominalAtGoal =
    targetReconciliation?.requiredCapitalNominal ??
    retirementOverview?.requiredCapitalAtGoalAge ??
    0;
  const targetTodayAtGoal =
    targetReconciliation?.requiredCapitalTodayValue ?? targetNominalAtGoal / inflationFactorToGoal;
  const targetAtGoalDisplay =
    chartValueMode === "nominal" ? targetNominalAtGoal : targetTodayAtGoal;
  const coastAmount = retirementOverview?.coastAmountToday ?? 0;
  const coastAmountDisplay =
    chartValueMode === "nominal" ? coastAmount * inflationFactorToGoal : coastAmount;
  const fiAge = retirementOverview?.fiAge ?? null;
  const retirementStartAge = retirementOverview?.retirementStartAge ?? null;
  const suggestedAge = retirementOverview?.suggestedGoalAgeIfUnchanged ?? null;
  const requiredCapitalReachable = retirementOverview?.requiredCapitalReachable ?? true;
  // Effective FI age: genuine FI age, or the accumulation-only suggested age for display
  const effectiveFiAge = fiAge ?? suggestedAge;
  const progress = resolveFundedProgress(
    retirementOverview?.progress,
    portfolioNow,
    targetTodayAtGoal,
  );
  const milestonePortfolioDisplay =
    chartValueMode === "nominal" ? portfolioNow * inflationFactorToGoal : portfolioNow;

  const fireAgeForBudget = retirementStartAge ?? plan.personal.targetRetirementAge;
  const coverageExpenseItems = useMemo(() => expenseItems(plan.expenses), [plan.expenses]);
  const coverageIncomeStreams = plan.incomeStreams;

  // Budget from backend DTO
  const budget = retirementOverview?.budgetBreakdown;
  const totalBudget = budget?.totalMonthlyBudget ?? 0;
  const budgetStreams = budget?.incomeStreams ?? [];
  const effectiveTaxRate = budget?.effectiveTaxRate ?? 0;
  const fallbackMonthlyIncome = budgetStreams.reduce(
    (sum, stream) => sum + stream.monthlyAmount,
    0,
  );
  const coverageSnapshot = retirementOverview?.trajectory?.find(
    (pt) => pt.age === fireAgeForBudget,
  );
  const {
    annualSpendingNominal: coverageAnnualSpendingNominal,
    annualIncomeNominal: coverageAnnualIncomeNominal,
    annualPortfolioGapNominal: coverageAnnualPortfolioGapNominal,
    annualGrossWithdrawalNominal: coverageAnnualGrossWithdrawalNominal,
    annualEstimatedTaxesNominal: coverageAnnualEstimatedTaxesNominal,
  } = resolveCoverageAnnualNominalValues({
    snapshot: coverageSnapshot,
    totalMonthlyBudget: totalBudget,
    fallbackMonthlyIncome,
    effectiveTaxRate,
  });
  const coverageAnnualSpendingToday = toTodayValueAtAge(
    coverageAnnualSpendingNominal,
    fireAgeForBudget,
  );
  const coverageAnnualIncomeToday = toTodayValueAtAge(
    coverageAnnualIncomeNominal,
    fireAgeForBudget,
  );
  const coverageAnnualPortfolioGapToday = toTodayValueAtAge(
    coverageAnnualPortfolioGapNominal,
    fireAgeForBudget,
  );
  const coverageAnnualEstimatedTaxesToday = toTodayValueAtAge(
    coverageAnnualEstimatedTaxesNominal,
    fireAgeForBudget,
  );
  const coverageAnnualSpending =
    chartValueMode === "nominal" ? coverageAnnualSpendingNominal : coverageAnnualSpendingToday;
  const coverageAnnualIncome =
    chartValueMode === "nominal" ? coverageAnnualIncomeNominal : coverageAnnualIncomeToday;
  const coverageAnnualPortfolioGap =
    chartValueMode === "nominal"
      ? coverageAnnualPortfolioGapNominal
      : coverageAnnualPortfolioGapToday;
  const coverageAnnualEstimatedTaxes =
    chartValueMode === "nominal"
      ? coverageAnnualEstimatedTaxesNominal
      : coverageAnnualEstimatedTaxesToday;
  const coverageSpendingMonthly = coverageAnnualSpending / 12;
  const coverageEstimatedTaxesMonthly = coverageAnnualEstimatedTaxes / 12;
  const coverageIncomeAppliedAnnual = Math.min(coverageAnnualSpending, coverageAnnualIncome);
  const coveragePortfolioAppliedAnnual = Math.min(
    Math.max(0, coverageAnnualSpending - coverageIncomeAppliedAnnual),
    coverageAnnualPortfolioGap,
  );
  const coverageShortfallAnnual = Math.max(
    0,
    coverageAnnualSpending - coverageIncomeAppliedAnnual - coveragePortfolioAppliedAnnual,
  );
  const coveragePortfolioAppliedMonthly = coveragePortfolioAppliedAnnual / 12;
  const coverageShortfallMonthly = coverageShortfallAnnual / 12;
  const coverageIncomePct =
    coverageAnnualSpending > 0
      ? Math.min(100, Math.max(0, (coverageIncomeAppliedAnnual / coverageAnnualSpending) * 100))
      : 0;
  const coveragePortfolioPct =
    coverageAnnualSpending > 0
      ? Math.min(
          100 - coverageIncomePct,
          Math.max(0, (coveragePortfolioAppliedAnnual / coverageAnnualSpending) * 100),
        )
      : 0;
  const coverageShortfallPct =
    coverageAnnualSpending > 0
      ? Math.min(100, Math.max(0, (coverageShortfallAnnual / coverageAnnualSpending) * 100))
      : 0;
  const coveragePortfolioValueAtAge = coverageSnapshot?.portfolioStart ?? 0;
  const coveragePortfolioDrawRate = resolvePortfolioDrawRate({
    requiredCapitalReachable,
    portfolioValueAtAge: coveragePortfolioValueAtAge,
    grossWithdrawalAtAge: coverageAnnualGrossWithdrawalNominal,
    annualIncomeAtAge: coverageAnnualIncomeNominal,
    annualSpendingAtAge: coverageAnnualSpendingNominal,
    portfolioEndAtAge: coverageSnapshot?.portfolioEnd,
  });
  const nextIncomeStartAge =
    coverageIncomeStreams
      .filter((stream) => stream.startAge > fireAgeForBudget)
      .reduce<
        number | null
      >((earliest, stream) => (earliest === null ? stream.startAge : Math.min(earliest, stream.startAge)), null) ??
    null;

  const hasPensionFunds = plan.incomeStreams.some(
    (s) => (s.currentValue ?? 0) > 0 || (s.monthlyContribution ?? 0) > 0,
  );

  // Chart data from backend trajectory
  const chartData: ChartPoint[] = useMemo(() => {
    if (!retirementOverview?.trajectory?.length) return [];
    return retirementOverview.trajectory.map((pt) => ({
      label: `Age ${pt.age}`,
      age: pt.age,
      portfolio: scaleForModeAtAge(Math.max(0, pt.portfolioStart), pt.age),
      portfolioStart: scaleForModeAtAge(Math.max(0, pt.portfolioStart), pt.age),
      portfolioEnd: scaleForModeAtAge(Math.max(0, pt.portfolioEnd), pt.age),
      target:
        pt.requiredCapital == null ? undefined : scaleForModeAtAge(pt.requiredCapital, pt.age),
      withdrawal: scaleForModeAtAge(pt.netWithdrawalFromPortfolio, pt.age),
      phase: pt.phase,
      annualContribution: scaleForModeAtAge(pt.annualContribution, pt.age),
      annualIncome: scaleForModeAtAge(pt.annualIncome, pt.age),
      annualExpenses: scaleForModeAtAge(pt.plannedExpenses ?? pt.annualExpenses, pt.age),
      netChange:
        scaleForModeAtAge(Math.max(0, pt.portfolioEnd), pt.age) -
        scaleForModeAtAge(Math.max(0, pt.portfolioStart), pt.age),
    }));
  }, [retirementOverview?.trajectory, scaleForModeAtAge]);

  const coverageProjectionData: CoverageProjectionPoint[] = useMemo(() => {
    if (!retirementOverview?.trajectory?.length) return [];
    const coverageStartAge = plan.personal.targetRetirementAge;
    return retirementOverview.trajectory
      .filter((pt) => pt.age >= coverageStartAge && pt.age <= plan.personal.planningHorizonAge)
      .map((pt) => {
        const plannedSpending = Math.max(
          0,
          pt.plannedExpenses ?? projectedAnnualExpenseNominalAtAge(plan, pt.age),
        );
        const retirementIncomeAvailable = Math.max(
          0,
          pt.phase === "fire"
            ? pt.annualIncome
            : projectedAnnualIncomeNominalAtAge(plan, pt.age, coverageStartAge),
        );
        const portfolioWithdrawalAvailable =
          pt.phase === "fire" ? Math.max(0, pt.netWithdrawalFromPortfolio) : 0;
        const retirementIncome = Math.min(plannedSpending, retirementIncomeAvailable);
        const remainingAfterIncome = Math.max(0, plannedSpending - retirementIncome);
        const portfolioWithdrawal = Math.min(remainingAfterIncome, portfolioWithdrawalAvailable);
        const shortfall = Math.max(
          0,
          pt.annualShortfall ?? plannedSpending - retirementIncome - portfolioWithdrawal,
        );
        return {
          label: `Age ${pt.age}`,
          age: pt.age,
          plannedSpending: scaleForModeAtAge(plannedSpending, pt.age),
          retirementIncome: scaleForModeAtAge(retirementIncome, pt.age),
          portfolioWithdrawal: scaleForModeAtAge(portfolioWithdrawal, pt.age),
          shortfall: scaleForModeAtAge(shortfall, pt.age),
          taxes: scaleForModeAtAge(Math.max(0, pt.annualTaxes ?? 0), pt.age),
        };
      });
  }, [plan, retirementOverview?.trajectory, scaleForModeAtAge]);

  const coverageProjectionTicks = useMemo(() => {
    if (coverageProjectionData.length === 0) return [];

    const firstAge = coverageProjectionData[0].age;
    const lastAge = coverageProjectionData[coverageProjectionData.length - 1].age;
    const span = Math.max(1, lastAge - firstAge);
    const step = Math.max(1, Math.ceil(span / 5));
    const ticks = new Set<number>([firstAge, lastAge, fireAgeForBudget]);

    const firstSteppedAge = Math.ceil(firstAge / step) * step;
    for (let age = firstSteppedAge; age <= lastAge; age += step) {
      ticks.add(age);
    }

    return [...ticks].sort((a, b) => a - b);
  }, [coverageProjectionData, fireAgeForBudget]);

  // Year-by-year table: all years from backend trajectory
  const allSnapshots: RetirementTrajectoryPoint[] = useMemo(() => {
    return retirementOverview?.trajectory ?? [];
  }, [retirementOverview?.trajectory]);
  const incomeStartAges = useMemo(
    () => new Set(plan.incomeStreams.map((s) => s.startAge)),
    [plan.incomeStreams],
  );

  const isFinanciallyIndependent =
    !isTraditionalMode && portfolioNow >= retireTodayTarget && retireTodayTarget > 0;
  const yearsFromDesired =
    effectiveFiAge != null ? effectiveFiAge - plan.personal.targetRetirementAge : null;
  const traditionalStatus = retirementOverview?.successStatus;
  const spendingShortfallAge = retirementOverview?.spendingShortfallAge ?? null;
  const firstUnfundedAge = retirementOverview
    ? [retirementOverview.failureAge, spendingShortfallAge]
        .filter((age): age is number => typeof age === "number")
        .reduce<
          number | null
        >((earliest, age) => (earliest == null ? age : Math.min(earliest, age)), null)
    : null;
  const readiness = deriveRetirementReadiness({
    overview: retirementOverview,
    plannerMode,
    isFinanciallyIndependent,
    effectiveFiAge,
    desiredAge: plan.personal.targetRetirementAge,
    horizonAge: plan.personal.planningHorizonAge,
  });
  const heroHealth =
    readiness.tone === "good" ? "on_track" : readiness.tone === "watch" ? "at_risk" : "off_track";
  const heroGuidance = readiness.body;

  if (isLoading || !retirementOverview) {
    return <RetirementDashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="text-destructive p-4 text-sm">
        Failed to load portfolio data: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Two-column layout: main + sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Main column ── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Verdict — the hero. Sentence-style headline with inline status. */}
          {(() => {
            const statusAccent =
              heroHealth === "on_track"
                ? "text-green-600"
                : heroHealth === "at_risk"
                  ? "text-amber-600"
                  : "text-red-500";
            const goalShortfallNominal =
              targetReconciliation?.shortfallNominal ?? retirementOverview.shortfallAtGoalAge;
            const goalShortfallToday =
              targetReconciliation?.shortfallTodayValue ??
              retirementOverview.shortfallAtGoalAge / inflationFactorToGoal;
            const goalShortfall =
              chartValueMode === "nominal" ? goalShortfallNominal : goalShortfallToday;
            const goalSurplusNominal = retirementOverview.surplusAtGoalAge;
            const goalSurplusToday = goalSurplusNominal / inflationFactorToGoal;
            const goalSurplus =
              chartValueMode === "nominal" ? goalSurplusNominal : goalSurplusToday;
            const portfolioAtTargetToday =
              targetReconciliation?.portfolioAtTargetTodayValue ??
              retirementOverview.portfolioAtGoalAge / inflationFactorToGoal;
            const portfolioAtTargetNominal =
              targetReconciliation?.portfolioAtTargetNominal ??
              retirementOverview.portfolioAtGoalAge;
            const portfolioAtTarget =
              chartValueMode === "nominal" ? portfolioAtTargetNominal : portfolioAtTargetToday;
            const monthlyContribLabel = `${formatCompactAmount(plan.investment.monthlyContribution, currency)}/mo`;
            const annualBudgetToday =
              targetReconciliation?.plannedAnnualExpensesTodayValue ?? totalBudget * 12;
            const annualBudgetNominal =
              targetReconciliation?.plannedAnnualExpensesNominal ??
              totalBudget * 12 * inflationFactorToGoal;
            const annualBudget =
              chartValueMode === "nominal" ? annualBudgetNominal : annualBudgetToday;
            const annualBudgetLabel = formatCompactAmount(annualBudget, currency);
            const coastPct =
              targetAtGoalDisplay > 0
                ? Math.min(100, (coastAmountDisplay / targetAtGoalDisplay) * 100)
                : 0;
            const traditionalBadge =
              traditionalStatus === "depleted"
                ? "Runs short"
                : traditionalStatus === "shortfall"
                  ? "Shortfall"
                  : traditionalStatus === "overfunded"
                    ? "Surplus"
                    : "On track";

            return (
              <Card className="overflow-hidden">
                <CardContent className="px-7 py-6">
                  <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {heroHealth === "on_track" ? (
                        <Badge
                          variant="default"
                          className="gap-1.5 bg-green-600 text-[10px] hover:bg-green-600"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                          {isTraditionalMode
                            ? traditionalBadge
                            : isFinanciallyIndependent
                              ? "FI reached"
                              : "On track"}
                        </Badge>
                      ) : heroHealth === "at_risk" ? (
                        <Badge
                          variant="secondary"
                          className="gap-1.5 text-[10px] text-amber-700 dark:text-amber-400"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {isTraditionalMode
                            ? traditionalBadge
                            : yearsFromDesired != null
                              ? `${yearsFromDesired} yr${yearsFromDesired > 1 ? "s" : ""} late`
                              : "At risk"}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1.5 text-[10px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                          {isTraditionalMode
                            ? traditionalBadge
                            : yearsFromDesired != null && yearsFromDesired > 0
                              ? `${yearsFromDesired} yrs late`
                              : "Never reaches FI"}
                        </Badge>
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <ValueModeToggle value={chartValueMode} onChange={setChartValueMode} />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground/70 hover:text-foreground inline-flex rounded-full transition-colors"
                            aria-label="Today's value and nominal values explained"
                          >
                            <Icons.Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          <div className="font-semibold">Today's value</div>
                          <p className="text-muted-foreground mt-1">
                            Converts future dollars back into today's purchasing power, so amounts
                            feel comparable to your current budget.
                          </p>
                          <div className="mt-3 font-semibold">Nominal</div>
                          <p className="text-muted-foreground mt-1">
                            Shows the future dollar amount after inflation. This is the amount you
                            would see in that future year.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Sentence-style verdict */}
                  <h1 className="max-w-[95%] font-serif text-2xl font-normal leading-[1.15] tracking-tight">
                    {isTraditionalMode ? (
                      traditionalStatus === "shortfall" &&
                      spendingShortfallAge != null &&
                      goalShortfall <= 0 ? (
                        <>
                          Spending gap starts at{" "}
                          <span className={`font-medium ${statusAccent} whitespace-nowrap`}>
                            age {spendingShortfallAge}
                          </span>
                          <span className="text-muted-foreground font-sans text-[0.6em] font-normal italic">
                            {" "}
                            before the plan reaches age {plan.personal.planningHorizonAge}.
                          </span>
                        </>
                      ) : traditionalStatus === "shortfall" ? (
                        <>
                          At age {plan.personal.targetRetirementAge}, you're short{" "}
                          <span className={`font-medium ${statusAccent} whitespace-nowrap`}>
                            {formatCompactAmount(goalShortfall, currency)}
                          </span>
                          <span className="text-muted-foreground font-sans text-[0.6em] font-normal italic">
                            {" "}
                            to fund retirement through age {plan.personal.planningHorizonAge}.
                          </span>
                        </>
                      ) : traditionalStatus === "depleted" ? (
                        <>
                          Portfolio runs short during{" "}
                          <span className={`font-medium ${statusAccent} whitespace-nowrap`}>
                            age {retirementOverview.failureAge ?? firstUnfundedAge}
                          </span>
                          <span className="text-muted-foreground font-sans text-[0.6em] font-normal italic">
                            {" "}
                            after retiring at {plan.personal.targetRetirementAge}.
                          </span>
                        </>
                      ) : goalSurplus > 0 ? (
                        <>
                          You're projected to retire at age {plan.personal.targetRetirementAge} with{" "}
                          <span className={`font-medium ${statusAccent} whitespace-nowrap`}>
                            {formatCompactAmount(goalSurplus, currency)}
                          </span>
                          <span className="text-muted-foreground font-sans text-[0.6em] font-normal italic">
                            {" "}
                            surplus.
                          </span>
                        </>
                      ) : (
                        <>
                          You're projected to retire at{" "}
                          <span className={`font-medium ${statusAccent} whitespace-nowrap`}>
                            age {plan.personal.targetRetirementAge}
                          </span>
                          <span className="text-muted-foreground font-sans text-[0.6em] font-normal italic">
                            {" "}
                            on track.
                          </span>
                        </>
                      )
                    ) : isFinanciallyIndependent ? (
                      <>
                        You have reached{" "}
                        <span className={`font-medium ${statusAccent} whitespace-nowrap`}>
                          financial independence
                        </span>
                        <span className="text-muted-foreground font-sans text-[0.6em] font-normal italic">
                          {" "}
                          — with the current assumptions.
                        </span>
                      </>
                    ) : effectiveFiAge != null ? (
                      <>
                        You'll reach financial independence at{" "}
                        <span className={`font-medium ${statusAccent} whitespace-nowrap`}>
                          age {effectiveFiAge}
                        </span>
                        {yearsFromDesired != null && yearsFromDesired !== 0 ? (
                          <>
                            {" — "}
                            <span className="text-muted-foreground font-sans text-[0.6em] font-normal italic">
                              {yearsFromDesired > 0
                                ? `${yearsFromDesired} year${yearsFromDesired > 1 ? "s" : ""} after`
                                : `${-yearsFromDesired} year${yearsFromDesired < -1 ? "s" : ""} before`}{" "}
                              your goal of {plan.personal.targetRetirementAge}.
                            </span>
                          </>
                        ) : (
                          <>
                            {" — "}
                            <span className="text-muted-foreground font-sans text-[0.6em] font-normal italic">
                              right on your goal of {plan.personal.targetRetirementAge}.
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        Not reachable by{" "}
                        <span className={`font-medium ${statusAccent} whitespace-nowrap`}>
                          age {plan.personal.planningHorizonAge}
                        </span>
                        <span className="text-muted-foreground font-sans text-[0.6em] font-normal italic">
                          {" "}
                          with current assumptions.
                        </span>
                      </>
                    )}
                  </h1>

                  <p className="text-muted-foreground mt-4 max-w-[620px] text-sm leading-relaxed">
                    At your current{" "}
                    <span className="text-foreground tabular-nums">{monthlyContribLabel}</span>{" "}
                    contribution,{" "}
                    {!requiredCapitalReachable ? (
                      <>
                        the required capital target is not available with the current assumptions.
                        Review spending, inflation, returns, and life expectancy.
                      </>
                    ) : isTraditionalMode ? (
                      <>
                        projected retirement balance is{" "}
                        <ValueModeTooltip
                          valueMode={chartValueMode}
                          currency={currency}
                          todayValue={portfolioAtTargetToday}
                          nominalValue={portfolioAtTargetNominal}
                        >
                          <span className="text-foreground tabular-nums">
                            {formatCompactAmount(portfolioAtTarget, currency)}
                          </span>
                        </ValueModeTooltip>{" "}
                        vs. required capital of{" "}
                        <ValueModeTooltip
                          valueMode={chartValueMode}
                          currency={currency}
                          todayValue={targetTodayAtGoal}
                          nominalValue={targetNominalAtGoal}
                        >
                          <span className="text-foreground tabular-nums">
                            {formatCompactAmount(targetAtGoalDisplay, currency)}
                          </span>
                        </ValueModeTooltip>{" "}
                        at age {plan.personal.targetRetirementAge}.
                      </>
                    ) : (
                      <>
                        the plan funds{" "}
                        <ValueModeTooltip
                          valueMode={chartValueMode}
                          currency={currency}
                          todayValue={annualBudgetToday}
                          nominalValue={annualBudgetNominal}
                        >
                          <span className="text-foreground tabular-nums">{annualBudgetLabel}</span>
                        </ValueModeTooltip>
                        /yr of expenses to age {plan.personal.planningHorizonAge}.
                      </>
                    )}
                    {requiredCapitalReachable &&
                      !isTraditionalMode &&
                      goalShortfall > 0 &&
                      yearsFromDesired != null &&
                      yearsFromDesired > 0 && (
                        <>
                          {" "}
                          You're short{" "}
                          <ValueModeTooltip
                            valueMode={chartValueMode}
                            currency={currency}
                            todayValue={goalShortfallToday}
                            nominalValue={goalShortfallNominal}
                          >
                            <span className="font-medium tabular-nums text-amber-600">
                              {formatCompactAmount(goalShortfall, currency)}
                            </span>
                          </ValueModeTooltip>{" "}
                          at age {plan.personal.targetRetirementAge}.
                        </>
                      )}
                  </p>

                  {/* Progress bar — portfolio vs. target with Coast FIRE marker */}
                  <div className="mt-6">
                    <div className="mb-2 flex items-end justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
                          Portfolio today
                        </span>
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCompactAmount(portfolioNow, currency)}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help text-[10px] uppercase tracking-wider underline decoration-dotted underline-offset-2">
                              {isTraditionalMode ? "Required at" : "Target at"} age{" "}
                              {plan.personal.targetRetirementAge}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            Capital needed at your{" "}
                            {isTraditionalMode ? "retirement" : "desired retirement"} age after
                            expenses, income, taxes, retirement returns, and fees. Shown in{" "}
                            {valueModeLabel}.
                          </TooltipContent>
                        </Tooltip>
                        {requiredCapitalReachable ? (
                          <ValueModeTooltip
                            valueMode={chartValueMode}
                            currency={currency}
                            todayValue={targetTodayAtGoal}
                            nominalValue={targetNominalAtGoal}
                          >
                            <span className="text-sm font-semibold tabular-nums">
                              {formatCompactAmount(targetAtGoalDisplay, currency)}
                            </span>
                          </ValueModeTooltip>
                        ) : (
                          <span className="text-muted-foreground text-sm font-semibold">
                            Not available
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-muted/60 relative h-2.5 overflow-hidden rounded-md border">
                      <div
                        className="bg-success absolute inset-y-0 left-0 transition-[width] duration-500"
                        style={{ width: `${Math.min(progress * 100, 100)}%` }}
                      />
                      {!isTraditionalMode &&
                        requiredCapitalReachable &&
                        targetAtGoalDisplay > 0 &&
                        coastAmountDisplay > 0 && (
                          <div
                            className="bg-foreground/55 absolute -bottom-0.5 -top-0.5 w-[2px]"
                            style={{ left: `${coastPct}%` }}
                            title="Coast FIRE"
                          />
                        )}
                    </div>
                    <div className="text-muted-foreground mt-1 flex justify-between text-[10px]">
                      <span className="tabular-nums">{(progress * 100).toFixed(1)}% funded</span>
                      {!isTraditionalMode && (
                        <span className="tabular-nums">
                          ▲ {L.coast} {formatCompactAmount(coastAmountDisplay, currency)}
                        </span>
                      )}
                    </div>
                  </div>

                  {!isTraditionalMode &&
                    heroGuidance &&
                    !isFinanciallyIndependent &&
                    yearsFromDesired == null && (
                      <p
                        className={`mt-4 border-t pt-4 text-xs ${
                          heroHealth === "on_track"
                            ? "text-green-700 dark:text-green-300"
                            : heroHealth === "at_risk"
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-red-600 dark:text-red-300"
                        }`}
                      >
                        {heroGuidance}
                      </p>
                    )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Retirement projection chart */}
          {chartData.length > 2 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                  <div>
                    <div className="text-muted-foreground mb-0.5 text-[10px] font-semibold uppercase tracking-wider">
                      Projection · age {plan.personal.currentAge} →{" "}
                      {plan.personal.planningHorizonAge}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="text-sm">Portfolio trajectory</CardTitle>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground/70 hover:text-foreground inline-flex rounded-full transition-colors"
                            aria-label="More info about portfolio trajectory"
                          >
                            <Icons.Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm text-xs">
                          {isTraditionalMode
                            ? 'The retirement marker shows when withdrawals start. "What you\'ll need" is the minimum balance needed at each age to still fund planned retirement spending through life expectancy.'
                            : 'The FI marker shows the first sustainable age. "What you\'ll need" is the minimum balance needed at each age after crediting your remaining planned contributions. It only starts at today\'s portfolio if you are exactly on track. "What you\'ll have" is the projected portfolio path.'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="block h-0 w-4 border-b-[2px]"
                        style={{
                          borderColor:
                            readiness.tone === "good"
                              ? PROJECTED_CHART_COLORS.onTrack.stroke
                              : PROJECTED_CHART_COLORS.offTrack.stroke,
                        }}
                      />
                      Projected
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex cursor-help items-center gap-1.5 underline decoration-dotted underline-offset-2">
                          <svg viewBox="0 0 24 4" aria-hidden="true" className="h-1 w-6 shrink-0">
                            <line
                              x1="1"
                              y1="2"
                              x2="23"
                              y2="2"
                              stroke={CHART_COLORS.reference}
                              strokeWidth="1.5"
                              strokeDasharray="6 4"
                              strokeLinecap="round"
                            />
                          </svg>
                          Required
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        {isTraditionalMode
                          ? "Minimum balance needed at each age to still retire at your target age and fund planned spending through life expectancy."
                          : "Minimum balance needed at each age to still hit the desired retirement-age target after crediting the planned contributions you have left."}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <RetirementChart
                  data={chartData}
                  currency={currency}
                  retirementAge={plan.personal.targetRetirementAge}
                  projectedFireAge={effectiveFiAge}
                  valueMode={chartValueMode}
                  plannerMode={plannerMode}
                  projectedIsOnTrack={readiness.tone === "good"}
                />
              </CardContent>
            </Card>
          )}

          {/* Milestone strip — Coast FIRE / Lean FIRE / FI / Fat FIRE */}
          {plannerMode === "fire" && targetAtGoalDisplay > 0 && (
            <Card className="p-0">
              <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
                {[
                  {
                    key: "coast",
                    label: L.coast,
                    value: coastAmountDisplay,
                    hint: "Stop contributing, still retires on time",
                    tip:
                      chartValueMode === "nominal"
                        ? "Coast amount translated into nominal dollars at your desired retirement age."
                        : "Capital you need today that — with zero further contributions — grows to full FI by your retirement age.",
                  },
                  {
                    key: "lean",
                    label: "Lean FIRE",
                    value: targetAtGoalDisplay * 0.7,
                    hint: "70% of planned spending",
                    tip: "Retire on a frugal budget — roughly 70% of your planned spending. Feasible earlier but leaves little margin.",
                  },
                  {
                    key: "fi",
                    label: "FI",
                    value: targetAtGoalDisplay,
                    hint: "Full planned spending",
                    tip: "Capital that funds your planned retirement spending through the full retirement horizon.",
                  },
                  {
                    key: "fat",
                    label: "Fat FIRE",
                    value: targetAtGoalDisplay * 1.5,
                    hint: "150% of planned spending",
                    tip: "Retire with ~50% more spending than planned — room for travel, gifts, volatility, and lifestyle upgrades.",
                  },
                ].map((m) => {
                  const pct = m.value > 0 ? Math.min(1, milestonePortfolioDisplay / m.value) : 0;
                  const reached = milestonePortfolioDisplay >= m.value && m.value > 0;
                  return (
                    <div key={m.key} className="p-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
                          {m.label}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground/70 hover:text-foreground inline-flex rounded-full transition-colors"
                              aria-label={`More info about ${m.label}`}
                            >
                              <Icons.Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">{m.tip}</TooltipContent>
                        </Tooltip>
                        {reached && (
                          <Badge
                            variant="default"
                            className="h-[14px] bg-green-600 px-1.5 text-[9px] font-semibold tracking-wider hover:bg-green-600"
                          >
                            DONE
                          </Badge>
                        )}
                      </div>
                      <div className="text-[17px] font-semibold tabular-nums tracking-tight">
                        {formatCompactAmount(m.value, currency)}
                      </div>
                      <div className="bg-muted/60 mt-2 h-[3px] overflow-hidden rounded-sm">
                        <div
                          className={`h-full transition-[width] duration-500 ${reached ? "bg-green-600" : "bg-success"}`}
                          style={{ width: `${pct * 100}%`, opacity: 0.85 }}
                        />
                      </div>
                      <div className="text-muted-foreground mt-1.5 text-[10.5px]">{m.hint}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Retirement spending coverage */}
          <Card>
            <CardHeader className="relative pb-4 sm:pr-56">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <Icons.CreditCard className="text-muted-foreground h-3.5 w-3.5" />
                  <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.15em]">
                    Coverage
                  </div>
                </div>
                <CardTitle className="text-[17px] font-semibold leading-none tracking-tight">
                  {L.budgetAt}
                </CardTitle>
                <div className="mt-2 flex items-start gap-1.5">
                  <p className="text-muted-foreground max-w-4xl text-sm leading-relaxed">
                    {coverageView === "at-retirement" ? (
                      <>
                        Snapshot at age {fireAgeForBudget}: planned{" "}
                        <span className="text-foreground tabular-nums">
                          {formatCompactAmount(coverageSpendingMonthly, currency)}/mo
                        </span>{" "}
                        spending and funding. Future items stay visible and are counted when active.
                      </>
                    ) : (
                      <>
                        How income and portfolio withdrawals cover planned spending through
                        retirement.
                      </>
                    )}
                  </p>
                  {coverageView === "over-time" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground mt-0.5 rounded-full transition-colors"
                          aria-label="Coverage chart details"
                        >
                          <Icons.Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        Values are shown in {valueModeLabel}. The stacked area shows how spending is
                        funded; the dashed line is planned retirement spending.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
              <AnimatedToggleGroup<CoverageView>
                value={coverageView}
                onValueChange={setCoverageView}
                items={[
                  { value: "at-retirement", label: "At retirement" },
                  { value: "over-time", label: "Over time" },
                ]}
                size="xs"
                rounded="md"
                className="bg-muted/30 mt-4 w-fit border sm:absolute sm:right-5 sm:top-5 sm:mt-0"
              />
            </CardHeader>
            <CardContent className="space-y-3.5">
              {coverageView === "at-retirement" ? (
                <>
                  <div className="text-foreground/90 text-[13px]">
                    At age {fireAgeForBudget} —{" "}
                    <span className="text-foreground font-semibold tabular-nums">
                      {formatCompactAmount(coverageSpendingMonthly, currency)}/mo
                    </span>{" "}
                    planned spending
                  </div>

                  {/* Split bar — income streams + portfolio + shortfall */}
                  <div className="bg-muted/60 relative flex h-2.5 w-full overflow-hidden rounded-full border">
                    {budgetStreams.map((s, i) => {
                      const pct = Math.min(100, Math.max(0, s.percentageOfBudget * 100));
                      if (pct <= 0) return null;
                      return (
                        <div
                          key={s.label}
                          className="h-full transition-[width] duration-500"
                          style={{
                            width: `${pct}%`,
                            background: INCOME_STREAM_COLORS[i % INCOME_STREAM_COLORS.length],
                          }}
                          title={`${s.label}: ${pct.toFixed(0)}%`}
                        />
                      );
                    })}
                    {coveragePortfolioPct > 0 && (
                      <div
                        className="bg-success h-full transition-[width] duration-500"
                        style={{ width: `${coveragePortfolioPct}%` }}
                        title={`Portfolio withdrawal: ${coveragePortfolioPct.toFixed(0)}%`}
                      />
                    )}
                    {coverageShortfallPct > 0 && (
                      <div
                        className="h-full bg-red-500/75 transition-[width] duration-500"
                        style={{ width: `${coverageShortfallPct}%` }}
                        title={`Unfunded: ${coverageShortfallPct.toFixed(0)}%`}
                      />
                    )}
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {budgetStreams.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{ background: COVERAGE_COLORS.income }}
                        />
                        Income {coverageIncomePct.toFixed(0)}%
                      </span>
                    )}
                    {coveragePortfolioPct > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="bg-success inline-block h-2 w-2 rounded-sm" />
                        Portfolio {coveragePortfolioPct.toFixed(0)}%
                      </span>
                    )}
                    {coverageShortfallPct > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-sm bg-red-500/75" />
                        Unfunded {coverageShortfallPct.toFixed(0)}%
                      </span>
                    )}
                    {budgetStreams.length === 0 && nextIncomeStartAge !== null && (
                      <span>
                        No income active at age {fireAgeForBudget}; first income starts at{" "}
                        {nextIncomeStartAge}.
                      </span>
                    )}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* Expense breakdown — no color dots */}
                    <div className="min-w-0">
                      <div className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                        Spending schedule
                      </div>
                      <div className="divide-border divide-y">
                        {coverageExpenseItems.map((r) => {
                          const isActive = isExpenseActiveAtAge(r, fireAgeForBudget);
                          const status = coverageTimingLabel(
                            isActive,
                            r.startAge,
                            r.endAge,
                            fireAgeForBudget,
                          );
                          return (
                            <div
                              key={r.id}
                              className="flex items-center justify-between gap-3 py-1.5 text-[13px]"
                            >
                              <span className="min-w-0">
                                <span className="text-foreground block truncate font-medium">
                                  {r.label}
                                </span>
                                <span className="text-muted-foreground block truncate text-[11px]">
                                  {expenseAgeRangeLabel(r, plan.personal.planningHorizonAge)}
                                  {status ? ` · ${status}` : ""}
                                </span>
                              </span>
                              <span className="text-foreground shrink-0 tabular-nums">
                                {formatCompactAmount(r.monthlyAmount, currency)}/mo
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Income schedule + current-age funding sources */}
                    <div className="min-w-0 border-t pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                      <div className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                        Income schedule
                      </div>
                      <div className="space-y-1.5">
                        {coverageIncomeStreams.length === 0 && (
                          <div className="text-muted-foreground py-1 text-[12px]">
                            No retirement income configured
                          </div>
                        )}
                        {coverageIncomeStreams.map((s, i) => {
                          const isActive = isIncomeActiveAtAge(s, fireAgeForBudget);
                          const matchedBudgetStream = budgetStreams.find(
                            (stream) => stream.label === s.label,
                          );
                          const monthlyAmount =
                            isActive && matchedBudgetStream
                              ? matchedBudgetStream.monthlyAmount
                              : incomeStreamMonthlyAmount(plan, s);
                          const status = coverageTimingLabel(
                            isActive,
                            s.startAge,
                            undefined,
                            fireAgeForBudget,
                          );

                          return (
                            <div
                              key={s.id}
                              className="flex items-center justify-between gap-3 text-[13px]"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span
                                  className="inline-block h-2 w-2 shrink-0 rounded-sm"
                                  style={{
                                    background:
                                      INCOME_STREAM_COLORS[i % INCOME_STREAM_COLORS.length],
                                  }}
                                />
                                <span className="min-w-0">
                                  <span className="text-foreground block truncate font-medium">
                                    {s.label}
                                  </span>
                                  <span className="text-muted-foreground block truncate text-[11px]">
                                    {incomeAgeRangeLabel(s, plan.personal.planningHorizonAge)}
                                    {status ? ` · ${status}` : ""}
                                  </span>
                                </span>
                              </span>
                              <span className="text-foreground shrink-0 tabular-nums">
                                {formatCompactAmount(monthlyAmount, currency)}/mo{" "}
                                {isActive && matchedBudgetStream ? (
                                  <span className="text-muted-foreground ml-1 text-[11px]">
                                    {(matchedBudgetStream.percentageOfBudget * 100).toFixed(0)}%
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          );
                        })}
                        {(coveragePortfolioAppliedMonthly > 0 ||
                          coverageShortfallMonthly > 0 ||
                          coverageEstimatedTaxesMonthly > 0) && (
                          <div className="border-border mt-2 flex items-center justify-between gap-3 border-t pt-2">
                            <div className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.14em]">
                              Funding at age {fireAgeForBudget}
                            </div>
                            {coveragePortfolioDrawRate != null && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors"
                                  >
                                    Draw on portfolio:{" "}
                                    <span className="text-foreground tabular-nums">
                                      {(coveragePortfolioDrawRate * 100).toFixed(1)}%/yr
                                    </span>
                                    <Icons.Info className="size-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  Gross portfolio withdrawal at this age, including estimated
                                  withdrawal taxes, divided by projected portfolio value.
                                  Informational only - it does not set your spending.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        )}
                        {coveragePortfolioAppliedMonthly > 0 && (
                          <div className="flex items-center justify-between gap-3 text-[13px]">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="bg-success inline-block h-2 w-2 shrink-0 rounded-sm" />
                              <span className="text-foreground truncate font-medium">
                                Portfolio withdrawal
                              </span>
                            </span>
                            <span className="text-foreground shrink-0 tabular-nums">
                              {formatCompactAmount(coveragePortfolioAppliedMonthly, currency)}/mo{" "}
                              <span className="text-muted-foreground ml-1 text-[11px]">
                                {coveragePortfolioPct.toFixed(0)}%
                              </span>
                            </span>
                          </div>
                        )}
                        {coverageShortfallMonthly > 0 && (
                          <div className="flex items-center justify-between gap-3 text-[13px]">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="inline-block h-2 w-2 shrink-0 rounded-sm bg-red-500/75" />
                              <span className="text-foreground truncate font-medium">
                                Unfunded spending
                              </span>
                            </span>
                            <span className="text-foreground shrink-0 tabular-nums">
                              {formatCompactAmount(coverageShortfallMonthly, currency)}/mo{" "}
                              <span className="text-muted-foreground ml-1 text-[11px]">
                                {coverageShortfallPct.toFixed(0)}%
                              </span>
                            </span>
                          </div>
                        )}
                        {coverageEstimatedTaxesMonthly > 0 && (
                          <div className="text-muted-foreground flex items-center justify-between gap-3 pt-1 text-[11px] italic">
                            <span>Withdrawal taxes</span>
                            <span className="tabular-nums">
                              +{formatCompactAmount(coverageEstimatedTaxesMonthly, currency)}/mo
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : coverageProjectionData.length > 1 ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={{ background: COVERAGE_COLORS.income }}
                        />
                        Retirement income
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={{ background: COVERAGE_COLORS.portfolio }}
                        />
                        Portfolio withdrawal
                      </span>
                      {coverageProjectionData.some((pt) => pt.shortfall > 0) && (
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ background: COVERAGE_COLORS.shortfall }}
                          />
                          Unfunded
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <span
                          className="block h-0 w-4 border-b border-dashed"
                          style={{ borderColor: COVERAGE_COLORS.planned }}
                        />
                        Planned spending
                      </span>
                    </div>
                    <span className="bg-muted/60 text-muted-foreground rounded-full px-2.5 py-1 text-[11px] font-medium">
                      Showing {valueModeLabel}
                    </span>
                  </div>

                  <RetirementCoverageChart
                    data={coverageProjectionData}
                    ticks={coverageProjectionTicks}
                    currency={currency}
                    valueMode={chartValueMode}
                    fireAgeForBudget={fireAgeForBudget}
                    referenceLabelPrefix={L.prefix}
                  />
                </div>
              ) : (
                <div className="text-muted-foreground rounded-md border border-dashed py-8 text-center text-sm">
                  Coverage projection is unavailable for this plan.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Year-by-Year Snapshot — in main column with pagination */}
          <RetirementSnapshotTable
            snapshots={allSnapshots}
            hasPensionFunds={hasPensionFunds}
            incomeStartAges={incomeStartAges}
            fiAge={fiAge}
            phaseLabel={L.prefix}
            currency={currency}
            scaleForModeAtAge={scaleForModeAtAge}
          />

          <Card className="bg-muted/30 border-dashed">
            <CardContent className="text-muted-foreground flex gap-3 py-5 text-xs leading-relaxed">
              <Icons.Info className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1.5">
                <p className="text-foreground font-medium">One thing to keep in mind</p>
                <p>
                  This is not financial advice. Treat these numbers as a sketch, not a forecast.
                  Everything here is a simulation built on the inputs you entered: returns,
                  inflation, contributions, taxes, and how long you expect to live. Real markets
                  don&apos;t move in straight lines, tax rules shift, and government programs get
                  rewritten. Use this to stress-test ideas and spot gaps, then talk to a qualified
                  professional before making decisions that are hard to undo.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4 lg:col-span-1 lg:self-start">
          <SidebarConfigurator
            plan={plan}
            currency={currency}
            plannerMode={plannerMode}
            onSavePlan={onSavePlan}
            retirementOverview={retirementOverview}
            goalId={goalId}
            dcLinkedAccountIds={dcLinkedAccountIds}
          />
        </div>
      </div>

      {portfolioNow === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No portfolio data found. Add accounts and holdings to see your retirement projection.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
