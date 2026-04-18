import type { Holding, RetirementOverview, RetirementTrajectoryPoint } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  formatAmount,
} from "@wealthfolio/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { Progress } from "@wealthfolio/ui/components/ui/progress";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useMemo, useState, useCallback } from "react";
import { GoalFundingEditor } from "@/pages/goals/components/goal-funding-editor";
import { Input } from "@wealthfolio/ui";
import type {
  RetirementPlan,
  WithdrawalConfig,
  TaxProfile,
  ExpenseBucket,
  RetirementIncomeStream,
  InvestmentAssumptions,
} from "../types";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

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

function fmt(value: number, currency: string) {
  return formatAmount(value, currency);
}

function fmtCompact(value: number, currency: string) {
  if (Math.abs(value) >= 1_000_000) return formatAmount(Math.round(value / 1000) * 1000, currency);
  return formatAmount(value, currency);
}

/** Radial progress ring */
function RadialProgress({ value, size = 80 }: { value: number; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 1);
  const offset = circumference - clamped * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/30"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-success"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {Math.round(clamped * 100)}%
      </span>
    </div>
  );
}

// ─── Chart types & helpers ───────────────────────────────────────

type ChartValueMode = "real" | "nominal";

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
            interval={Math.max(1, Math.floor(data.length / 6))}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, "auto"]} />
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
                value: "Projected FI",
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
              value: "Desired age",
              position: "top",
              fontSize: 10,
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
    <div className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right text-xs font-semibold tabular-nums">{children}</span>
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

function fmtPct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

function pctOfTotal(value: number, total: number) {
  return total > 0 ? ((value / total) * 100).toFixed(0) + "%" : "0%";
}

