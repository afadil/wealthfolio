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
  formatPercent,
  Input,
  Skeleton,
} from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { useCallback, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ExpenseBucket,
  InvestmentAssumptions,
  RetirementIncomeStream,
  RetirementPlan,
  TaxProfile,
  WithdrawalConfig,
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
  onSavePlan?: (plan: RetirementPlan) => void;
  onNavigateToTab?: (tab: string) => void;
  retirementOverview?: RetirementOverview;
  goalId?: string;
  dcLinkedAccountIds?: string[];
}

function modeLabel(mode: PlannerMode) {
  return {
    target: mode === "fire" ? "FIRE Target" : "Retirement Target",
    targetNet: mode === "fire" ? "FIRE Target (net)" : "Retirement Target (net)",
    estAge: mode === "fire" ? "Projected FI Age" : "Retirement Age",
    progress: mode === "fire" ? "FIRE Progress" : "Retirement Progress",
    coast: mode === "fire" ? "Coast FIRE" : "Coast Amount",
    budgetAt: "Retirement spending coverage",
    prefix: mode === "fire" ? "FIRE" : "Retirement",
  };
}

function fmtCompact(value: number, currency: string) {
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 1_000_000 ? 2 : abs >= 100_000 ? 0 : abs >= 1_000 ? 1 : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      notation: "compact",
      maximumFractionDigits,
    }).format(value);
  } catch {
    return formatAmount(value, currency);
  }
}

type ChartValueMode = "real" | "nominal";

function ValueModeToggle({
  value,
  onChange,
}: {
  value: ChartValueMode;
  onChange: (value: ChartValueMode) => void;
}) {
  return (
    <AnimatedToggleGroup<ChartValueMode>
      value={value}
      onValueChange={onChange}
      items={[
        { value: "real", label: "Today's value" },
        { value: "nominal", label: "Nominal" },
      ]}
      size="xs"
      rounded="md"
      className="bg-muted/30 border"
    />
  );
}

