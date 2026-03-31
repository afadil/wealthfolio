import type { Goal, GoalPlan } from "@/lib/types";
import { GoalFundingEditor } from "./goal-funding-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Button, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui";
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
}

export default function SaveUpDetailPage({ goal, plan }: Props) {
  const { isBalanceHidden } = useBalancePrivacy();
  const { savePlanMutation } = useGoalPlanMutations(goal.id);
  const { updateMutation } = useGoalMutations();
  const existingSettings = parseSaveUpSettings(plan);
  const progress = goal.progressCached ?? 0;
  const currentValue = goal.currentValueCached ?? 0;
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

  const projection: SaveUpProjection | null = useMemo(() => {
    if (!targetDate || !targetAmount) return null;
    return projectSaveUp({
      currentAmount: currentValue,
      targetAmount,
      targetDate,
      monthlyContribution,
      annualReturn,
    });
  }, [currentValue, targetAmount, targetDate, monthlyContribution, annualReturn]);

  const chartData: ProjectionPoint[] = useMemo(() => {
    if (!targetDate || !targetAmount) return [];
    return generateProjectionSeries({
      currentAmount: currentValue,
      targetAmount,
      targetDate,
      monthlyContribution,
      annualReturn,
    });
  }, [currentValue, targetAmount, targetDate, monthlyContribution, annualReturn]);

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

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="plan">Plan</TabsTrigger>
        <TabsTrigger value="funding">Funding</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <div className="space-y-6">
          {/* Progress card */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-4">
                <Progress
                  value={Math.min(progress * 100, 100)}
                  className="[&>div]:bg-success h-3 flex-1"
                />
                <span className="text-sm font-medium tabular-nums">{formatPercent(progress)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Current Value</p>
                  <p className="text-xl font-bold tabular-nums">
                    <AmountDisplay
                      value={currentValue}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">Target</p>
                  <p className="text-xl font-bold tabular-nums">
                    <AmountDisplay
                      value={targetAmount}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </p>
                </div>
              </div>

              {/* KPI row */}
              {projection && (
                <div className="border-border grid grid-cols-3 gap-4 border-t pt-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Projected at Target</p>
                    <p className="font-semibold tabular-nums">
                      <AmountDisplay
                        value={projection.projectedValue}
                        currency={currency}
                        isHidden={isBalanceHidden}
                      />
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Required Monthly</p>
                    <p className="font-semibold tabular-nums">
                      <AmountDisplay
                        value={projection.requiredMonthly}
                        currency={currency}
                        isHidden={isBalanceHidden}
                      />
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Est. Completion</p>
                    <p className="font-semibold">
                      {projection.projectedCompletionDate
                        ? new Date(projection.projectedCompletionDate).toLocaleDateString(
                            undefined,
                            { year: "numeric", month: "short" },
                          )
                        : "Not reached"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Projection chart */}
          {chartData.length > 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Projection</CardTitle>
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
      </TabsContent>

      <TabsContent value="plan">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Plan Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Target Amount</Label>
                <MoneyInput
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Target Date</Label>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Monthly Contribution</Label>
                <MoneyInput
                  value={monthlyContribution}
                  onChange={(e) => setMonthlyContribution(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expected Annual Return (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={(annualReturn * 100).toFixed(1)}
                  onChange={(e) => setAnnualReturn(Number(e.target.value) / 100)}
                />
              </div>
            </div>
            <Button onClick={handleSave} disabled={savePlanMutation.isPending}>
              {savePlanMutation.isPending ? "Saving..." : "Save Plan"}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="funding">
        <GoalFundingEditor goalId={goal.id} goalType={goal.goalType} />
      </TabsContent>
    </Tabs>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateLabel(v: string) {
  const [y, m] = v.split("-");
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

/** Custom tooltip matching the app's history chart style. */
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

// Colors matching the net-worth chart golden style
const COLORS = {
  optimistic: { fill: "hsl(38, 75%, 50%)", opacity: 0.1, stroke: "hsl(38, 75%, 50%)" },
  nominal: { fill: "hsl(38, 75%, 50%)", opacity: 0.2, stroke: "hsl(38, 75%, 50%)" },
  pessimistic: { fill: "hsl(38, 60%, 60%)", opacity: 0.12, stroke: "hsl(38, 60%, 55%)" },
  target: "hsl(var(--muted-foreground))",
};

/** Projection chart matching the net-worth chart style. */
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

        {/* Optimistic — back layer, lightest */}
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

        {/* Nominal — middle layer, main golden stroke */}
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

        {/* Pessimistic — front layer, most opaque fill */}
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

        {/* Target reference line */}
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
