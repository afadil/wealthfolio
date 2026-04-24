import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Goal, GoalPlan, SaveUpOverviewDTO } from "@/lib/types";
import { AmountDisplay, Button, DatePickerInput, MoneyInput } from "@wealthfolio/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGoalPlanMutations } from "../hooks/use-goal-detail";
import { useGoalMutations } from "../hooks/use-goals";
import {
  generateProjectionSeries,
  projectSaveUp,
  type ProjectionPoint,
  type SaveUpProjection,
} from "../lib/save-up-math";
import { GoalFundingEditor } from "./goal-funding-editor";
import { SaveUpProjectionCard } from "./save-up-projection-card";
import { buildSavingsMilestones, SavingsMilestonesCard } from "./savings-milestones-card";

interface SaveUpPlanSettings {
  targetDate?: string;
  targetAmount?: number;
  monthlyContribution?: number;
  /** Legacy field name; read-only fallback for goals saved before the rename. */
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
  const initialMonthlyContribution =
    existingSettings.monthlyContribution ?? existingSettings.plannedMonthlyContribution ?? 0;
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
    const raw =
      useBackendOverview && overview?.trajectory?.length
        ? overview.trajectory
        : !targetDate || !targetAmount
          ? []
          : generateProjectionSeries({
              currentAmount: currentValue,
              targetAmount,
              targetDate,
              monthlyContribution,
              annualReturn,
            });
    // Replace the constant `target` field with a linearly-interpolated required
    // path from the starting balance → target amount. Renders as a diagonal
    // dashed line that shows where you'd need to be on each date to stay on plan.
    if (raw.length === 0 || !targetAmount) return raw;
    const start = raw[0]?.nominal ?? currentValue;
    const span = Math.max(1, raw.length - 1);
    return raw.map((p, i) => ({
      ...p,
      target: start + (targetAmount - start) * (i / span),
      // Range band: [pessimistic, optimistic] — Recharts Area renders the band
      // between the two values when dataKey yields a tuple.
      range: [p.pessimistic, p.optimistic] as [number, number],
    }));
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
      monthlyContribution,
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
  const monthlyDifference = projection ? projection.requiredMonthly - monthlyContribution : null;
  const monthlyDifferenceLabel =
    monthlyDifference === null || Math.abs(monthlyDifference) < 0.5
      ? "Monthly difference"
      : monthlyDifference > 0
        ? "Monthly gap"
        : "Monthly cushion";
  const monthlyDifferenceClass =
    monthlyDifference === null || Math.abs(monthlyDifference) < 0.5
      ? "text-foreground font-semibold"
      : monthlyDifference > 0
        ? "text-destructive font-semibold"
        : "text-success font-semibold";
  const gapMetricLabel =
    projectedGap === null ? "Remaining" : projectedGap >= 0 ? "Surplus" : "Gap";
  const gapMetricValue = projectedGap === null ? remainingNow : Math.abs(projectedGap);
  const targetDateLabel = formatGoalDate(targetDate);
  const savingsMilestones = useMemo(
    () => buildSavingsMilestones(chartData, targetAmount, currentValue),
    [chartData, targetAmount, currentValue],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* ── Main column ── */}
      <div className="space-y-6 lg:col-span-2">
        {/* Hero card */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="p-6">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.badgeClass}`}
                  >
                    {status.label}
                  </span>
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-[0.15em]">
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
                  /mo contribution,{" "}
                  {projection && targetDateLabel && projectedGap !== null ? (
                    projectedGap >= 0 ? (
                      <>
                        this plan is projected to be{" "}
                        <AmountDisplay
                          value={projectedGap}
                          currency={currency}
                          isHidden={isBalanceHidden}
                          className="text-success font-semibold"
                        />{" "}
                        above target by {targetDateLabel}.
                      </>
                    ) : (
                      <>
                        this plan is projected to be{" "}
                        <AmountDisplay
                          value={Math.abs(projectedGap)}
                          currency={currency}
                          isHidden={isBalanceHidden}
                          className="text-destructive font-semibold"
                        />{" "}
                        short by {targetDateLabel}.
                      </>
                    )
                  ) : (
                    "set a target amount and date to see the projected gap."
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
              <HeroMetric label={gapMetricLabel}>
                <AmountDisplay
                  value={gapMetricValue}
                  currency={currency}
                  isHidden={isBalanceHidden}
                />
              </HeroMetric>
              <HeroMetric label="Target date">{targetDateLabel ?? "Not set"}</HeroMetric>
            </div>
          </CardContent>
        </Card>

        {projection && monthlyDifference !== null && (
          <MonthlyPlanCallout
            currentMonthly={monthlyContribution}
            neededMonthly={projection.requiredMonthly}
            monthlyDifference={monthlyDifference}
            monthlyDifferenceLabel={monthlyDifferenceLabel}
            monthlyDifferenceClass={monthlyDifferenceClass}
            completionDate={projection.projectedCompletionDate}
            currency={currency}
            isHidden={isBalanceHidden}
          />
        )}

        {/* Projection chart */}
        {chartData.length > 2 && (
          <SaveUpProjectionCard
            data={chartData}
            currency={currency}
            isHidden={isBalanceHidden}
            annualReturn={annualReturn}
          />
        )}

        {savingsMilestones.length > 0 && (
          <SavingsMilestonesCard
            milestones={savingsMilestones}
            currentValue={currentValue}
            currency={currency}
            isHidden={isBalanceHidden}
          />
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
      <div className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-2 truncate text-lg font-semibold tabular-nums">{children}</div>
    </div>
  );
}

function MonthlyPlanCallout({
  currentMonthly,
  neededMonthly,
  monthlyDifference,
  monthlyDifferenceLabel,
  monthlyDifferenceClass,
  completionDate,
  currency,
  isHidden,
}: {
  currentMonthly: number;
  neededMonthly: number;
  monthlyDifference: number;
  monthlyDifferenceLabel: string;
  monthlyDifferenceClass: string;
  completionDate: string | null;
  currency: string;
  isHidden: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-[0.15em]">
              Action
            </div>
            <h3 className="text-md font-semibold leading-none tracking-tight">Monthly plan</h3>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-3 md:max-w-3xl md:grid-cols-4">
            <CalloutMetric label="Current">
              <AmountDisplay value={currentMonthly} currency={currency} isHidden={isHidden} />
              <span className="text-muted-foreground font-normal">/mo</span>
            </CalloutMetric>
            <CalloutMetric label="Needed">
              <AmountDisplay value={neededMonthly} currency={currency} isHidden={isHidden} />
              <span className="text-muted-foreground font-normal">/mo</span>
            </CalloutMetric>
            <CalloutMetric label={monthlyDifferenceLabel}>
              <AmountDisplay
                value={Math.abs(monthlyDifference)}
                currency={currency}
                isHidden={isHidden}
                className={monthlyDifferenceClass}
              />
              <span className="text-muted-foreground font-normal">/mo</span>
            </CalloutMetric>
            <CalloutMetric label="Finish">
              {formatGoalDate(completionDate) ?? "Not reached"}
            </CalloutMetric>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CalloutMetric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border/70 bg-muted/20 rounded-lg border px-3 py-2.5">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{children}</div>
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
