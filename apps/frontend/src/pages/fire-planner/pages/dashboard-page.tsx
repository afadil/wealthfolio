import type {
  Holding,
  ActivityDetails,
  RetirementOverview,
  RetirementTrajectoryPoint,
} from "@/lib/types";
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
import { useMemo, useState } from "react";
import { GoalFundingEditor } from "@/pages/goals/components/goal-funding-editor";
import type { FireSettings } from "../types";
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
  settings: FireSettings;
  portfolioData: {
    holdings: Holding[];
    activities: ActivityDetails[];
    totalValue: number;
    isLoading: boolean;
    error: Error | null;
  };
  isLoading: boolean;
  plannerMode?: PlannerMode;
  onSaveSettings?: (settings: FireSettings) => void;
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
    budgetAt: mode === "fire" ? "Monthly Budget at FIRE" : "Monthly Budget at Retirement",
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

function pct(value: number) {
  return (value * 100).toFixed(1) + "%";
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

function SidebarRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{children}</span>
    </div>
  );
}

// ─── Chart types & helpers ───────────────────────────────────────

interface ChartPoint {
  label: string; // category axis for reliable ReferenceLine
  age: number;
  portfolio: number;
  target: number;
  withdrawal: number; // annual withdrawal (0 during accumulation)
  phase: string;
  annualContribution: number;
  annualIncome: number;
  annualExpenses: number;
}

const CHART_COLORS = {
  portfolio: { fill: "hsl(38, 75%, 50%)", stroke: "hsl(38, 75%, 50%)" },
};

function RetirementChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;

  return (
    <div className="bg-popover grid grid-cols-1 gap-1.5 rounded-md border p-2.5 shadow-md">
      <p className="text-muted-foreground text-xs font-medium">
        Age {point.age} · {point.phase === "fire" ? "Retirement" : "Accumulation"}
      </p>
      <div className="flex items-center justify-between space-x-4">
        <div className="flex items-center space-x-1.5">
          <span
            className="block h-2 w-2 rounded-full"
            style={{ backgroundColor: CHART_COLORS.portfolio.stroke }}
          />
          <span className="text-muted-foreground text-xs">Portfolio:</span>
        </div>
        <span className="text-xs font-semibold tabular-nums">
          {fmtCompact(point.portfolio, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between space-x-4">
        <div className="flex items-center space-x-1.5">
          <span className="block h-0 w-3 border-b border-dashed border-[#888]" />
          <span className="text-muted-foreground text-xs">Target:</span>
        </div>
        <span className="text-xs font-semibold tabular-nums">
          {fmtCompact(point.target, currency)}
        </span>
      </div>
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
        <span className="text-muted-foreground text-xs">Expenses/yr:</span>
        <span className="text-xs font-semibold tabular-nums">
          {fmtCompact(point.annualExpenses, currency)}
        </span>
      </div>
      {point.withdrawal > 0 && (
        <div className="flex items-center justify-between space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="text-destructive block h-2 w-2 rounded-full" />
            <span className="text-muted-foreground text-xs">Withdrawal/yr:</span>
          </div>
          <span className="text-destructive text-xs font-semibold tabular-nums">
            -{fmtCompact(point.withdrawal, currency)}
          </span>
        </div>
      )}
    </div>
  );
}

function RetirementChart({
  data,
  currency,
  retirementAge,
  projectedFireAge,
}: {
  data: ChartPoint[];
  currency: string;
  retirementAge: number;
  projectedFireAge?: number | null;
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
          <RTooltip content={<RetirementChartTooltip currency={currency} />} />

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
            name="What you'll need"
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
            name="What you'll have"
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

function PlanDetailsCard({
  settings,
  currency,
  onSaveSettings,
  onNavigateToTab,
  plannerMode = "fire",
}: {
  settings: FireSettings;
  currency: string;
  onSaveSettings?: (settings: FireSettings) => void;
  onNavigateToTab?: (tab: string) => void;
  plannerMode?: PlannerMode;
}) {
  const fireAgeLabel = plannerMode === "fire" ? "Desired FIRE age" : "Target retirement age";
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<FireSettings>(settings);

  const startEdit = () => {
    setDraft({ ...settings });
    setIsEditing(true);
  };

  const cancel = () => setIsEditing(false);

  const save = () => {
    onSaveSettings?.(draft);
    setIsEditing(false);
  };

  const updateDraft = (field: keyof FireSettings, value: number) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const healthcareMonthly = settings.healthcareMonthlyAtFire ?? 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Plan Details</CardTitle>
        {!isEditing && onSaveSettings && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={startEdit}>
            Update
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-3">
            <EditRow
              label={fireAgeLabel}
              value={draft.targetFireAge}
              onChange={(v) => updateDraft("targetFireAge", v)}
              step={1}
            />
            <EditRow
              label="Planning horizon"
              value={draft.planningHorizonAge}
              onChange={(v) => updateDraft("planningHorizonAge", v)}
              step={1}
            />
            <EditRow
              label="Monthly contribution"
              value={draft.monthlyContribution}
              onChange={(v) => updateDraft("monthlyContribution", v)}
              step={100}
            />
            <EditRow
              label="Monthly spending"
              value={draft.monthlyExpensesAtFire}
              onChange={(v) => updateDraft("monthlyExpensesAtFire", v)}
              step={100}
            />
            <EditRow
              label="Healthcare/mo"
              value={draft.healthcareMonthlyAtFire ?? 0}
              onChange={(v) => updateDraft("healthcareMonthlyAtFire", v)}
              step={50}
            />
            <EditRow
              label="SWR (%)"
              value={+(draft.safeWithdrawalRate * 100).toFixed(2)}
              onChange={(v) => updateDraft("safeWithdrawalRate", v / 100)}
              step={0.1}
            />
            <div className="flex gap-2 pt-2">
              <Button size="sm" className="flex-1" onClick={save}>
                Save
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-border divide-y">
            <SidebarRow label="Current age">{settings.currentAge}</SidebarRow>
            <SidebarRow label={fireAgeLabel}>{settings.targetFireAge}</SidebarRow>
            <SidebarRow label="Planning horizon">{settings.planningHorizonAge}</SidebarRow>
            <SidebarRow label="Monthly contribution">
              {fmt(settings.monthlyContribution, currency)}
            </SidebarRow>
            <SidebarRow label="Monthly spending">
              {fmt(settings.monthlyExpensesAtFire, currency)}
            </SidebarRow>
            {healthcareMonthly > 0 && (
              <SidebarRow label="Healthcare">{fmt(healthcareMonthly, currency)}/mo</SidebarRow>
            )}
            <SidebarRow label="SWR">{pct(settings.safeWithdrawalRate)}</SidebarRow>
          </div>
        )}
      </CardContent>
      {!isEditing && onNavigateToTab && (
        <div className="border-t px-6 py-3">
          <button
            onClick={() => onNavigateToTab("plan")}
            className="text-muted-foreground text-[11px] hover:underline"
          >
            Full settings &rarr;
          </button>
        </div>
      )}
    </Card>
  );
}

function InvestmentAssumptionsCard({
  settings,
  onSaveSettings,
}: {
  settings: FireSettings;
  onSaveSettings?: (settings: FireSettings) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<FireSettings>(settings);

  const startEdit = () => {
    setDraft({ ...settings });
    setIsEditing(true);
  };

  const cancel = () => setIsEditing(false);

  const save = () => {
    onSaveSettings?.(draft);
    setIsEditing(false);
  };

  const updateDraft = (field: keyof FireSettings, value: number) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Investment Assumptions</CardTitle>
        {!isEditing && onSaveSettings && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={startEdit}>
            Update
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-3">
            <EditRow
              label="Expected return (%)"
              value={+(draft.expectedAnnualReturn * 100).toFixed(2)}
              onChange={(v) => updateDraft("expectedAnnualReturn", v / 100)}
              step={0.1}
            />
            <EditRow
              label="Volatility (%)"
              value={+(draft.expectedReturnStdDev * 100).toFixed(2)}
              onChange={(v) => updateDraft("expectedReturnStdDev", v / 100)}
              step={0.1}
            />
            <EditRow
              label="Inflation (%)"
              value={+(draft.inflationRate * 100).toFixed(2)}
              onChange={(v) => updateDraft("inflationRate", v / 100)}
              step={0.1}
            />
            <EditRow
              label="Contribution growth (%)"
              value={+(draft.contributionGrowthRate * 100).toFixed(2)}
              onChange={(v) => updateDraft("contributionGrowthRate", v / 100)}
              step={0.1}
            />
            <div className="flex gap-2 pt-2">
              <Button size="sm" className="flex-1" onClick={save}>
                Save
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-border divide-y">
            <SidebarRow label="Expected return">{pct(settings.expectedAnnualReturn)}</SidebarRow>
            <SidebarRow label="Volatility">{pct(settings.expectedReturnStdDev)}</SidebarRow>
            <SidebarRow label="Inflation">{pct(settings.inflationRate)}</SidebarRow>
            {settings.contributionGrowthRate > 0 && (
              <SidebarRow label="Contribution growth">
                {pct(settings.contributionGrowthRate)}
              </SidebarRow>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IncomeStreamsCard({
  settings,
  currency,
  onNavigateToTab,
}: {
  settings: FireSettings;
  currency: string;
  onNavigateToTab?: (tab: string) => void;
}) {
  const streams = settings.additionalIncomeStreams;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Income Streams</CardTitle>
        {streams.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {streams.length} stream{streams.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {streams.length > 0 ? (
          <div className="divide-border divide-y">
            {streams.map((s) => (
              <SidebarRow key={s.id} label={s.label || "Income stream"}>
                {fmt(s.monthlyAmount, currency)}/mo from age {s.startAge}
              </SidebarRow>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">No income streams configured</p>
        )}
      </CardContent>
      {onNavigateToTab && (
        <div className="border-t px-6 py-3">
          <button
            onClick={() => onNavigateToTab("plan")}
            className="text-muted-foreground text-[11px] hover:underline"
          >
            Manage in Plan &rarr;
          </button>
        </div>
      )}
    </Card>
  );
}

function EditRow({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="border-input bg-background w-24 rounded-md border px-2 py-1 text-right text-xs tabular-nums"
      />
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────

export default function DashboardPage({
  settings,
  portfolioData,
  isLoading,
  plannerMode = "fire",
  onSaveSettings,
  onNavigateToTab,
  retirementOverview,
  goalId,
  dcLinkedAccountIds,
}: Props) {
  const L = modeLabel(plannerMode);
  const { totalValue, error } = portfolioData;
  const currency = settings.currency;

  // All numbers come from the backend DTO
  const fireTarget = retirementOverview?.grossFireTarget ?? 0;
  const netFireTarget = retirementOverview?.netFireTarget ?? 0;
  const coastAmount = retirementOverview?.coastAmountToday ?? 0;
  const fiAge = retirementOverview?.fiAge ?? null;
  const coastReached = retirementOverview?.coastReached ?? false;
  const progress = retirementOverview?.progress ?? 0;

  const fireAgeForBudget = fiAge ?? settings.targetFireAge;

  // Budget from backend DTO
  const budget = retirementOverview?.budgetBreakdown;
  const totalBudget = budget?.totalMonthlyBudget ?? 0;
  const healthcareMonthly = budget?.monthlyHealthcare ?? 0;
  const portfolioWithdrawalAtFire = budget?.monthlyPortfolioWithdrawal ?? 0;
  const budgetStreams = budget?.incomeStreams ?? [];

  const hasPensionFunds = settings.additionalIncomeStreams.some(
    (s) => (s.currentValue ?? 0) > 0 || (s.monthlyContribution ?? 0) > 0,
  );

  // Chart data from backend trajectory
  const chartData: ChartPoint[] = useMemo(() => {
    if (!retirementOverview?.trajectory?.length) return [];
    return retirementOverview.trajectory.map((pt) => ({
      label: `Age ${pt.age}`,
      age: pt.age,
      portfolio: Math.max(0, pt.portfolioEnd),
      target: pt.requiredCapital,
      withdrawal: pt.netWithdrawalFromPortfolio,
      phase: pt.phase,
      annualContribution: pt.annualContribution,
      annualIncome: pt.annualIncome,
      annualExpenses: pt.annualExpenses,
    }));
  }, [retirementOverview?.trajectory]);

  // Year-by-year table: all years from backend trajectory
  const allSnapshots: RetirementTrajectoryPoint[] = useMemo(() => {
    return retirementOverview?.trajectory ?? [];
  }, [retirementOverview?.trajectory]);

  // Pagination for year-by-year table
  const PAGE_SIZE = 10;
  const [tablePage, setTablePage] = useState(0);
  const totalPages = Math.ceil(allSnapshots.length / PAGE_SIZE);
  const pagedSnapshots = allSnapshots.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE);

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
      {/* Status banner */}
      {totalValue >= netFireTarget && netFireTarget > 0 ? (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-700 dark:bg-green-950/30 dark:text-green-300">
          <strong>Congratulations!</strong> You've reached financial independence!
        </div>
      ) : fiAge != null && fiAge > settings.targetFireAge ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <strong>
            Projected FI is {fiAge - settings.targetFireAge} year
            {fiAge - settings.targetFireAge !== 1 ? "s" : ""} after your desired age.
          </strong>{" "}
          Consider: increase contributions, extend target age, or reduce expenses.
        </div>
      ) : fiAge == null && netFireTarget > 0 ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
          <strong>{L.target} not reachable</strong> by planning horizon age{" "}
          {settings.planningHorizonAge}.
        </div>
      ) : null}

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
                      {fiAge != null
                        ? `Age ${fiAge}`
                        : totalValue >= netFireTarget && netFireTarget > 0
                          ? "FI Reached"
                          : "Not reachable"}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Projected FI Age
                      {settings.targetFireAge > 0 && (
                        <span> · Desired: {settings.targetFireAge}</span>
                      )}
                    </p>
                    <p className="text-sm font-medium">
                      {totalValue >= netFireTarget && netFireTarget > 0 ? (
                        <span className="text-green-600">Financially independent</span>
                      ) : fiAge != null ? (
                        fiAge < settings.targetFireAge ? (
                          <span className="text-green-600">
                            {settings.targetFireAge - fiAge} year
                            {settings.targetFireAge - fiAge !== 1 ? "s" : ""} early
                          </span>
                        ) : fiAge === settings.targetFireAge ? (
                          <span className="text-green-600">On track</span>
                        ) : (
                          <span className="text-amber-600">
                            {fiAge - settings.targetFireAge} year
                            {fiAge - settings.targetFireAge !== 1 ? "s" : ""} late
                          </span>
                        )
                      ) : (
                        <span className="text-red-500">Beyond planning horizon</span>
                      )}
                    </p>
                  </div>
                </div>
                {(() => {
                  const health =
                    fiAge != null && fiAge <= settings.targetFireAge
                      ? "on_track"
                      : fiAge != null && fiAge <= settings.targetFireAge + 3
                        ? "at_risk"
                        : "off_track";
                  return health === "on_track" ? (
                    <Badge variant="default" className="bg-green-600 text-[10px]">
                      On Track
                    </Badge>
                  ) : health === "at_risk" ? (
                    <Badge variant="secondary" className="text-[10px] text-amber-600">
                      At Risk
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">
                      Off Track
                    </Badge>
                  );
                })()}
              </div>

              {/* Progress bar */}
              <div className="mt-5">
                <Progress
                  value={Math.min(progress * 100, 100)}
                  className="[&>div]:bg-success h-2.5"
                />
                <div className="mt-1.5 flex justify-between text-xs">
                  <span>
                    Portfolio <span className="font-semibold">{fmt(totalValue, currency)}</span>
                  </span>
                  <span>
                    <Tooltip>
                      <TooltipTrigger className="cursor-help underline decoration-dotted">
                        {L.target}
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        <p>
                          <strong>Net target</strong> — portfolio needed after subtracting income
                          streams active at retirement.
                        </p>
                        {netFireTarget < fireTarget && (
                          <p className="mt-1">
                            Gross target is {fmt(fireTarget, currency)}. Income offsets{" "}
                            {fmt(fireTarget - netFireTarget, currency)}.
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
                const onTrack = fiAge != null && fiAge <= settings.targetFireAge;
                const currentGap = netFireTarget - totalValue;
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
                          <p className="text-muted-foreground text-xs">Current gap</p>
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
                            Age {fiAge}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-muted-foreground text-xs">
                            {currentGap > 0 ? "Shortfall" : "Surplus"}
                          </p>
                          <p className="mt-0.5 text-base font-semibold tabular-nums">
                            <span className={currentGap <= 0 ? "text-green-600" : "text-red-500"}>
                              {fmt(Math.abs(currentGap), currency)}
                            </span>
                          </p>
                        </div>
                        {fiAge != null && (
                          <div>
                            <p className="text-muted-foreground text-xs">Projected FI</p>
                            <p className="mt-0.5 text-base font-semibold tabular-nums text-amber-600">
                              Age {fiAge}
                              <span className="text-muted-foreground ml-1 text-xs font-normal">
                                ({fiAge - settings.targetFireAge}yr late)
                              </span>
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Retirement projection chart */}
          {chartData.length > 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Projected Retirement Savings</CardTitle>
                <div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHART_COLORS.portfolio.stroke }}
                    />
                    What you'll have
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-0 w-3 border-b border-dashed border-[#888]" />
                    What you'll need
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <RetirementChart
                  data={chartData}
                  currency={currency}
                  retirementAge={settings.targetFireAge}
                  projectedFireAge={fiAge}
                />
              </CardContent>
            </Card>
          )}

          {/* Monthly Budget at Retirement */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{L.budgetAt}</CardTitle>
              <p className="text-muted-foreground text-xs">
                How your {fmt(totalBudget, currency)}/mo is funded at each phase
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium">
                  At age {fireAgeForBudget} — {fmt(totalBudget, currency)}/mo
                  {healthcareMonthly > 0 && (
                    <span className="text-muted-foreground ml-1">
                      ({fmt(budget?.monthlyLivingExpenses ?? 0, currency)} living +{" "}
                      {fmt(healthcareMonthly, currency)} healthcare)
                    </span>
                  )}
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
                  {healthcareMonthly > 0 && (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Living expenses</span>
                        <span className="text-muted-foreground">
                          {fmt(budget?.monthlyLivingExpenses ?? 0, currency)}/mo
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Healthcare</span>
                        <span className="text-muted-foreground">
                          {fmt(healthcareMonthly, currency)}/mo
                        </span>
                      </div>
                    </>
                  )}
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
                  No income streams configured. Add pension, part-time work, or annuity streams in
                  Settings to see how they reduce your portfolio withdrawal.
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
                      <th className="pb-2 text-right">Portfolio</th>
                      {hasPensionFunds && <th className="pb-2 text-right">Pension Fund</th>}
                      <th className="pb-2 text-right">Contribution/yr</th>
                      <th className="pb-2 text-right">Income/yr</th>
                      <th className="pb-2 text-right">Expenses/yr</th>
                      <th className="pb-2 text-right">Net Withdrawal/yr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSnapshots.map((snap) => {
                      const isFire = snap.phase === "fire";
                      const isFireRow = snap.age === fiAge;
                      const isIncomeRow = settings.additionalIncomeStreams.some(
                        (s) => s.startAge === snap.age,
                      );
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
                            {snap.annualExpenses > 0 ? fmt(snap.annualExpenses, currency) : "—"}
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
        <div className="space-y-6 lg:sticky lg:top-6 lg:col-span-1 lg:self-start">
          <PlanDetailsCard
            settings={settings}
            currency={currency}
            onSaveSettings={onSaveSettings}
            onNavigateToTab={onNavigateToTab}
            plannerMode={plannerMode}
          />
          <InvestmentAssumptionsCard settings={settings} onSaveSettings={onSaveSettings} />
          <IncomeStreamsCard
            settings={settings}
            currency={currency}
            onNavigateToTab={onNavigateToTab}
          />
          {goalId && (
            <GoalFundingEditor
              goalId={goalId}
              goalType="retirement"
              dcLinkedAccountIds={dcLinkedAccountIds}
            />
          )}
        </div>
      </div>

      {totalValue === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No portfolio data found. Add accounts and holdings to see your retirement projection.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
