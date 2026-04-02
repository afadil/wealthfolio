import type { Goal, GoalPlan, SaveUpOverviewDTO } from "@/lib/types";
import { GoalFundingEditor } from "./goal-funding-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Badge, Button, DatePickerInput, Input, Label } from "@wealthfolio/ui";
import { AmountDisplay, formatPercent, MoneyInput, formatAmount } from "@wealthfolio/ui";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { Progress } from "@wealthfolio/ui/components/ui/progress";
import {
  projectSaveUp,
  generateProjectionSeries,
  type SaveUpProjection,
  type ProjectionPoint,
} from "../lib/save-up-math";
import { useMemo, useState, useCallback } from "react";
import { useGoalPlanMutations } from "../hooks/use-goal-detail";
import { useGoalMutations } from "../hooks/use-goals";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SaveUpPlanSettings {
  targetDate?: string;
  targetAmount?: number;
  plannedMonthlyContribution?: number;
  expectedAnnualReturn?: number;
}

function parseSaveUpSettings(plan: GoalPlan | null | undefined): SaveUpPlanSettings {
  if (!plan?.settingsJson || plan.planKind !== "save_up") return {};
  try {
    return JSON.parse(plan.settingsJson);
  } catch {
    return {};
  }
}

interface Props {
  goal: Goal;
  plan: GoalPlan | null | undefined;
  overview?: SaveUpOverviewDTO;
}

