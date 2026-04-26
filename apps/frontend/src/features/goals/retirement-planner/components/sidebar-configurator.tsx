import type { RetirementOverview } from "@/lib/types";
import { GoalFundingEditor } from "@/pages/goals/components/goal-funding-editor";
import {
  AnimatedToggleGroup,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  formatAmount,
  formatPercent,
  Input,
  MoneyInput,
} from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { useCallback, useState } from "react";
import { DEFAULT_DC_PAYOUT_ESTIMATE_RATE } from "../lib/constants";
import { incomeStreamMonthlyAmount, modeLabel, type PlannerMode } from "../lib/dashboard-math";
import {
  createExpenseItem,
  expenseAgeRangeLabel,
  expenseItems,
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
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const displayValue = draftValue ?? format(value);

  const commitDraftValue = () => {
    const raw = displayValue.trim();
    if (!raw) {
      setDraftValue(null);
      return;
    }

    const parsed = parseFloat(raw.replace(/,/g, ""));
    if (Number.isNaN(parsed)) {
      setDraftValue(null);
      return;
    }

    const next = clampInputValue(parsed);
    onChange(next);
    setDraftValue(null);
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
              value={displayValue}
              onFocus={() => {
                setDraftValue(format(value));
              }}
              onChange={(e) => {
                const next = e.target.value;
                if (/^-?\d*([.,]\d*)?$/.test(next)) {
                  setDraftValue(next);
                }
              }}
              onBlur={() => {
                commitDraftValue();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  setDraftValue(null);
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
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const displayValue = draftValue ?? (value === undefined ? "" : String(value));

  const commitDraftValue = () => {
    const raw = displayValue.trim();
    if (!raw) {
      onChange(undefined);
      setDraftValue(null);
      return;
    }

    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setDraftValue(null);
      return;
    }

    const next = Math.min(max, Math.max(min, parsed));
    onChange(next);
    setDraftValue(null);
  };

  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        placeholder={placeholder}
        onFocus={() => {
          setDraftValue(value === undefined ? "" : String(value));
        }}
        onChange={(e) => {
          const next = e.target.value;
          if (/^\d*$/.test(next)) {
            setDraftValue(next);
          }
        }}
        onBlur={() => {
          commitDraftValue();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraftValue(null);
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
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? formatDraft(value);

  return (
    <div className="bg-muted/70 flex h-8 w-full items-center gap-1 rounded-md border px-2.5">
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        placeholder={placeholder}
        onFocus={() => setDraft(formatDraft(value))}
        onBlur={() => {
          setDraft(null);
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
export function SidebarConfigurator({
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
