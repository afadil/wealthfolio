import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Goal, GoalPlan, SaveUpOverviewDTO } from "@/lib/types";
import {
  AmountDisplay,
  Button,
  DatePickerInput,
  formatAmount,
  formatPercent,
  MoneyInput,
} from "@wealthfolio/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useGoalPlanMutations } from "../hooks/use-goal-detail";
import { useGoalMutations } from "../hooks/use-goals";
import {
  generateProjectionSeries,
  projectSaveUp,
  type ProjectionPoint,
  type SaveUpProjection,
} from "../lib/save-up-math";
import { GoalFundingEditor } from "./goal-funding-editor";

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
  const { settings } = useSettingsContext();
  const { savePlanMutation } = useGoalPlanMutations(goal.id);
  const { updateMutation } = useGoalMutations();
  const existingSettings = parseSaveUpSettings(plan);
  const progress = overview?.progress ?? goal.summaryProgress ?? 0;
  const currentValue = overview?.currentValue ?? goal.summaryCurrentValue ?? 0;
  const currency = settings?.baseCurrency ?? goal.currency ?? "USD";
  const initialTargetAmount = goal.targetAmount ?? 0;
  const initialTargetDate = existingSettings.targetDate ?? goal.targetDate ?? "";
  const initialMonthlyContribution = existingSettings.plannedMonthlyContribution ?? 0;
  const initialAnnualReturn = existingSettings.expectedAnnualReturn ?? 0.05;

  // Editable fields
  const [targetAmount, setTargetAmount] = useState(initialTargetAmount);
  const [targetDate, setTargetDate] = useState(initialTargetDate);
  const [monthlyContribution, setMonthlyContribution] = useState(initialMonthlyContribution);
  const [annualReturn, setAnnualReturn] = useState(initialAnnualReturn);

  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const useBackendOverview = !isEditingPlan && !!overview;
  const displayProgress = targetAmount > 0 ? Math.min(currentValue / targetAmount, 1) : progress;
  const remainingNow = Math.max(targetAmount - currentValue, 0);
  const isPlanDirty =
    targetAmount !== initialTargetAmount ||
    targetDate !== initialTargetDate ||
    monthlyContribution !== initialMonthlyContribution ||
    annualReturn !== initialAnnualReturn;
  const persistedPlanKey = JSON.stringify([
    initialTargetAmount,
    initialTargetDate,
    initialMonthlyContribution,
    initialAnnualReturn,
  ]);

  useEffect(() => {
    if (isEditingPlan) return;
    setTargetAmount(initialTargetAmount);
    setTargetDate(initialTargetDate);
    setMonthlyContribution(initialMonthlyContribution);
    setAnnualReturn(initialAnnualReturn);
    // Only sync when persisted values change. Toggling edit mode should not snap drafts back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedPlanKey]);

  const projection: SaveUpProjection | null = useMemo(() => {
    // Use backend overview for saved state, but recompute locally while editing.
    if (useBackendOverview && overview) {
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
  }, [
    useBackendOverview,
    overview,
    currentValue,
    targetAmount,
    targetDate,
    monthlyContribution,
    annualReturn,
  ]);

  const chartData: ProjectionPoint[] = useMemo(() => {
    if (useBackendOverview && overview?.trajectory?.length) {
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
  }, [
    useBackendOverview,
    overview,
    currentValue,
    targetAmount,
    targetDate,
    monthlyContribution,
    annualReturn,
  ]);

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
      summaryCurrentValue: currentValue,
      summaryProgress: prog,
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
    setTargetAmount(initialTargetAmount);
    setTargetDate(initialTargetDate);
    setMonthlyContribution(initialMonthlyContribution);
    setAnnualReturn(initialAnnualReturn);
    setIsEditingPlan(false);
  }, [initialTargetAmount, initialTargetDate, initialMonthlyContribution, initialAnnualReturn]);

  const status = getSaveUpStatus({
    goalTitle: goal.title,
    currentValue,
    targetAmount,
    targetDate,
    projection,
  });
  const projectedGap = projection ? projection.projectedValue - targetAmount : null;
  const targetDateLabel = formatGoalDate(targetDate);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* ── Main column ── */}
      <div className="space-y-6 lg:col-span-2">
        {/* Hero card */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="p-6">
              <div className="flex gap-5">
                <div className={`w-1.5 shrink-0 rounded-full ${status.accentClass}`} />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.badgeClass}`}
                    >
                      {status.label}
                    </span>
                    <span className="text-muted-foreground font-mono text-xs uppercase tracking-[0.18em]">
                      Savings plan
                    </span>
                  </div>
                  <h2 className="font-serif text-2xl leading-tight tracking-tight">
                    {status.headlinePrefix}{" "}
                    <span className={status.textClass}>{status.headlineEmphasis}</span>
                    {status.headlineSuffix}
                  </h2>
                  <p className="text-muted-foreground mt-4 max-w-3xl text-sm leading-6">
                    At your current{" "}
                    <AmountDisplay
                      value={monthlyContribution}
                      currency={currency}
                      isHidden={isBalanceHidden}
                      className="text-foreground font-semibold"
                    />
                    /mo contribution, this plan projects{" "}
                    {projection ? (
                      <AmountDisplay
                        value={projection.projectedValue}
                        currency={currency}
                        isHidden={isBalanceHidden}
                        className="text-foreground font-semibold underline decoration-dotted underline-offset-4"
                      />
                    ) : (
                      <span className="text-foreground font-semibold">no projection</span>
                    )}
                    {targetDateLabel ? ` by ${targetDateLabel}.` : "."}
                    {targetAmount > 0 && projectedGap !== null && (
                      <>
                        {" "}
                        {projectedGap >= 0 ? "Projected surplus: " : "Projected gap: "}
                        <AmountDisplay
                          value={Math.abs(projectedGap)}
                          currency={currency}
                          isHidden={isBalanceHidden}
                          className={
                            projectedGap >= 0
                              ? "text-success font-semibold"
                              : "text-destructive font-semibold"
                          }
                        />
                        .
                      </>
                    )}
                  </p>
                  <div className="bg-muted mt-5 h-2 overflow-hidden rounded-full">
                    <div
                      className={`h-full rounded-full ${status.progressClass}`}
                      style={{ width: `${Math.min(displayProgress * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="border-border grid grid-cols-2 divide-x divide-y border-t md:grid-cols-4 md:divide-y-0">
              <HeroMetric label="Saved">
                <AmountDisplay
                  value={currentValue}
                  currency={currency}
                  isHidden={isBalanceHidden}
                />
              </HeroMetric>
              <HeroMetric label="Target">
                {targetAmount > 0 ? (
                  <AmountDisplay
                    value={targetAmount}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                ) : (
                  "Not set"
                )}
              </HeroMetric>
              <HeroMetric label="Remaining">
                <AmountDisplay
                  value={remainingNow}
                  currency={currency}
                  isHidden={isBalanceHidden}
                />
              </HeroMetric>
              <HeroMetric label="Progress">
                <span className={status.textClass}>{formatPercent(displayProgress)}</span>
              </HeroMetric>
            </div>
          </CardContent>
        </Card>

        {/* Projection chart */}
        {chartData.length > 2 && (
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <div className="text-muted-foreground mb-1 font-mono text-xs font-semibold uppercase tracking-[0.18em]">
                  Projection
                </div>
                <CardTitle className="text-lg leading-tight">Savings trajectory</CardTitle>
              </div>
              <div className="text-muted-foreground flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs">
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
        <SidebarCard
          kicker="Plan"
          title="Savings Inputs"
          editing={isEditingPlan}
          onEdit={() => setIsEditingPlan(true)}
          onSave={handleSave}
          onCancel={handleCancelEdit}
          dirty={isPlanDirty}
          pending={savePlanMutation.isPending}
          readContent={
            <div className="divide-border divide-y">
              <SidebarRow label="Target amount">
                <AmountDisplay
                  value={targetAmount}
                  currency={currency}
                  isHidden={isBalanceHidden}
                />
              </SidebarRow>
              <SidebarRow label="Target date">{targetDateLabel ?? "Not set"}</SidebarRow>
              <SidebarRow label="Monthly contribution">
                <AmountDisplay
                  value={monthlyContribution}
                  currency={currency}
                  isHidden={isBalanceHidden}
                />
                <span className="text-muted-foreground font-normal">/mo</span>
              </SidebarRow>
              <SidebarRow label="Expected return">{(annualReturn * 100).toFixed(1)}%</SidebarRow>
            </div>
          }
          editContent={
            <>
              <LeverRow
                label="Target amount"
                hint="Amount needed for this goal"
                kind="money"
                value={targetAmount}
                onChange={setTargetAmount}
                min={0}
                max={sliderMaxFor(Math.max(targetAmount, currentValue), 100_000, 25_000)}
                step={100}
                prefix="$"
                format={(v) => Math.round(v).toLocaleString()}
              />
              <DateRow
                label="Target date"
                hint="When you want this money available"
                value={targetDate}
                onChange={setTargetDate}
              />
              <LeverRow
                label="Monthly contribution"
                hint="Planned additions to this goal"
                kind="money"
                value={monthlyContribution}
                onChange={setMonthlyContribution}
                min={0}
                max={sliderMaxFor(monthlyContribution, 5_000, 500)}
                step={25}
                prefix="$"
                format={(v) => Math.round(v).toLocaleString()}
              />
              <LeverRow
                label="Expected annual return"
                hint="Set to 0% for pure cash goals"
                value={annualReturn}
                onChange={setAnnualReturn}
                min={0}
                max={0.12}
                step={0.001}
                suffix="%"
                format={(v) => (v * 100).toFixed(1)}
              />
            </>
          }
        />

        {/* Projections */}
        {projection && (
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <div>
                <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-[0.15em]">
                  Projection
                </div>
                <CardTitle className="text-md leading-none tracking-tight">
                  Savings Forecast
                </CardTitle>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-semibold ${status.badgeClass}`}
              >
                {status.label}
              </span>
            </CardHeader>
            <CardContent>
              <div className="divide-border divide-y">
                <SidebarRow label="Projected at target">
                  <AmountDisplay
                    value={projection.projectedValue}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                </SidebarRow>

                {/* Projected amount against the user-authored target. */}
                <div className="py-2.5">
                  <span className="text-muted-foreground text-xs">Projected vs target</span>
                  <div className="mt-2 space-y-1.5">
                    <ProjectionBar
                      projected={projection.projectedValue}
                      target={targetAmount}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </div>
                </div>

                <SidebarRow label="Required monthly">
                  <AmountDisplay
                    value={projection.requiredMonthly}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                  <span className="text-muted-foreground font-normal">/mo</span>
                </SidebarRow>
                <SidebarRow label="Estimated completion">
                  {formatGoalDate(projection.projectedCompletionDate) ?? "Not reached"}
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

interface SaveUpStatus {
  label: string;
  headlinePrefix: string;
  headlineEmphasis: string;
  headlineSuffix: string;
  accentClass: string;
  badgeClass: string;
  textClass: string;
  progressClass: string;
}

function getSaveUpStatus({
  goalTitle,
  currentValue,
  targetAmount,
  targetDate,
  projection,
}: {
  goalTitle: string;
  currentValue: number;
  targetAmount: number;
  targetDate: string;
  projection: SaveUpProjection | null;
}): SaveUpStatus {
  const dateLabel = formatGoalDate(targetDate) ?? "your target date";

  if (!targetAmount || !targetDate) {
    return {
      label: "Setup needed",
      headlinePrefix: "Set a target to",
      headlineEmphasis: "track",
      headlineSuffix: ` ${goalTitle}.`,
      accentClass: "bg-muted-foreground/40",
      badgeClass: "bg-muted text-muted-foreground",
      textClass: "text-muted-foreground",
      progressClass: "bg-muted-foreground/40",
    };
  }

  if (currentValue >= targetAmount) {
    return {
      label: "Reached",
      headlinePrefix: "You've",
      headlineEmphasis: "reached",
      headlineSuffix: ` ${goalTitle}.`,
      accentClass: "bg-success",
      badgeClass: "bg-success text-success-foreground",
      textClass: "text-success",
      progressClass: "bg-success",
    };
  }

  if (projection?.health === "on_track") {
    return {
      label: "On track",
      headlinePrefix: "You're",
      headlineEmphasis: "on track",
      headlineSuffix: ` for ${goalTitle} by ${dateLabel}.`,
      accentClass: "bg-success",
      badgeClass: "bg-success text-success-foreground",
      textClass: "text-success",
      progressClass: "bg-success",
    };
  }

  if (projection?.health === "at_risk") {
    return {
      label: "At risk",
      headlinePrefix: `${goalTitle} is`,
      headlineEmphasis: "close",
      headlineSuffix: ` but not fully covered by ${dateLabel}.`,
      accentClass: "bg-yellow-600",
      badgeClass: "bg-yellow-100 text-yellow-800",
      textClass: "text-yellow-700",
      progressClass: "bg-yellow-600",
    };
  }

  return {
    label: "Off track",
    headlinePrefix: "You're",
    headlineEmphasis: "short",
    headlineSuffix: ` for ${goalTitle} by ${dateLabel}.`,
    accentClass: "bg-destructive",
    badgeClass: "bg-destructive text-destructive-foreground",
    textClass: "text-destructive",
    progressClass: "bg-destructive",
  };
}

function formatGoalDate(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month) return null;
  return new Date(year, month - 1, day || 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
}

function sliderMaxFor(value: number, baseMax: number, increment: number) {
  return Math.max(baseMax, Math.ceil(value / increment) * increment + increment);
}

function HeroMetric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <div className="text-muted-foreground font-mono text-[11px] font-semibold uppercase tracking-[0.18em]">
        {label}
      </div>
      <div className="mt-2 truncate text-lg font-semibold tabular-nums">{children}</div>
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

function SidebarCard({
  kicker,
  title,
  editing,
  onEdit,
  onSave,
  onCancel,
  dirty,
  pending,
  readContent,
  editContent,
}: {
  kicker: string;
  title: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  dirty: boolean;
  pending: boolean;
  readContent: React.ReactNode;
  editContent: React.ReactNode;
}) {
  const renderEditActions = () => (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="sm" className="h-7 text-xs" onClick={onSave} disabled={!dirty || pending}>
        {pending ? "Saving..." : "Save"}
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between pb-4">
        <div className="min-w-0">
          <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-[0.15em]">
            {kicker}
          </div>
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
            <div className="divide-border divide-y">{editContent}</div>
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

function DateRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="py-4 first:pt-1 last:pb-1">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-foreground text-sm font-semibold leading-tight">{label}</div>
          <div className="text-muted-foreground mt-1 text-xs leading-tight">{hint}</div>
        </div>
      </div>
      <DatePickerInput
        value={value || undefined}
        onChange={(date) => onChange(date ? date.toISOString().split("T")[0] : "")}
      />
    </div>
  );
}

function ProjectionBar({
  projected,
  target,
  currency,
  isHidden,
}: {
  projected: number;
  target: number;
  currency: string;
  isHidden: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (projected / target) * 100) : 0;
  const onTrack = projected >= target;

  return (
    <div className="mt-2 space-y-2">
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${onTrack ? "bg-success" : "bg-yellow-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-muted-foreground flex justify-between text-[11px]">
        <span>Projected</span>
        <span className="font-medium tabular-nums">
          <AmountDisplay value={projected} currency={currency} isHidden={isHidden} />
        </span>
      </div>
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