export default function SaveUpDetailPage({ goal, plan, overview }: Props) {
  const { isBalanceHidden } = useBalancePrivacy();
  const { savePlanMutation } = useGoalPlanMutations(goal.id);
  const { updateMutation } = useGoalMutations();
  const existingSettings = parseSaveUpSettings(plan);
  const progress = overview?.progress ?? goal.progressCached ?? 0;
  const currentValue = overview?.currentValue ?? goal.currentValueCached ?? 0;
  const currency = goal.currency ?? "USD";

  // Editable fields
  const [targetAmount, setTargetAmount] = useState(goal.targetAmount ?? 0);
  const [targetDate, setTargetDate] = useState(
    existingSettings.targetDate ?? goal.targetDate ?? "",
  );
  const [monthlyContribution, setMonthlyContribution] = useState(
    existingSettings.plannedMonthlyContribution ?? 0,
  );
  const [annualReturn, setAnnualReturn] = useState(existingSettings.expectedAnnualReturn ?? 0.05);

  const [isEditingPlan, setIsEditingPlan] = useState(false);

  const projection: SaveUpProjection | null = useMemo(() => {
    // Use backend overview when available, fall back to local computation
    if (overview) {
      return {
        projectedValue: overview.projectedValueAtTargetDate,
        requiredMonthly: overview.requiredMonthlyContribution,
        projectedCompletionDate: overview.projectedCompletionDate,
        health: overview.health as SaveUpProjection["health"],
      };
    }
    if (!targetDate || !targetAmount) return null;
    return projectSaveUp({
      currentAmount: currentValue,
      targetAmount,
      targetDate,
      monthlyContribution,
      annualReturn,
    });
  }, [overview, currentValue, targetAmount, targetDate, monthlyContribution, annualReturn]);

  const chartData: ProjectionPoint[] = useMemo(() => {
    if (overview?.trajectory?.length) {
      return overview.trajectory;
    }
    if (!targetDate || !targetAmount) return [];
    return generateProjectionSeries({
      currentAmount: currentValue,
      targetAmount,
      targetDate,
      monthlyContribution,
      annualReturn,
    });
  }, [overview, currentValue, targetAmount, targetDate, monthlyContribution, annualReturn]);

  const handleSave = useCallback(() => {
    const settings: SaveUpPlanSettings = {
      targetDate,
      targetAmount,
      plannedMonthlyContribution: monthlyContribution,
      expectedAnnualReturn: annualReturn,
    };

    savePlanMutation.mutate({
      goalId: goal.id,
      planKind: "save_up",
      settingsJson: JSON.stringify(settings),
    });

    const prog = targetAmount > 0 ? Math.min(currentValue / targetAmount, 1) : 0;
    updateMutation.mutate({
      ...goal,
      targetAmount: targetAmount || undefined,
      targetDate: targetDate || undefined,
      currentValueCached: currentValue,
      progressCached: prog,
      projectedValueAtTargetDate: projection?.projectedValue,
      projectedCompletionDate: projection?.projectedCompletionDate ?? undefined,
      statusHealth: projection?.health ?? "not_applicable",
    });

    setIsEditingPlan(false);
  }, [
    goal,
    targetAmount,
    targetDate,
    monthlyContribution,
    annualReturn,
    currentValue,
    projection,
    savePlanMutation,
    updateMutation,
  ]);

  const handleCancelEdit = useCallback(() => {
    const s = parseSaveUpSettings(plan);
    setTargetAmount(goal.targetAmount ?? 0);
    setTargetDate(s.targetDate ?? goal.targetDate ?? "");
    setMonthlyContribution(s.plannedMonthlyContribution ?? 0);
    setAnnualReturn(s.expectedAnnualReturn ?? 0.05);
    setIsEditingPlan(false);
  }, [plan, goal]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* ── Main column ── */}
      <div className="space-y-6 lg:col-span-2">
        {/* Hero card */}
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-6">
              <RadialProgress value={progress} size={80} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium">
                  {progress >= 1
                    ? "Goal reached!"
                    : progress >= 0.75
                      ? "You're almost there."
                      : progress >= 0.5
                        ? "Great progress on this goal."
                        : progress > 0
                          ? "Building toward your goal."
                          : "Set up your plan to start tracking."}
                </p>
                <p className="text-muted-foreground text-xs">
                  <AmountDisplay
                    value={currentValue}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />{" "}
                  saved
                  {targetAmount > 0 && (
                    <>
                      {" of "}
                      <AmountDisplay
                        value={targetAmount}
                        currency={currency}
                        isHidden={isBalanceHidden}
                      />{" "}
                      target
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <Progress
                value={Math.min(progress * 100, 100)}
                className="[&>div]:bg-success h-2.5"
              />
              <div className="text-muted-foreground mt-1.5 flex justify-between text-[11px]">
                <span>
                  <AmountDisplay
                    value={currentValue}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                </span>
                <span className="flex items-center gap-1">
                  {formatPercent(progress)}
                  {targetAmount > 0 && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <AmountDisplay
                        value={targetAmount}
                        currency={currency}
                        isHidden={isBalanceHidden}
                      />
                    </>
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projection chart */}
        {chartData.length > 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Projected Savings</CardTitle>
              <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: COLORS.optimistic.stroke }}
                  />
                  Optimistic ({((annualReturn + 0.02) * 100).toFixed(0)}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: COLORS.nominal.stroke }}
                  />
                  Nominal ({(annualReturn * 100).toFixed(0)}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: COLORS.pessimistic.stroke }}
                  />
                  Pessimistic ({(Math.max(0, annualReturn - 0.02) * 100).toFixed(0)}%)
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <ProjectionChart data={chartData} currency={currency} isHidden={isBalanceHidden} />
            </CardContent>
          </Card>
        )}

        {!plan && !projection && (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground text-sm">
                Configure your plan to see projections.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Sidebar ── */}
      <div className="space-y-6 lg:sticky lg:top-6 lg:col-span-1 lg:self-start">
        {/* Plan Details — read / edit toggle */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm">Plan Details</CardTitle>
            {!isEditingPlan && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setIsEditingPlan(true)}
              >
                Update
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isEditingPlan ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Target Amount</Label>
                  <MoneyInput value={targetAmount} onValueChange={(v) => setTargetAmount(v ?? 0)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Target Date</Label>
                  <DatePickerInput
                    value={targetDate || undefined}
                    onChange={(date) => setTargetDate(date ? date.toISOString().split("T")[0] : "")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Monthly Contribution</Label>
                  <MoneyInput
                    value={monthlyContribution}
                    onValueChange={(v) => setMonthlyContribution(v ?? 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">
                    Expected Annual Return (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={(annualReturn * 100).toFixed(1)}
                    onChange={(e) => setAnnualReturn(Number(e.target.value) / 100)}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={handleSave}
                    disabled={savePlanMutation.isPending}
                  >
                    {savePlanMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-border divide-y">
                <SidebarRow label="Target Amount">
                  <AmountDisplay
                    value={targetAmount}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                </SidebarRow>
                <SidebarRow label="Target Date">
                  {targetDate
                    ? new Date(targetDate).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                      })
                    : "—"}
                </SidebarRow>
                <SidebarRow label="Monthly Contribution">
                  <AmountDisplay
                    value={monthlyContribution}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                  <span className="text-muted-foreground font-normal">/mo</span>
                </SidebarRow>
                <SidebarRow label="Expected Return">{(annualReturn * 100).toFixed(1)}%</SidebarRow>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projections */}
        {projection && (
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Projections</CardTitle>
              {projection.health === "on_track" ? (
                <Badge variant="default" className="bg-green-600 text-[10px]">
                  On Track
                </Badge>
              ) : projection.health === "at_risk" ? (
                <Badge variant="secondary" className="text-[10px] text-amber-600">
                  At Risk
                </Badge>
              ) : projection.health === "off_track" ? (
                <Badge variant="destructive" className="text-[10px]">
                  Off Track
                </Badge>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="divide-border divide-y">
                <SidebarRow label="Projected at Target">
                  <AmountDisplay
                    value={projection.projectedValue}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                </SidebarRow>

                {/* Spending ability comparison — projected vs target */}
                <div className="py-2.5">
                  <span className="text-muted-foreground text-xs">Projected vs Target</span>
                  <div className="mt-2 space-y-1.5">
                    <div>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span
                          className={
                            projection.projectedValue >= targetAmount
                              ? "text-green-600"
                              : "text-amber-600"
                          }
                        >
                          Projected
                        </span>
                        <span className="font-medium">
                          <AmountDisplay
                            value={projection.projectedValue}
                            currency={currency}
                            isHidden={isBalanceHidden}
                          />
                        </span>
                      </div>
                      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                        <div
                          className={`h-full rounded-full ${projection.projectedValue >= targetAmount ? "bg-green-500" : "bg-amber-500"}`}
                          style={{
                            width: `${Math.min(100, targetAmount > 0 ? (projection.projectedValue / targetAmount) * 100 : 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Target</span>
                        <span className="font-medium">
                          <AmountDisplay
                            value={targetAmount}
                            currency={currency}
                            isHidden={isBalanceHidden}
                          />
                        </span>
                      </div>
                      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                        <div className="bg-muted-foreground/30 h-full w-full rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>

                <SidebarRow label="Required Monthly">
                  <AmountDisplay
                    value={projection.requiredMonthly}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                  <span className="text-muted-foreground font-normal">/mo</span>
                </SidebarRow>
                <SidebarRow label="Est. Completion">
                  {projection.projectedCompletionDate
                    ? new Date(projection.projectedCompletionDate).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                      })
                    : "Not reached"}
                </SidebarRow>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Funding */}
        <GoalFundingEditor goalId={goal.id} goalType={goal.goalType} />
      </div>
    </div>
  );
}

// ─── Shared helpers ──────────────────────────────────────────────

function SidebarRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{children}</span>
    </div>
  );
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

// ─── Chart ───────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateLabel(v: string) {
  const [y, m] = v.split("-");
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

function ProjectionTooltip({
  active,
  payload,
  currency,
  isHidden,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  currency: string;
  isHidden: boolean;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ProjectionPoint | undefined;
  if (!point) return null;

  const [y, m] = point.date.split("-");
  const label = `${MONTHS[Number(m) - 1]} ${y}`;
  const fmt = (v: number) => (isHidden ? "***" : formatAmount(v, currency, false));

  const rows = [
    { label: "Optimistic", value: point.optimistic, color: COLORS.optimistic.stroke },
    { label: "Nominal", value: point.nominal, color: COLORS.nominal.stroke },
    { label: "Pessimistic", value: point.pessimistic, color: COLORS.pessimistic.stroke },
  ];

  return (
    <div className="bg-popover grid grid-cols-1 gap-1.5 rounded-md border p-2 shadow-md">
      <p className="text-muted-foreground text-xs">{label}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="block h-0.5 w-3" style={{ backgroundColor: r.color }} />
            <span className="text-muted-foreground text-xs">{r.label}:</span>
          </div>
          <span className="text-xs font-semibold tabular-nums">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

const COLORS = {
  optimistic: { fill: "hsl(38, 75%, 50%)", opacity: 0.1, stroke: "hsl(38, 75%, 50%)" },
  nominal: { fill: "hsl(38, 75%, 50%)", opacity: 0.2, stroke: "hsl(38, 75%, 50%)" },
  pessimistic: { fill: "hsl(38, 60%, 60%)", opacity: 0.12, stroke: "hsl(38, 60%, 55%)" },
  target: "hsl(var(--muted-foreground))",
};

function ProjectionChart({
  data,
  currency,
  isHidden,
}: {
  data: ProjectionPoint[];
  currency: string;
  isHidden: boolean;
}) {
  const target = data[0]?.target ?? 0;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="projOptimistic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.optimistic.fill} stopOpacity={0.08} />
            <stop offset="95%" stopColor={COLORS.optimistic.fill} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="projNominal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.nominal.fill} stopOpacity={0.2} />
            <stop offset="70%" stopColor={COLORS.nominal.fill} stopOpacity={0.12} />
            <stop offset="100%" stopColor={COLORS.nominal.fill} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="projPessimistic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.pessimistic.fill} stopOpacity={0.25} />
            <stop offset="70%" stopColor={COLORS.pessimistic.fill} stopOpacity={0.15} />
            <stop offset="100%" stopColor={COLORS.pessimistic.fill} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          tickFormatter={formatDateLabel}
          interval={Math.max(1, Math.floor(data.length / 7))}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide domain={[(min: number) => min * 0.95, "auto"]} />
        <Tooltip content={<ProjectionTooltip currency={currency} isHidden={isHidden} />} />
        <Area
          type="monotone"
          dataKey="optimistic"
          stroke={COLORS.optimistic.stroke}
          strokeWidth={1}
          strokeOpacity={0.6}
          fill="url(#projOptimistic)"
          fillOpacity={1}
          animationDuration={300}
          animationEasing="ease-out"
        />
        <Area
          type="monotone"
          dataKey="nominal"
          stroke={COLORS.nominal.stroke}
          strokeWidth={1.5}
          fill="url(#projNominal)"
          fillOpacity={1}
          animationDuration={300}
          animationEasing="ease-out"
        />
        <Area
          type="monotone"
          dataKey="pessimistic"
          stroke={COLORS.pessimistic.stroke}
          strokeWidth={1}
          strokeOpacity={0.6}
          fill="url(#projPessimistic)"
          fillOpacity={1}
          animationDuration={300}
          animationEasing="ease-out"
        />
        {target > 0 && (
          <ReferenceLine
            y={target}
            stroke={COLORS.target}
            strokeDasharray="6 4"
            strokeOpacity={0.5}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