/** A single sidebar card: title + edit button → read rows or edit fields */
function SidebarCard({
  title,
  editing,
  onEdit,
  onSave,
  onCancel,
  dirty,
  readContent,
  editContent,
}: {
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
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={onEdit}
                aria-label={`Edit ${title}`}
              >
                <Icons.Pencil className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Edit {title.toLowerCase()}</TooltipContent>
          </Tooltip>
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

  const addStream = () => {
    update((d) => ({
      ...d,
      incomeStreams: [
        ...d.incomeStreams,
        {
          id: crypto.randomUUID?.() ?? `stream-${Date.now()}`,
          label: `Income ${d.incomeStreams.length + 1}`,
          streamType: "db" as const,
          startAge: d.personal.targetRetirementAge,
          adjustForInflation: true,
          monthlyAmount: 0,
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

  const budget = retirementOverview?.budgetBreakdown;
  const effectiveTaxRate = budget?.effectiveTaxRate ?? 0;
  const taxBucketBalances = retirementOverview?.taxBucketBalances;
  const taxBucketTotal = taxBucketBalances
    ? taxBucketBalances.taxable + taxBucketBalances.taxDeferred + taxBucketBalances.taxFree
    : 0;
  const allTaxRatesZero =
    (draft.tax?.taxableWithdrawalRate ?? 0) === 0 &&
    (draft.tax?.taxDeferredWithdrawalRate ?? 0) === 0 &&
    (draft.tax?.taxFreeWithdrawalRate ?? 0) === 0;

  const strategyLabels: Record<string, string> = {
    "constant-dollar": "Constant Dollar",
    "constant-percentage": "Constant %",
    guardrails: "Guardrails",
  };

  return (
    <div className="space-y-4">
      {/* ── Plan ── */}
      <SidebarCard
        title="Retirement Timeline"
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
              {fmt(draft.investment.monthlyContribution, currency)}
            </ConfigRow>
            <ConfigRow label="Target withdrawal rate for sizing">
              {fmtPct(draft.withdrawal.safeWithdrawalRate)}
            </ConfigRow>
          </div>
        }
        editContent={
          <>
            <InlineField
              label="Current age"
              value={draft.personal.currentAge}
              onChange={(v) => setPersonal("currentAge", v)}
              min={1}
            />
            <InlineField
              label="Desired retirement age"
              value={draft.personal.targetRetirementAge}
              onChange={(v) => setPersonal("targetRetirementAge", v)}
              min={draft.personal.currentAge + 1}
            />
            <InlineField
              label="Plan through age"
              value={draft.personal.planningHorizonAge}
              onChange={(v) => setPersonal("planningHorizonAge", v)}
              min={draft.personal.targetRetirementAge + 1}
            />
            <InlineField
              label="Monthly contribution until retirement"
              value={draft.investment.monthlyContribution}
              onChange={(v) => setInvestment("monthlyContribution", v)}
              step={100}
              min={0}
            />
            <InlineField
              label="Target withdrawal rate for sizing"
              value={+(draft.withdrawal.safeWithdrawalRate * 100).toFixed(2)}
              onChange={(v) => setWithdrawal("safeWithdrawalRate", v / 100)}
              step={0.1}
              suffix="%"
            />
          </>
        }
      />

      {/* ── Expenses ── */}
      <SidebarCard
        title="Retirement Spending"
        editing={editingSection === "expenses"}
        onEdit={() => setEditingSection("expenses")}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={
          <div className="divide-border divide-y">
            <ConfigRow label="Living spending">
              {fmt(draft.expenses.living.monthlyAmount, currency)}/mo
            </ConfigRow>
            {draft.expenses.healthcare.monthlyAmount > 0 && (
              <ConfigRow label="Healthcare spending">
                {fmt(draft.expenses.healthcare.monthlyAmount, currency)}/mo
              </ConfigRow>
            )}
            {draft.expenses.housing && (
              <ConfigRow label="Housing spending">
                {fmt(draft.expenses.housing.monthlyAmount, currency)}/mo
              </ConfigRow>
            )}
            {draft.expenses.discretionary && (
              <ConfigRow label="Discretionary spending">
                {fmt(draft.expenses.discretionary.monthlyAmount, currency)}/mo
              </ConfigRow>
            )}
          </div>
        }
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
                  className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-2"
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
                  className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-2"
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
        title="Retirement Income"
        editing={editingSection === "income"}
        onEdit={() => setEditingSection("income")}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={
          draft.incomeStreams.length > 0 ? (
            <div className="divide-border divide-y">
              {draft.incomeStreams.map((s) => (
                <ConfigRow key={s.id} label={s.label || "Stream"}>
                  {fmt(s.monthlyAmount ?? 0, currency)}/mo from {s.startAge}
                </ConfigRow>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">No retirement income configured</p>
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
              className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-[11px] transition-colors"
              onClick={addStream}
            >
              <Icons.Plus className="h-3 w-3" /> Add retirement income
            </button>
          </>
        }
      />

      {/* ── Investment ── */}
      <SidebarCard
        title="Portfolio Assumptions"
        editing={editingSection === "investment"}
        onEdit={() => setEditingSection("investment")}
        onSave={saveDraft}
        onCancel={cancelEdit}
        dirty={dirty}
        readContent={
          <div className="divide-border divide-y">
            <ConfigRow label="Expected annual return">
              {fmtPct(draft.investment.expectedAnnualReturn)}
            </ConfigRow>
            <ConfigRow label="Annual volatility">
              {fmtPct(draft.investment.expectedReturnStdDev)}
            </ConfigRow>
            <ConfigRow label="Inflation">{fmtPct(draft.investment.inflationRate)}</ConfigRow>
            {draft.investment.contributionGrowthRate > 0 && (
              <ConfigRow label="Contribution growth per year">
                {fmtPct(draft.investment.contributionGrowthRate)}
              </ConfigRow>
            )}
          </div>
        }
        editContent={
          <>
            <InlineField
              label="Expected annual return"
              value={+(draft.investment.expectedAnnualReturn * 100).toFixed(2)}
              onChange={(v) => setInvestment("expectedAnnualReturn", v / 100)}
              step={0.1}
              suffix="%"
            />
            <InlineField
              label="Annual volatility"
              value={+(draft.investment.expectedReturnStdDev * 100).toFixed(2)}
              onChange={(v) => setInvestment("expectedReturnStdDev", v / 100)}
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
                {fmtPct(draft.tax?.taxableWithdrawalRate ?? 0)}
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
                {fmtPct(draft.tax?.taxDeferredWithdrawalRate ?? 0)}
              </ConfigRow>
              <ConfigRow
                label={
                  <InfoLabel label="Tax-free account rate">
                    Effective tax rate applied to TFSA, Roth, or similar tax-free withdrawals. This
                    is usually 0%.
                  </InfoLabel>
                }
              >
                {fmtPct(draft.tax?.taxFreeWithdrawalRate ?? 0)}
              </ConfigRow>
              {effectiveTaxRate > 0 && (
                <ConfigRow
                  label={
                    <InfoLabel label="Blended tax drag">
                      The effective tax rate for the retirement withdrawal mix at the selected FI
                      age, based on account buckets and withdrawal order.
                    </InfoLabel>
                  }
                >
                  {(effectiveTaxRate * 100).toFixed(1)}%
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
                    {fmt(taxBucketBalances.taxable, currency)}{" "}
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
                    {fmt(taxBucketBalances.taxDeferred, currency)}{" "}
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
                    {fmt(taxBucketBalances.taxFree, currency)}{" "}
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

  // All numbers come from the backend DTO
  const fireTarget = retirementOverview?.grossFireTarget ?? 0;
  const netFireTarget = retirementOverview?.netFireTarget ?? 0;
  const coastAmount = retirementOverview?.coastAmountToday ?? 0;
  const fiAge = retirementOverview?.fiAge ?? null;
  const retirementStartAge = retirementOverview?.retirementStartAge ?? null;
  const suggestedAge = retirementOverview?.suggestedGoalAgeIfUnchanged ?? null;
  // Effective FI age: genuine FI age, or the accumulation-only suggested age for display
  const effectiveFiAge = fiAge ?? suggestedAge;
  const coastReached = retirementOverview?.coastReached ?? false;
  const progress = retirementOverview?.progress ?? 0;

  const fireAgeForBudget = retirementStartAge ?? plan.personal.targetRetirementAge;

  // Budget from backend DTO
  const budget = retirementOverview?.budgetBreakdown;
  const totalBudget = budget?.totalMonthlyBudget ?? 0;
  const healthcareMonthly = budget?.monthlyHealthcare ?? 0;
  const housingMonthly = budget?.monthlyHousing ?? 0;
  const discretionaryMonthly = budget?.monthlyDiscretionary ?? 0;
  const effectiveTaxRate = budget?.effectiveTaxRate ?? 0;
  const portfolioWithdrawalAtFire = budget?.monthlyPortfolioWithdrawal ?? 0;
  const budgetStreams = budget?.incomeStreams ?? [];

  const hasPensionFunds = plan.incomeStreams.some(
    (s) => (s.currentValue ?? 0) > 0 || (s.monthlyContribution ?? 0) > 0,
  );

  const [chartValueMode, setChartValueMode] = useState<ChartValueMode>("real");

  // Chart data from backend trajectory
  const chartData: ChartPoint[] = useMemo(() => {
    if (!retirementOverview?.trajectory?.length) return [];
    const inflationBase = Math.max(1 + plan.investment.inflationRate, 0.01);
    const scaleForAge = (value: number, age: number) => {
      if (chartValueMode === "nominal") return value;
      const yearsFromNow = Math.max(0, age - plan.personal.currentAge);
      return value / Math.pow(inflationBase, yearsFromNow);
    };
    return retirementOverview.trajectory.map((pt) => ({
      label: `Age ${pt.age}`,
      age: pt.age,
      portfolio: scaleForAge(Math.max(0, pt.portfolioStart), pt.age),
      portfolioStart: scaleForAge(Math.max(0, pt.portfolioStart), pt.age),
      portfolioEnd: scaleForAge(Math.max(0, pt.portfolioEnd), pt.age),
      target: scaleForAge(pt.requiredCapital, pt.age),
      withdrawal: scaleForAge(pt.netWithdrawalFromPortfolio, pt.age),
      phase: pt.phase,
      annualContribution: scaleForAge(pt.annualContribution, pt.age),
      annualIncome: scaleForAge(pt.annualIncome, pt.age),
      annualExpenses: scaleForAge(pt.plannedExpenses ?? pt.annualExpenses, pt.age),
      netChange:
        scaleForAge(Math.max(0, pt.portfolioEnd), pt.age) -
        scaleForAge(Math.max(0, pt.portfolioStart), pt.age),
    }));
  }, [
    chartValueMode,
    plan.investment.inflationRate,
    plan.personal.currentAge,
    retirementOverview?.trajectory,
  ]);

  // Year-by-year table: all years from backend trajectory
  const allSnapshots: RetirementTrajectoryPoint[] = useMemo(() => {
    return retirementOverview?.trajectory ?? [];
  }, [retirementOverview?.trajectory]);

  // Pagination for year-by-year table
  const PAGE_SIZE = 10;
  const [tablePage, setTablePage] = useState(0);
  const totalPages = Math.ceil(allSnapshots.length / PAGE_SIZE);
  const pagedSnapshots = allSnapshots.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE);

  const isFinanciallyIndependent = portfolioNow >= netFireTarget && netFireTarget > 0;
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
      : effectiveFiAge == null && netFireTarget > 0
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
      {/* Two-column layout: main + sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Main column ── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Hero + Projections (merged) */}
          <Card>
            <CardContent className="py-6">
              {/* Top section: FI Age headline + status + health badge */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-5">
                  <RadialProgress value={progress} size={80} />
                  <div className="space-y-1">
                    <p className="text-3xl font-bold tabular-nums">
                      {effectiveFiAge != null
                        ? `Age ${effectiveFiAge}`
                        : isFinanciallyIndependent
                          ? "FI Reached"
                          : "Not reachable"}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Projected FI Age
                      {plan.personal.targetRetirementAge > 0 && (
                        <span> · Desired: {plan.personal.targetRetirementAge}</span>
                      )}
                    </p>
                    <p className="text-sm font-medium">
                      {isFinanciallyIndependent ? (
                        <span className="text-green-600">Financially independent</span>
                      ) : effectiveFiAge != null ? (
                        effectiveFiAge < plan.personal.targetRetirementAge ? (
                          <span className="text-green-600">
                            {plan.personal.targetRetirementAge - effectiveFiAge} year
                            {plan.personal.targetRetirementAge - effectiveFiAge !== 1
                              ? "s"
                              : ""}{" "}
                            early
                          </span>
                        ) : effectiveFiAge === plan.personal.targetRetirementAge ? (
                          <span className="text-green-600">On track</span>
                        ) : (
                          <span className="text-amber-600">
                            {effectiveFiAge - plan.personal.targetRetirementAge} year
                            {effectiveFiAge - plan.personal.targetRetirementAge !== 1
                              ? "s"
                              : ""}{" "}
                            late
                          </span>
                        )
                      ) : (
                        <span className="text-red-500">Beyond planning horizon</span>
                      )}
                    </p>
                  </div>
                </div>
                {heroHealth === "on_track" ? (
                  <Badge variant="default" className="bg-green-600 text-[10px]">
                    On Track
                  </Badge>
                ) : heroHealth === "at_risk" ? (
                  <Badge variant="secondary" className="text-[10px] text-amber-600">
                    At Risk
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px]">
                    Off Track
                  </Badge>
                )}
              </div>

              {/* Progress bar */}
              <div className="mt-5">
                <Progress
                  value={Math.min(progress * 100, 100)}
                  className="[&>div]:bg-success h-2.5"
                />
                <div className="mt-1.5 flex justify-between text-xs">
                  <span>
                    Included portfolio{" "}
                    <span className="font-semibold">{fmt(portfolioNow, currency)}</span>
                  </span>
                  <span>
                    <Tooltip>
                      <TooltipTrigger className="cursor-help underline decoration-dotted">
                        Retire-today target
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        <p>
                          <strong>Retire-today target</strong> - capital needed if the retirement
                          phase started now, after subtracting income streams active now.
                        </p>
                        {netFireTarget < fireTarget && (
                          <p className="mt-1">
                            Unadjusted target is {fmt(fireTarget, currency)}. Schedule and income
                            adjustments reduce it by {fmt(fireTarget - netFireTarget, currency)}.
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>{" "}
                    <span className="font-semibold">{fmt(netFireTarget, currency)}</span>
                  </span>
                </div>
              </div>

              {/* Key metrics grid — context-aware */}
              {(() => {
                const onTrack =
                  isFinanciallyIndependent ||
                  (effectiveFiAge != null && effectiveFiAge <= plan.personal.targetRetirementAge);
                const currentGap = netFireTarget - portfolioNow;
                const goalShortfall = retirementOverview.shortfallAtGoalAge;
                const goalSurplus = retirementOverview.surplusAtGoalAge;
                return (
                  <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 border-t pt-5 sm:grid-cols-3">
                    {plannerMode === "fire" && (
                      <div>
                        <p className="text-muted-foreground text-xs">{L.coast}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-base font-semibold tabular-nums">
                          {fmt(coastAmount, currency)}
                          {coastReached ? (
                            <Badge variant="default" className="bg-green-600 text-[10px]">
                              Reached
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Not yet
                            </Badge>
                          )}
                        </p>
                      </div>
                    )}
                    {onTrack ? (
                      <>
                        <div>
                          <p className="text-muted-foreground text-xs">Retire-today gap</p>
                          <p className="mt-0.5 text-base font-semibold tabular-nums">
                            {currentGap > 0 ? (
                              fmt(currentGap, currency)
                            ) : (
                              <span className="text-green-600">None</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Projected FI</p>
                          <p className="mt-0.5 text-base font-semibold tabular-nums text-green-600">
                            {effectiveFiAge != null ? `Age ${effectiveFiAge}` : "Reached"}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-muted-foreground text-xs">
                            {goalShortfall > 0
                              ? `Shortfall at age ${plan.personal.targetRetirementAge}`
                              : `Surplus at age ${plan.personal.targetRetirementAge}`}
                          </p>
                          <p className="mt-0.5 text-base font-semibold tabular-nums">
                            <span className={goalShortfall > 0 ? "text-red-500" : "text-green-600"}>
                              {fmt(goalShortfall > 0 ? goalShortfall : goalSurplus, currency)}
                            </span>
                          </p>
                        </div>
                        {effectiveFiAge != null && (
                          <div>
                            <p className="text-muted-foreground text-xs">Projected FI</p>
                            <p className="mt-0.5 text-base font-semibold tabular-nums text-amber-600">
                              Age {effectiveFiAge}
                              <span className="text-muted-foreground ml-1 text-xs font-normal">
                                ({effectiveFiAge - plan.personal.targetRetirementAge}yr late)
                              </span>
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
              {heroGuidance && (
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

          {/* Retirement projection chart */}
          {chartData.length > 2 && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">Retirement Portfolio Projection</CardTitle>
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
                  <div className="bg-muted/30 flex rounded-md border p-0.5">
                    <Button
                      type="button"
                      variant={chartValueMode === "real" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setChartValueMode("real")}
                    >
                      Today's value
                    </Button>
                    <Button
                      type="button"
                      variant={chartValueMode === "nominal" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setChartValueMode("nominal")}
                    >
                      Nominal
                    </Button>
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
                  The portfolio line uses start-of-age balances to match the FI decision. In
                  constant-dollar mode, withdrawals fund expenses after income streams; the
                  portfolio can still grow when returns exceed withdrawals.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Retirement spending coverage */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{L.budgetAt}</CardTitle>
              <p className="text-muted-foreground text-xs">
                How your planned {fmt(totalBudget, currency)}/mo retirement spending is covered at
                the selected retirement age.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium">
                  At age {fireAgeForBudget} - {fmt(totalBudget, currency)}/mo planned spending
                </p>
                <div className="mb-3 flex h-5 w-full overflow-hidden rounded-full">
                  {budgetStreams.map((s, i) => {
                    const colors = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899"];
                    return (
                      <div
                        key={s.label}
                        style={{
                          width: `${s.percentageOfBudget}%`,
                          background: colors[i % colors.length],
                        }}
                        title={`${s.label}: ${fmt(s.monthlyAmount, currency)}/mo`}
                      />
                    );
                  })}
                  {portfolioWithdrawalAtFire > 0 && (
                    <div
                      style={{
                        width: `${totalBudget > 0 ? (portfolioWithdrawalAtFire / totalBudget) * 100 : 100}%`,
                      }}
                      className="bg-muted-foreground/30"
                      title={`Portfolio: ${fmt(portfolioWithdrawalAtFire, currency)}/mo`}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  {/* Expense buckets breakdown */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Living spending</span>
                    <span className="text-muted-foreground">
                      {fmt(budget?.monthlyLivingExpenses ?? 0, currency)}/mo
                    </span>
                  </div>
                  {healthcareMonthly > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Healthcare spending</span>
                      <span className="text-muted-foreground">
                        {fmt(healthcareMonthly, currency)}/mo
                      </span>
                    </div>
                  )}
                  {housingMonthly > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Housing spending</span>
                      <span className="text-muted-foreground">
                        {fmt(housingMonthly, currency)}/mo
                      </span>
                    </div>
                  )}
                  {discretionaryMonthly > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Discretionary spending</span>
                      <span className="text-muted-foreground">
                        {fmt(discretionaryMonthly, currency)}/mo
                      </span>
                    </div>
                  )}
                  {effectiveTaxRate > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Tax drag</span>
                      <span className="text-muted-foreground">
                        {(effectiveTaxRate * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {/* Funding sources */}
                  {budgetStreams.map((s, i) => {
                    const colors = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899"];
                    return (
                      <div key={s.label} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: colors[i % colors.length] }}
                          />
                          {s.label}
                        </span>
                        <span className="text-muted-foreground">
                          {fmt(s.monthlyAmount, currency)}/mo{" "}
                          <span className="text-foreground ml-1 font-medium">
                            {s.percentageOfBudget.toFixed(0)}%
                          </span>
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="bg-muted-foreground/30 inline-block h-2.5 w-2.5 rounded-full" />
                      Portfolio withdrawal
                    </span>
                    <span className="text-muted-foreground">
                      {fmt(portfolioWithdrawalAtFire, currency)}/mo{" "}
                      <span className="text-foreground ml-1 font-medium">
                        {totalBudget > 0
                          ? ((portfolioWithdrawalAtFire / totalBudget) * 100).toFixed(0)
                          : 0}
                        %
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {budgetStreams.length === 0 && (
                <p className="text-muted-foreground text-xs">
                  No retirement income configured. Add pension, part-time work, or annuity streams
                  in the Plan tab to see how they reduce your portfolio withdrawal.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Year-by-Year Snapshot — in main column with pagination */}
          {allSnapshots.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <div>
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
                          <td className="py-1.5 text-right">{fmt(snap.portfolioEnd, currency)}</td>
                          {hasPensionFunds && (
                            <td className="py-1.5 text-right">
                              {snap.pensionAssets > 0 ? fmt(snap.pensionAssets, currency) : "—"}
                            </td>
                          )}
                          <td className="py-1.5 text-right">
                            {snap.annualContribution > 0
                              ? fmt(snap.annualContribution, currency)
                              : "—"}
                          </td>
                          <td className="py-1.5 text-right">
                            {snap.annualIncome > 0 ? fmt(snap.annualIncome, currency) : "—"}
                          </td>
                          <td className="py-1.5 text-right">
                            {(snap.plannedExpenses ?? snap.annualExpenses) > 0
                              ? fmt(snap.plannedExpenses ?? snap.annualExpenses, currency)
                              : "—"}
                          </td>
                          <td className="py-1.5 text-right">
                            {snap.netWithdrawalFromPortfolio > 0
                              ? fmt(snap.netWithdrawalFromPortfolio, currency)
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
        <div className="lg:sticky lg:top-6 lg:col-span-1 lg:self-start">
          <SidebarConfigurator
            plan={plan}
            currency={currency}
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