function ValueModeTooltip({
  valueMode,
  currency,
  todayValue,
  nominalValue,
  children,
}: {
  valueMode: ChartValueMode;
  currency: string;
  todayValue: number;
  nominalValue: number;
  children: React.ReactNode;
}) {
  const showingLabel = valueMode === "real" ? "Today's value" : "Nominal";
  const alternateLabel = valueMode === "real" ? "Nominal" : "Today's value";
  const alternateValue = valueMode === "real" ? nominalValue : todayValue;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-2">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-wider">
          Showing {showingLabel}
        </div>
        <div className="mt-1 tabular-nums">
          {alternateLabel}: {fmtCompact(alternateValue, currency)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Chart types & helpers ───────────────────────────────────────

interface ChartPoint {
  label: string; // category axis for reliable ReferenceLine
  age: number;
  portfolio: number; // start-of-age value used for visual comparison to required capital
  portfolioStart: number;
  portfolioEnd: number;
  target: number | undefined;
  withdrawal: number; // annual withdrawal (0 during accumulation)
  phase: string;
  annualContribution: number;
  annualIncome: number;
  annualExpenses: number;
  netChange: number;
}

const CHART_COLORS = {
  portfolio: { fill: "hsl(38, 75%, 50%)", stroke: "hsl(38, 75%, 50%)" },
};

// Warm olive palette for income streams (coverage bar + row dots).
// Values come from --fi-stream-N CSS variables which swap between light/dark themes.
const INCOME_STREAM_COLORS = [
  "var(--fi-stream-1)",
  "var(--fi-stream-2)",
  "var(--fi-stream-3)",
  "var(--fi-stream-4)",
  "var(--fi-stream-5)",
];

function RetirementChartTooltip({
  active,
  payload,
  currency,
  valueMode,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  currency: string;
  valueMode: ChartValueMode;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;
  const valueLabel = valueMode === "real" ? "today's money" : "nominal money";

  return (
    <div className="bg-popover grid grid-cols-1 gap-1.5 rounded-md border p-2.5 shadow-md">
      <p className="text-muted-foreground text-xs font-medium">
        Age {point.age} · {point.phase === "fire" ? "Retirement" : "Accumulation"} · {valueLabel}
      </p>
      <div className="flex items-center justify-between space-x-4">
        <div className="flex items-center space-x-1.5">
          <span
            className="block h-2 w-2 rounded-full"
            style={{ backgroundColor: CHART_COLORS.portfolio.stroke }}
          />
          <span className="text-muted-foreground text-xs">Start portfolio:</span>
        </div>
        <span className="text-xs font-semibold tabular-nums">
          {fmtCompact(point.portfolioStart, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between space-x-4">
        <span className="text-muted-foreground text-xs">End portfolio:</span>
        <span className="text-xs font-semibold tabular-nums">
          {fmtCompact(point.portfolioEnd, currency)}
        </span>
      </div>
      {point.target != null && (
        <div className="flex items-center justify-between space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="block h-0 w-3 border-b border-dashed border-[#888]" />
            <span className="text-muted-foreground text-xs">Required path:</span>
          </div>
          <span className="text-xs font-semibold tabular-nums">
            {fmtCompact(point.target, currency)}
          </span>
        </div>
      )}
      {point.annualContribution > 0 && (
        <div className="flex items-center justify-between space-x-4">
          <span className="text-muted-foreground text-xs">Contribution/yr:</span>
          <span className="text-xs font-semibold tabular-nums">
            {fmtCompact(point.annualContribution, currency)}
          </span>
        </div>
      )}
      {point.annualIncome > 0 && (
        <div className="flex items-center justify-between space-x-4">
          <span className="text-muted-foreground text-xs">Income/yr:</span>
          <span className="text-xs font-semibold tabular-nums">
            {fmtCompact(point.annualIncome, currency)}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between space-x-4">
        <span className="text-muted-foreground text-xs">Planned spending/yr:</span>
        <span className="text-xs font-semibold tabular-nums">
          {fmtCompact(point.annualExpenses, currency)}
        </span>
      </div>
      {point.withdrawal > 0 && (
        <div className="flex items-center justify-between space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="text-destructive block h-2 w-2 rounded-full" />
            <span className="text-muted-foreground text-xs">Portfolio withdrawal/yr:</span>
          </div>
          <span className="text-destructive text-xs font-semibold tabular-nums">
            -{fmtCompact(point.withdrawal, currency)}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between space-x-4 border-t pt-1">
        <span className="text-muted-foreground text-xs">Net portfolio change:</span>
        <span
          className={`text-xs font-semibold tabular-nums ${
            point.netChange >= 0 ? "text-green-600" : "text-red-500"
          }`}
        >
          {point.netChange >= 0 ? "+" : "-"}
          {fmtCompact(Math.abs(point.netChange), currency)}
        </span>
      </div>
    </div>
  );
}

function RetirementChart({
  data,
  currency,
  retirementAge,
  projectedFireAge,
  valueMode,
}: {
  data: ChartPoint[];
  currency: string;
  retirementAge: number;
  projectedFireAge?: number | null;
  valueMode: ChartValueMode;
}) {
  if (data.length < 2) return null;

  const retirementLabel = `Age ${retirementAge}`;
  const showProjectedFiLine = projectedFireAge != null && projectedFireAge !== retirementAge;
  const projectedFiLabel = showProjectedFiLine ? `Age ${projectedFireAge}` : "";
  // Offset labels vertically when ages are close to avoid overlap
  const agesClose = showProjectedFiLine && Math.abs((projectedFireAge ?? 0) - retirementAge) <= 3;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="retirementPortfolio" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.portfolio.fill} stopOpacity={0.3} />
              <stop offset="60%" stopColor={CHART_COLORS.portfolio.fill} stopOpacity={0.15} />
              <stop offset="100%" stopColor={CHART_COLORS.portfolio.fill} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            tickFormatter={(label: string) => label.replace(/^Age\s+/, "")}
            interval={Math.max(1, Math.floor(data.length / 6))}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) => {
              if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
              if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
              return `$${v.toFixed(0)}`;
            }}
            width={60}
            axisLine={false}
            tickLine={false}
            domain={[0, "auto"]}
          />
          <RTooltip
            content={<RetirementChartTooltip currency={currency} valueMode={valueMode} />}
          />

          {/* Projected FI age vertical line — render FIRST so retirement line draws on top */}
          {showProjectedFiLine && (
            <ReferenceLine
              x={projectedFiLabel}
              stroke="var(--color-green-400)"
              strokeWidth={1}
              strokeDasharray="4 3"
              strokeOpacity={0.8}
              label={{
                value: `FI · ${projectedFireAge}`,
                position: "top",
                fontSize: 10,
                fill: "var(--color-green-400)",
                dy: agesClose ? -12 : 0,
              }}
            />
          )}

          {/* Retirement age vertical line */}
          <ReferenceLine
            x={retirementLabel}
            stroke="#888"
            strokeWidth={1}
            strokeDasharray="4 3"
            strokeOpacity={0.5}
            label={{
              value: `GOAL · ${retirementAge}`,
              position: "top",
              fontSize: 10,
              fontWeight: 600,
              fill: "#888",
            }}
          />

          {/* Target — dashed line (no fill, just stroke) */}
          <Area
            type="linear"
            dataKey="target"
            name="Required capital path"
            stroke="#888"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            fill="none"
            activeDot={false}
            animationDuration={300}
          />

          {/* Portfolio — filled golden area */}
          <Area
            type="linear"
            dataKey="portfolio"
            name="Projected portfolio"
            stroke={CHART_COLORS.portfolio.stroke}
            strokeWidth={1.5}
            fill="url(#retirementPortfolio)"
            fillOpacity={1}
            animationDuration={300}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
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

/** Inline number input */
function InlineField({
  label,
  value,
  onChange,
  step = 1,
  min,
  suffix,
}: {
  label: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-muted-foreground min-w-0 shrink text-xs font-normal">{label}</div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-7 w-20 px-2 text-right text-xs tabular-nums"
        />
        {suffix && <span className="text-muted-foreground text-[10px]">{suffix}</span>}
      </div>
    </div>
  );
}

/** A lever: title + hint + compact readout input + full-width slider. */
function LeverRow({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  format,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  format: (v: number) => string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="py-4 first:pt-1 last:pb-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-foreground text-[15px] font-semibold leading-tight">{label}</div>
          {hint && <div className="text-muted-foreground mt-1 text-xs leading-tight">{hint}</div>}
        </div>
        <div className="bg-muted/70 flex h-8 min-w-[96px] items-center gap-1 rounded-md border px-2.5">
          {prefix && <span className="text-muted-foreground text-xs tabular-nums">{prefix}</span>}
          <input
            type="number"
            value={format(value)}
            step={step}
            min={min}
            max={max}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              if (!Number.isNaN(parsed)) {
                const clamped = Math.min(max, Math.max(min, parsed));
                onChange(suffix === "%" ? clamped / 100 : clamped);
              }
            }}
            className="text-foreground w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none"
          />
          {suffix && <span className="text-muted-foreground text-xs tabular-nums">{suffix}</span>}
        </div>
      </div>
      <input
        type="range"
        value={value}
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
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={onSave} disabled={!dirty}>
              Save
            </Button>
          </div>
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
        {editing ? <div className="space-y-2.5">{editContent}</div> : readContent}
      </CardContent>
    </Card>
  );
}

/** Complete sidebar configurator — each section is its own card */
function SidebarConfigurator({
  plan,
  currency,
  onSavePlan,
  retirementOverview,
  goalId,
  dcLinkedAccountIds,
}: {
  plan: RetirementPlan;
  currency: string;
  onSavePlan?: (plan: RetirementPlan) => void;
  retirementOverview?: RetirementOverview;
  goalId?: string;
  dcLinkedAccountIds?: string[];
}) {
  const [draft, setDraft] = useState<RetirementPlan>(() => structuredClone(plan));
  const [dirty, setDirty] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);

  const planKey = JSON.stringify(plan);
  useMemo(() => {
    setDraft(structuredClone(plan));
    setDirty(false);
    setEditingSection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  const update = useCallback((updater: (d: RetirementPlan) => RetirementPlan) => {
    setDraft((prev) => updater(prev));
    setDirty(true);
  }, []);

  const saveDraft = useCallback(() => {
    onSavePlan?.(draft);
    setDirty(false);
    setEditingSection(null);
  }, [draft, onSavePlan]);

  const cancelEdit = useCallback(() => {
    setDraft(structuredClone(plan));
    setDirty(false);
    setEditingSection(null);
  }, [plan]);

  // Shorthand updaters
  const setPersonal = <K extends keyof RetirementPlan["personal"]>(
    key: K,
    val: RetirementPlan["personal"][K],
  ) => update((d) => ({ ...d, personal: { ...d.personal, [key]: val } }));

  const setInvestment = <K extends keyof InvestmentAssumptions>(
    key: K,
    val: InvestmentAssumptions[K],
  ) => update((d) => ({ ...d, investment: { ...d.investment, [key]: val } }));

  const setWithdrawal = <K extends keyof WithdrawalConfig>(key: K, val: WithdrawalConfig[K]) =>
    update((d) => ({ ...d, withdrawal: { ...d.withdrawal, [key]: val } }));

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

  const setExpense = (
    bucket: "living" | "healthcare" | "housing" | "discretionary",
    patch: Partial<ExpenseBucket>,
  ) =>
    update((d) => ({
      ...d,
      expenses: { ...d.expenses, [bucket]: { ...d.expenses[bucket], ...patch } },
    }));

  const addStream = (preset?: Partial<RetirementIncomeStream>) => {
    update((d) => ({
      ...d,
      incomeStreams: [
        ...d.incomeStreams,
        {
          id: crypto.randomUUID?.() ?? `stream-${Date.now()}`,
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
  };

  const updateStream = (id: string, patch: Partial<RetirementIncomeStream>) =>
    update((d) => ({
      ...d,
      incomeStreams: d.incomeStreams.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const removeStream = (id: string) =>
    update((d) => ({ ...d, incomeStreams: d.incomeStreams.filter((s) => s.id !== id) }));

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
  const hasCanadianPublicBenefit = draft.incomeStreams.some((stream) =>
    /\b(cpp|qpp|oas)\b/i.test(stream.label),
  );

  const strategyLabels: Record<string, string> = {
    "constant-dollar": "Constant Dollar",
    "constant-percentage": "Constant %",
    guardrails: "Guardrails",
  };

  return (
    <div className="space-y-4">
      {/* ── Plan ── */}
      <SidebarCard
        kicker="Levers"
        title="Plan inputs"
        editing={editingSection === "plan"}
        onEdit={() => setEditingSection("plan")}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={
          <div className="divide-border divide-y">
            <ConfigRow label="Current age">{draft.personal.currentAge}</ConfigRow>
            <ConfigRow label="Desired retirement age">
              {draft.personal.targetRetirementAge}
            </ConfigRow>
            <ConfigRow label="Plan through age">{draft.personal.planningHorizonAge}</ConfigRow>
            <ConfigRow label="Monthly contribution until retirement">
              {formatAmount(draft.investment.monthlyContribution, currency)}
            </ConfigRow>
            <ConfigRow label="Target withdrawal rate for sizing">
              {formatPercent(draft.withdrawal.safeWithdrawalRate)}
            </ConfigRow>
          </div>
        }
        editContent={
          <div className="divide-border -my-1 divide-y">
            <LeverRow
              label="Retirement age"
              hint="Target age to stop working"
              value={draft.personal.targetRetirementAge}
              onChange={(v) => setPersonal("targetRetirementAge", Math.round(v))}
              min={draft.personal.currentAge + 1}
              max={75}
              step={1}
              format={(v) => String(v)}
            />
            <LeverRow
              label="Monthly contribution"
              value={draft.investment.monthlyContribution}
              onChange={(v) => setInvestment("monthlyContribution", v)}
              min={0}
              max={20000}
              step={100}
              prefix="$"
              format={(v) => v.toLocaleString()}
            />
            <LeverRow
              label="Return before retirement"
              value={draft.investment.preRetirementAnnualReturn}
              onChange={(v) => setInvestment("preRetirementAnnualReturn", v)}
              min={0.02}
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
              label="Withdrawal rate"
              hint="SWR target at retirement"
              value={draft.withdrawal.safeWithdrawalRate}
              onChange={(v) => setWithdrawal("safeWithdrawalRate", v)}
              min={0.02}
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
        onEdit={() => setEditingSection("expenses")}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={(() => {
          const retireAge = draft.personal.targetRetirementAge;
          const horizonAge = draft.personal.planningHorizonAge;
          const ageRange = `Age ${retireAge} → ${horizonAge}`;
          const items: { label: string; amount: number }[] = [
            { label: "Living", amount: draft.expenses.living.monthlyAmount },
          ];
          if (draft.expenses.healthcare.monthlyAmount >= 0) {
            items.push({ label: "Healthcare", amount: draft.expenses.healthcare.monthlyAmount });
          }
          if (draft.expenses.housing) {
            items.push({ label: "Housing", amount: draft.expenses.housing.monthlyAmount });
          }
          if (draft.expenses.discretionary) {
            items.push({
              label: "Discretionary",
              amount: draft.expenses.discretionary.monthlyAmount,
            });
          }
          const total = items.reduce((s, i) => s + i.amount, 0);
          return (
            <div className="divide-border divide-y">
              {items.map((it) => (
                <SidebarMonthlyRow
                  key={it.label}
                  label={it.label}
                  meta={ageRange}
                  amount={it.amount}
                  currency={currency}
                />
              ))}
              <SidebarTotalRow amount={total} currency={currency} />
            </div>
          );
        })()}
        editContent={
          <>
            <InlineField
              label="Living spending"
              value={draft.expenses.living.monthlyAmount}
              onChange={(v) => setExpense("living", { monthlyAmount: v })}
              step={100}
              suffix="/mo"
            />
            <InlineField
              label="Healthcare spending"
              value={draft.expenses.healthcare.monthlyAmount}
              onChange={(v) => setExpense("healthcare", { monthlyAmount: v })}
              step={50}
              suffix="/mo"
            />
            {draft.expenses.housing && (
              <div className="flex items-center gap-1">
                <div className="flex-1">
                  <InlineField
                    label="Housing spending"
                    value={draft.expenses.housing.monthlyAmount}
                    onChange={(v) => setExpense("housing", { monthlyAmount: v })}
                    step={100}
                    suffix="/mo"
                  />
                </div>
                <button
                  onClick={() =>
                    update((d) => ({ ...d, expenses: { ...d.expenses, housing: undefined } }))
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Icons.X className="h-3 w-3" />
                </button>
              </div>
            )}
            {draft.expenses.discretionary && (
              <div className="flex items-center gap-1">
                <div className="flex-1">
                  <InlineField
                    label="Discretionary spending"
                    value={draft.expenses.discretionary.monthlyAmount}
                    onChange={(v) => setExpense("discretionary", { monthlyAmount: v })}
                    step={50}
                    suffix="/mo"
                  />
                </div>
                <button
                  onClick={() =>
                    update((d) => ({ ...d, expenses: { ...d.expenses, discretionary: undefined } }))
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Icons.X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex gap-2">
              {!draft.expenses.housing && (
                <button
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                  onClick={() =>
                    update((d) => ({
                      ...d,
                      expenses: { ...d.expenses, housing: { monthlyAmount: 0 } },
                    }))
                  }
                >
                  + Housing spending
                </button>
              )}
              {!draft.expenses.discretionary && (
                <button
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                  onClick={() =>
                    update((d) => ({
                      ...d,
                      expenses: { ...d.expenses, discretionary: { monthlyAmount: 0 } },
                    }))
                  }
                >
                  + Discretionary spending
                </button>
              )}
            </div>
          </>
        }
      />

      {/* ── Income Streams ── */}
      <SidebarCard
        kicker="Income"
        title="Retirement Income"
        editing={editingSection === "income"}
        onEdit={() => setEditingSection("income")}
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
                    meta={`Age ${s.startAge} → ${draft.personal.planningHorizonAge}`}
                    amount={s.monthlyAmount ?? 0}
                    currency={currency}
                  />
                ))}
                <SidebarTotalRow
                  amount={draft.incomeStreams.reduce((sum, s) => sum + (s.monthlyAmount ?? 0), 0)}
                  currency={currency}
                />
              </div>
              {!hasCanadianPublicBenefit && (
                <p className="text-muted-foreground rounded-md border border-dashed px-2.5 py-2 text-xs leading-relaxed">
                  Bank calculators often include CPP/QPP and OAS automatically. Add those streams
                  here if you want comparable Canadian results.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">No retirement income configured</p>
              <p className="text-muted-foreground rounded-md border border-dashed px-2.5 py-2 text-xs leading-relaxed">
                Bank calculators often include CPP/QPP and OAS automatically. This plan only uses
                income streams you add here.
              </p>
            </div>
          )
        }
        editContent={
          <>
            {draft.incomeStreams.map((s) => (
              <div key={s.id} className="space-y-1.5 rounded-md border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={s.label}
                    onChange={(e) => updateStream(s.id, { label: e.target.value })}
                    placeholder="Label"
                    className="h-6 flex-1 border-0 px-0 text-xs font-medium shadow-none focus-visible:ring-0"
                  />
                  <button
                    onClick={() => removeStream(s.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Icons.X className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {s.streamType !== "dc" && (
                    <InlineField
                      label="Monthly income"
                      value={s.monthlyAmount ?? 0}
                      onChange={(v) => updateStream(s.id, { monthlyAmount: v })}
                      suffix="/mo"
                    />
                  )}
                  <InlineField
                    label="Start age"
                    value={s.startAge}
                    onChange={(v) => updateStream(s.id, { startAge: v })}
                    min={1}
                  />
                </div>
              </div>
            ))}
            <button
              className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-xs transition-colors"
              onClick={() => addStream()}
            >
              <Icons.Plus className="h-3 w-3" /> Add retirement income
            </button>
            {!hasCanadianPublicBenefit && (
              <button
                className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-xs transition-colors"
                onClick={() =>
                  addStream({
                    label: "OAS estimate",
                    startAge: 65,
                    monthlyAmount: 0,
                    adjustForInflation: true,
                  })
                }
              >
                <Icons.Plus className="h-3 w-3" /> Add OAS placeholder
              </button>
            )}
          </>
        }
      />

      {/* ── Investment ── */}
      <SidebarCard
        kicker="Assumptions"
        title="Portfolio Assumptions"
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
            <ConfigRow label="Annual volatility">
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
          <>
            <InlineField
              label="Return before retirement"
              value={+(draft.investment.preRetirementAnnualReturn * 100).toFixed(2)}
              onChange={(v) => setInvestment("preRetirementAnnualReturn", v / 100)}
              step={0.1}
              suffix="%"
            />
            <InlineField
              label="Return during retirement"
              value={+(draft.investment.retirementAnnualReturn * 100).toFixed(2)}
              onChange={(v) => setInvestment("retirementAnnualReturn", v / 100)}
              step={0.1}
              suffix="%"
            />
            <InlineField
              label="Annual investment fee"
              value={+(draft.investment.annualInvestmentFeeRate * 100).toFixed(2)}
              onChange={(v) => setInvestment("annualInvestmentFeeRate", v / 100)}
              step={0.1}
              suffix="%"
            />
            <InlineField
              label="Annual volatility"
              value={+(draft.investment.annualVolatility * 100).toFixed(2)}
              onChange={(v) => setInvestment("annualVolatility", v / 100)}
              step={0.1}
              suffix="%"
            />
            <InlineField
              label="Inflation"
              value={+(draft.investment.inflationRate * 100).toFixed(2)}
              onChange={(v) => setInvestment("inflationRate", v / 100)}
              step={0.1}
              suffix="%"
            />
            <InlineField
              label="Contribution growth per year"
              value={+(draft.investment.contributionGrowthRate * 100).toFixed(2)}
              onChange={(v) => setInvestment("contributionGrowthRate", v / 100)}
              step={0.1}
              suffix="%"
            />
          </>
        }
      />

      {/* ── Withdrawal ── */}
      <SidebarCard
        kicker="Rule"
        title="Retirement Withdrawal Rule"
        editing={editingSection === "withdrawal"}
        onEdit={() => setEditingSection("withdrawal")}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={
          <ConfigRow label="Withdrawal strategy">
            {strategyLabels[draft.withdrawal.strategy] ?? draft.withdrawal.strategy}
          </ConfigRow>
        }
        editContent={
          <>
            <div className="space-y-1.5">
              {(["constant-dollar", "constant-percentage", "guardrails"] as const).map((s) => (
                <label
                  key={s}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${draft.withdrawal.strategy === s ? "border-foreground/30 bg-muted/50" : "border-transparent"}`}
                >
                  <input
                    type="radio"
                    name="strategy"
                    checked={draft.withdrawal.strategy === s}
                    onChange={() => setWithdrawal("strategy", s)}
                    className="accent-foreground h-3 w-3"
                  />
                  {strategyLabels[s]}
                </label>
              ))}
            </div>
            {draft.withdrawal.strategy === "guardrails" && (
              <div className="space-y-1.5 pt-1">
                <InlineField
                  label="Ceiling rate"
                  value={+((draft.withdrawal.guardrails?.ceilingRate ?? 0.06) * 100).toFixed(2)}
                  onChange={(v) =>
                    setWithdrawal("guardrails", {
                      ceilingRate: v / 100,
                      floorRate: draft.withdrawal.guardrails?.floorRate ?? 0.03,
                    })
                  }
                  step={0.1}
                  suffix="%"
                />
                <InlineField
                  label="Floor rate"
                  value={+((draft.withdrawal.guardrails?.floorRate ?? 0.03) * 100).toFixed(2)}
                  onChange={(v) =>
                    setWithdrawal("guardrails", {
                      ceilingRate: draft.withdrawal.guardrails?.ceilingRate ?? 0.06,
                      floorRate: v / 100,
                    })
                  }
                  step={0.1}
                  suffix="%"
                />
              </div>
            )}
          </>
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
          <>
            <InlineField
              label={
                <InfoLabel label="Taxable account rate">
                  Effective tax rate applied when withdrawing from taxable or non-registered
                  accounts.
                </InfoLabel>
              }
              value={+((draft.tax?.taxableWithdrawalRate ?? 0) * 100).toFixed(1)}
              onChange={(v) => setTax("taxableWithdrawalRate", v / 100)}
              step={0.5}
              suffix="%"
            />
            <InlineField
              label={
                <InfoLabel label="Tax-deferred account rate">
                  Effective tax rate applied to RRSP, IRA, pension, or similar withdrawals.
                </InfoLabel>
              }
              value={+((draft.tax?.taxDeferredWithdrawalRate ?? 0) * 100).toFixed(1)}
              onChange={(v) => setTax("taxDeferredWithdrawalRate", v / 100)}
              step={0.5}
              suffix="%"
            />
            <InlineField
              label={
                <InfoLabel label="Tax-free account rate">
                  Effective tax rate applied to TFSA, Roth, or similar withdrawals. Usually 0%.
                </InfoLabel>
              }
              value={+((draft.tax?.taxFreeWithdrawalRate ?? 0) * 100).toFixed(1)}
              onChange={(v) => setTax("taxFreeWithdrawalRate", v / 100)}
              step={0.5}
              suffix="%"
            />
          </>
        }
      />

      {/* ── Eligible Accounts ── */}
      {goalId && (
        <GoalFundingEditor
          goalId={goalId}
          goalType="retirement"
          dcLinkedAccountIds={dcLinkedAccountIds}
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
  onNavigateToTab: _onNavigateToTab,
  retirementOverview,
  goalId,
  dcLinkedAccountIds,
}: Props) {
  void _onNavigateToTab; // kept in Props for tab navigation; unused in new sidebar
  const L = modeLabel(plannerMode);
  const { totalValue, error } = portfolioData;
  const portfolioNow = retirementOverview?.portfolioNow ?? totalValue;
  const currency = plan.currency;
  const [chartValueMode, setChartValueMode] = useState<ChartValueMode>("real");
  const valueModeLabel = chartValueMode === "real" ? "today's value" : "nominal";
  const inflationBase = Math.max(1 + plan.investment.inflationRate, 0.01);
  const toTodayValueAtAge = useCallback(
    (value: number, age: number) => {
      const yearsFromNow = Math.max(0, age - plan.personal.currentAge);
      return value / Math.pow(inflationBase, yearsFromNow);
    },
    [inflationBase, plan.personal.currentAge],
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
  const fallbackInflationFactorToGoal = Math.pow(
    inflationBase,
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
  // Effective FI age: genuine FI age, or the accumulation-only suggested age for display
  const effectiveFiAge = fiAge ?? suggestedAge;
  const progress = targetAtGoalDisplay > 0 ? Math.min(portfolioNow / targetAtGoalDisplay, 1) : 0;

  const fireAgeForBudget = retirementStartAge ?? plan.personal.targetRetirementAge;

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
  const coverageSnapshotSpending =
    coverageSnapshot?.plannedExpenses ??
    (coverageSnapshot?.phase === "fire" ? coverageSnapshot.annualExpenses : undefined);
  const coverageSnapshotIncome =
    coverageSnapshot?.phase === "fire" ? coverageSnapshot.annualIncome : undefined;
  const coverageSnapshotPortfolioGap =
    coverageSnapshot?.phase === "fire" ? coverageSnapshot.netWithdrawalFromPortfolio : undefined;
  const coverageSnapshotGrossWithdrawal =
    coverageSnapshot?.phase === "fire" ? coverageSnapshot.grossWithdrawal : undefined;
  const coverageSnapshotTaxes =
    coverageSnapshot?.phase === "fire" ? coverageSnapshot.annualTaxes : undefined;
  const coverageInflationFactor = Math.pow(
    inflationBase,
    Math.max(0, fireAgeForBudget - plan.personal.currentAge),
  );
  const coverageAnnualSpendingNominal =
    coverageSnapshotSpending ?? totalBudget * 12 * coverageInflationFactor;
  const coverageAnnualIncomeNominal =
    coverageSnapshotIncome ?? fallbackMonthlyIncome * 12 * coverageInflationFactor;
  const coverageAnnualPortfolioGapNominal =
    coverageSnapshotPortfolioGap ??
    Math.max(0, coverageAnnualSpendingNominal - coverageAnnualIncomeNominal);
  const coverageAnnualGrossWithdrawalNominal =
    coverageSnapshotGrossWithdrawal ??
    (effectiveTaxRate > 0
      ? coverageAnnualPortfolioGapNominal / Math.max(0.01, 1 - effectiveTaxRate)
      : coverageAnnualPortfolioGapNominal);
  const coverageAnnualEstimatedTaxesNominal =
    coverageSnapshotTaxes ??
    Math.max(0, coverageAnnualGrossWithdrawalNominal - coverageAnnualPortfolioGapNominal);
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
      target: scaleForModeAtAge(pt.requiredCapital, pt.age),
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

  // Year-by-year table: all years from backend trajectory
  const allSnapshots: RetirementTrajectoryPoint[] = useMemo(() => {
    return retirementOverview?.trajectory ?? [];
  }, [retirementOverview?.trajectory]);

  // Pagination for year-by-year table
  const PAGE_SIZE = 10;
  const [tablePage, setTablePage] = useState(0);
  const totalPages = Math.ceil(allSnapshots.length / PAGE_SIZE);
  const pagedSnapshots = allSnapshots.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE);

  const isFinanciallyIndependent = portfolioNow >= retireTodayTarget && retireTodayTarget > 0;
  const yearsFromDesired =
    effectiveFiAge != null ? effectiveFiAge - plan.personal.targetRetirementAge : null;
  const heroHealth =
    isFinanciallyIndependent ||
    (effectiveFiAge != null && effectiveFiAge <= plan.personal.targetRetirementAge)
      ? "on_track"
      : effectiveFiAge != null && effectiveFiAge <= plan.personal.targetRetirementAge + 3
        ? "at_risk"
        : "off_track";
  const heroGuidance = isFinanciallyIndependent
    ? "You have reached financial independence with the current assumptions."
    : yearsFromDesired != null && yearsFromDesired > 0
      ? `${yearsFromDesired} year${yearsFromDesired !== 1 ? "s" : ""} after your desired age. Consider increasing contributions, extending the desired retirement age, or reducing retirement spending.`
      : effectiveFiAge == null && retireTodayTarget > 0
        ? `Not reachable by age ${plan.personal.planningHorizonAge} with current assumptions. Consider increasing contributions, extending the desired retirement age, reducing retirement spending, or adding retirement income.`
        : null;

  if (isLoading || !retirementOverview) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
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
      <div className="flex justify-end">
        <ValueModeToggle value={chartValueMode} onChange={setChartValueMode} />
      </div>

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
            const stripeAccent =
              heroHealth === "on_track"
                ? "bg-green-600"
                : heroHealth === "at_risk"
                  ? "bg-amber-500"
                  : "bg-red-500";
            const goalShortfallNominal =
              targetReconciliation?.shortfallNominal ?? retirementOverview.shortfallAtGoalAge;
            const goalShortfallToday =
              targetReconciliation?.shortfallTodayValue ??
              retirementOverview.shortfallAtGoalAge / inflationFactorToGoal;
            const goalShortfall =
              chartValueMode === "nominal" ? goalShortfallNominal : goalShortfallToday;
            const monthlyContribLabel = `${fmtCompact(plan.investment.monthlyContribution, currency)}/mo`;
            const annualBudgetToday =
              targetReconciliation?.plannedAnnualExpensesTodayValue ?? totalBudget * 12;
            const annualBudgetNominal =
              targetReconciliation?.plannedAnnualExpensesNominal ??
              totalBudget * 12 * inflationFactorToGoal;
            const annualBudget =
              chartValueMode === "nominal" ? annualBudgetNominal : annualBudgetToday;
            const annualBudgetLabel = fmtCompact(annualBudget, currency);
            const coastPct =
              targetAtGoalDisplay > 0
                ? Math.min(100, (coastAmountDisplay / targetAtGoalDisplay) * 100)
                : 0;

            return (
              <Card className="relative overflow-hidden">
                <div className={`absolute bottom-0 left-0 top-0 w-[3px] ${stripeAccent}`} />
                <CardContent className="px-7 py-6">
                  <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {heroHealth === "on_track" ? (
                        <Badge
                          variant="default"
                          className="gap-1.5 bg-green-600 text-[10px] hover:bg-green-600"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                          {isFinanciallyIndependent ? "FI reached" : "On track"}
                        </Badge>
                      ) : heroHealth === "at_risk" ? (
                        <Badge
                          variant="secondary"
                          className="gap-1.5 text-[10px] text-amber-700 dark:text-amber-400"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {yearsFromDesired != null
                            ? `${yearsFromDesired} yr${yearsFromDesired > 1 ? "s" : ""} late`
                            : "At risk"}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1.5 text-[10px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                          {yearsFromDesired != null && yearsFromDesired > 0
                            ? `${yearsFromDesired} yrs late`
                            : "Never reaches FI"}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Sentence-style verdict */}
                  <h1 className="max-w-[95%] font-serif text-[clamp(1.5rem,2.6vw,2rem)] font-normal leading-[1.15] tracking-tight">
                    {isFinanciallyIndependent ? (
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
                    contribution, the plan funds{" "}
                    <ValueModeTooltip
                      valueMode={chartValueMode}
                      currency={currency}
                      todayValue={annualBudgetToday}
                      nominalValue={annualBudgetNominal}
                    >
                      <span className="text-foreground tabular-nums">{annualBudgetLabel}</span>
                    </ValueModeTooltip>
                    /yr of expenses to age {plan.personal.planningHorizonAge}.
                    {goalShortfall > 0 && yearsFromDesired != null && yearsFromDesired > 0 && (
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
                            {fmtCompact(goalShortfall, currency)}
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
                          {fmtCompact(portfolioNow, currency)}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help text-[10px] uppercase tracking-wider underline decoration-dotted underline-offset-2">
                              Target at age {plan.personal.targetRetirementAge}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            Capital needed at your desired retirement age after expenses, income,
                            taxes, retirement returns, and fees. Shown in {valueModeLabel}.
                          </TooltipContent>
                        </Tooltip>
                        <ValueModeTooltip
                          valueMode={chartValueMode}
                          currency={currency}
                          todayValue={targetTodayAtGoal}
                          nominalValue={targetNominalAtGoal}
                        >
                          <span className="text-sm font-semibold tabular-nums">
                            {fmtCompact(targetAtGoalDisplay, currency)}
                          </span>
                        </ValueModeTooltip>
                      </div>
                    </div>
                    <div className="bg-muted/60 relative h-2.5 overflow-hidden rounded-md border">
                      <div
                        className="bg-success absolute inset-y-0 left-0 transition-[width] duration-500"
                        style={{ width: `${Math.min(progress * 100, 100)}%` }}
                      />
                      {targetAtGoalDisplay > 0 && coastAmountDisplay > 0 && (
                        <div
                          className="bg-foreground/55 absolute -bottom-0.5 -top-0.5 w-[2px]"
                          style={{ left: `${coastPct}%` }}
                          title="Coast FIRE"
                        />
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1 flex justify-between text-[10px]">
                      <span className="tabular-nums">{(progress * 100).toFixed(1)}% funded</span>
                      <span className="tabular-nums">
                        ▲ {L.coast} {fmtCompact(coastAmountDisplay, currency)}
                      </span>
                    </div>
                  </div>

                  {heroGuidance && !isFinanciallyIndependent && yearsFromDesired == null && (
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
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-muted-foreground mb-0.5 text-[10px] font-semibold uppercase tracking-wider">
                      Projection · age {plan.personal.currentAge} →{" "}
                      {plan.personal.planningHorizonAge}
                    </div>
                    <CardTitle className="text-sm">Portfolio trajectory</CardTitle>
                    <div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: CHART_COLORS.portfolio.stroke }}
                        />
                        Projected portfolio
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-0 w-3 border-b border-dashed border-[#888]" />
                        Required capital path
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <RetirementChart
                  data={chartData}
                  currency={currency}
                  retirementAge={plan.personal.targetRetirementAge}
                  projectedFireAge={effectiveFiAge}
                  valueMode={chartValueMode}
                />
                <p className="text-muted-foreground mt-2 text-xs">
                  The FI marker shows the first sustainable age. The portfolio keeps accumulating
                  until your desired retirement age unless FI is reached later; after that,
                  withdrawals fund expenses after income streams.
                </p>
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
                    hint: "Full expenses at your SWR",
                    tip: "Capital that funds your planned expenses at your safe withdrawal rate, for the full retirement horizon.",
                  },
                  {
                    key: "fat",
                    label: "Fat FIRE",
                    value: targetAtGoalDisplay * 1.5,
                    hint: "150% of planned spending",
                    tip: "Retire with ~50% more spending than planned — room for travel, gifts, volatility, and lifestyle upgrades.",
                  },
                ].map((m) => {
                  const pct = m.value > 0 ? Math.min(1, portfolioNow / m.value) : 0;
                  const reached = portfolioNow >= m.value && m.value > 0;
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
                        {fmtCompact(m.value, currency)}
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
            <CardHeader className="pb-4">
              <div className="mb-1 flex items-center gap-2">
                <Icons.CreditCard className="text-muted-foreground h-3.5 w-3.5" />
                <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.15em]">
                  Coverage
                </div>
              </div>
              <CardTitle className="text-[17px] font-semibold leading-none tracking-tight">
                {L.budgetAt}
              </CardTitle>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                How your planned{" "}
                <span className="text-foreground tabular-nums">
                  {fmtCompact(coverageSpendingMonthly, currency)}/mo
                </span>{" "}
                retirement spending is covered at the selected retirement age.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="text-foreground/90 text-sm">
                At age {fireAgeForBudget} —{" "}
                <span className="text-foreground font-semibold tabular-nums">
                  {fmtCompact(coverageSpendingMonthly, currency)}/mo
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

              {/* Expense breakdown — no color dots */}
              <div className="divide-border divide-y">
                {(() => {
                  const rows: { label: string; amount: number }[] = [
                    { label: "Living spending", amount: plan.expenses.living.monthlyAmount },
                  ];
                  if (plan.expenses.healthcare) {
                    rows.push({
                      label: "Healthcare spending",
                      amount: plan.expenses.healthcare.monthlyAmount,
                    });
                  }
                  if (plan.expenses.housing) {
                    rows.push({
                      label: "Housing spending",
                      amount: plan.expenses.housing.monthlyAmount,
                    });
                  }
                  if (plan.expenses.discretionary) {
                    rows.push({
                      label: "Discretionary spending",
                      amount: plan.expenses.discretionary.monthlyAmount,
                    });
                  }
                  return rows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-foreground">{r.label}</span>
                      <span className="text-foreground tabular-nums">
                        {fmtCompact(r.amount, currency)}/mo
                      </span>
                    </div>
                  ));
                })()}
              </div>

              {/* Funding sources — small square dots */}
              <div className="space-y-2.5 border-t pt-4">
                {budgetStreams.map((s, i) => (
                  <div key={s.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{
                          background: INCOME_STREAM_COLORS[i % INCOME_STREAM_COLORS.length],
                        }}
                      />
                      <span className="text-foreground">{s.label}</span>
                    </span>
                    <span className="text-foreground tabular-nums">
                      {fmtCompact(s.monthlyAmount, currency)}/mo{" "}
                      <span className="text-muted-foreground ml-1 text-xs">
                        {(s.percentageOfBudget * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                ))}
                {coveragePortfolioAppliedMonthly > 0 && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="bg-success inline-block h-2.5 w-2.5 rounded-sm" />
                      <span className="text-foreground">Portfolio withdrawal</span>
                    </span>
                    <span className="text-foreground tabular-nums">
                      {fmtCompact(coveragePortfolioAppliedMonthly, currency)}/mo{" "}
                      <span className="text-muted-foreground ml-1 text-xs">
                        {coveragePortfolioPct.toFixed(0)}%
                      </span>
                    </span>
                  </div>
                )}
                {coverageShortfallMonthly > 0 && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/75" />
                      <span className="text-foreground">Unfunded spending</span>
                    </span>
                    <span className="text-foreground tabular-nums">
                      {fmtCompact(coverageShortfallMonthly, currency)}/mo{" "}
                      <span className="text-muted-foreground ml-1 text-xs">
                        {coverageShortfallPct.toFixed(0)}%
                      </span>
                    </span>
                  </div>
                )}
                {coverageEstimatedTaxesMonthly > 0 && (
                  <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs italic">
                    <span>Withdrawal taxes (extra portfolio drag)</span>
                    <span className="tabular-nums">
                      +{fmtCompact(coverageEstimatedTaxesMonthly, currency)}/mo
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Year-by-Year Snapshot — in main column with pagination */}
          {allSnapshots.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-start justify-between pb-3">
                <div>
                  <div className="text-muted-foreground mb-0.5 text-[10px] font-semibold uppercase tracking-wider">
                    Table
                  </div>
                  <CardTitle className="text-sm">Year-by-Year Snapshot</CardTitle>
                  {hasPensionFunds && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Pension fund balances grow with contributions until retirement, then on
                      investment return only.
                    </p>
                  )}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">
                      {tablePage + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                      disabled={tablePage === 0}
                    >
                      <Icons.ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setTablePage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={tablePage >= totalPages - 1}
                    >
                      <Icons.ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b">
                      <th className="pb-2 text-left">Age</th>
                      <th className="pb-2 text-left">Year</th>
                      <th className="pb-2 text-left">Phase</th>
                      <th className="pb-2 text-right">End Portfolio</th>
                      {hasPensionFunds && <th className="pb-2 text-right">Pension Fund</th>}
                      <th className="pb-2 text-right">Contribution/yr</th>
                      <th className="pb-2 text-right">Retirement income/yr</th>
                      <th className="pb-2 text-right">Planned spending/yr</th>
                      <th className="pb-2 text-right">Portfolio withdrawal/yr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSnapshots.map((snap) => {
                      const isFire = snap.phase === "fire";
                      const isFireRow = snap.age === fiAge;
                      const isIncomeRow = plan.incomeStreams.some((s) => s.startAge === snap.age);
                      return (
                        <tr
                          key={snap.age}
                          className={`border-b last:border-0 ${
                            isFireRow
                              ? "bg-green-50 font-semibold dark:bg-green-950/20"
                              : isIncomeRow
                                ? "bg-blue-50 dark:bg-blue-950/20"
                                : ""
                          }`}
                        >
                          <td className="py-1.5">{snap.age}</td>
                          <td className="py-1.5">{snap.year}</td>
                          <td className="py-1.5">
                            <Badge variant={isFire ? "default" : "secondary"} className="text-xs">
                              {isFire ? L.prefix : "Acc."}
                            </Badge>
                          </td>
                          <td className="py-1.5 text-right">
                            {formatAmount(scaleForModeAtAge(snap.portfolioEnd, snap.age), currency)}
                          </td>
                          {hasPensionFunds && (
                            <td className="py-1.5 text-right">
                              {snap.pensionAssets > 0
                                ? formatAmount(
                                    scaleForModeAtAge(snap.pensionAssets, snap.age),
                                    currency,
                                  )
                                : "—"}
                            </td>
                          )}
                          <td className="py-1.5 text-right">
                            {snap.annualContribution > 0
                              ? formatAmount(
                                  scaleForModeAtAge(snap.annualContribution, snap.age),
                                  currency,
                                )
                              : "—"}
                          </td>
                          <td className="py-1.5 text-right">
                            {snap.annualIncome > 0
                              ? formatAmount(
                                  scaleForModeAtAge(snap.annualIncome, snap.age),
                                  currency,
                                )
                              : "—"}
                          </td>
                          <td className="py-1.5 text-right">
                            {(snap.plannedExpenses ?? snap.annualExpenses) > 0
                              ? formatAmount(
                                  scaleForModeAtAge(
                                    snap.plannedExpenses ?? snap.annualExpenses,
                                    snap.age,
                                  ),
                                  currency,
                                )
                              : "—"}
                          </td>
                          <td className="py-1.5 text-right">
                            {snap.netWithdrawalFromPortfolio > 0
                              ? formatAmount(
                                  scaleForModeAtAge(snap.netWithdrawalFromPortfolio, snap.age),
                                  currency,
                                )
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4 lg:col-span-1 lg:self-start">
          <SidebarConfigurator
            plan={plan}
            currency={currency}
            onSavePlan={onSavePlan}
            retirementOverview={retirementOverview}
            goalId={goalId}
            dcLinkedAccountIds={dcLinkedAccountIds}
          />

          {/* Action card — closes the gap (on-track confirmation or guidance) */}
          {heroHealth === "on_track" ? (
            <Card className="border-green-600/20 bg-green-50/60 dark:bg-green-950/20">
              <CardContent className="flex gap-2.5 py-4">
                <Icons.CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div>
                  <div className="text-foreground mb-1 text-sm font-semibold">You're on track.</div>
                  <div className="text-muted-foreground text-xs leading-relaxed">
                    Stress-test with a market drawdown or inflation shock in{" "}
                    <span className="font-medium">Scenarios</span>.
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : heroGuidance ? (
            <Card
              className={`${
                heroHealth === "at_risk"
                  ? "border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20"
                  : "border-red-500/30 bg-red-50/60 dark:bg-red-950/20"
              }`}
            >
              <CardContent className="py-4">
                <div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wider">
                  Close the gap
                </div>
                <div className="text-foreground text-sm font-semibold">What could help</div>
                <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                  {heroGuidance}
                </p>
              </CardContent>
            </Card>
          ) : null}
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
