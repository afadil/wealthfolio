import type { Holding, ActivityDetails } from "@/lib/types";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  formatAmount,
} from "@wealthfolio/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { FireSettings, IncomeStream } from "../types";
import {
  calculateFireTarget,
  calculateNetFireTarget,
  calculateCoastFireAmount,
  projectFireDate,
  resolveDcPayouts,
} from "../lib/fire-math";

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
}

function fmt(value: number, currency: string) {
  return formatAmount(value, currency);
}

function pct(value: number) {
  return (value * 100).toFixed(1) + "%";
}

function singleStreamIncome(
  s: IncomeStream,
  baseMonthly: number,
  age: number,
  yearsFromStart: number,
  inflationRate: number,
): number {
  if (age < s.startAge) return 0;
  const rate =
    s.annualGrowthRate !== undefined
      ? s.annualGrowthRate
      : s.adjustForInflation
        ? inflationRate
        : 0;
  return baseMonthly * 12 * Math.pow(1 + rate, yearsFromStart);
}

export default function DashboardPage({ settings, portfolioData, isLoading }: Props) {
  const { t } = useTranslation();
  const { totalValue, error } = portfolioData;
  const currency = settings.currency;

  const fireTarget = useMemo(() => calculateFireTarget(settings), [settings]);
  const netFireTarget = useMemo(() => calculateNetFireTarget(settings), [settings]);
  const coastAmount = useMemo(() => calculateCoastFireAmount(settings), [settings]);
  const projection = useMemo(() => projectFireDate(settings, totalValue), [settings, totalValue]);

  const progress = netFireTarget > 0 ? Math.min(1, totalValue / netFireTarget) : 0;

  const fireAgeForBudget = projection.fireAge ?? settings.targetFireAge;

  // Resolve DC stream payouts so the budget uses derived amounts (not the raw monthlyAmount field)
  const dcPayouts = useMemo(
    () =>
      resolveDcPayouts(
        settings.additionalIncomeStreams,
        settings.currentAge,
        settings.targetFireAge,
        settings.safeWithdrawalRate,
      ),
    [settings],
  );
  const resolvedMonthly = (s: IncomeStream) => dcPayouts.get(s.id) ?? s.monthlyAmount;

  // Streams active from day-1 of FIRE (payout age <= FIRE age)
  const activeStreams = settings.additionalIncomeStreams.filter(
    (s) => s.startAge <= fireAgeForBudget && resolvedMonthly(s) > 0,
  );
  // Streams that kick in later
  const deferredStreams = settings.additionalIncomeStreams
    .filter((s) => s.startAge > fireAgeForBudget && resolvedMonthly(s) > 0)
    .sort((a, b) => a.startAge - b.startAge);

  const healthcareMonthly = settings.healthcareMonthlyAtFire ?? 0;
  const totalActiveIncome = activeStreams.reduce((sum, s) => sum + resolvedMonthly(s), 0);
  const totalBudget = settings.monthlyExpensesAtFire + healthcareMonthly;
  const portfolioWithdrawalAtFire = Math.max(0, totalBudget - totalActiveIncome);

  const hasPensionFunds = settings.additionalIncomeStreams.some(
    (s) => (s.currentValue ?? 0) > 0 || (s.monthlyContribution ?? 0) > 0,
  );

  // Key snapshots to show in table
  const keyAges = new Set<number>();
  keyAges.add(settings.currentAge);
  keyAges.add(settings.currentAge + 5);
  keyAges.add(settings.currentAge + 10);
  if (projection.fireAge) {
    keyAges.add(projection.fireAge);
    keyAges.add(projection.fireAge + 5);
    keyAges.add(projection.fireAge + 10);
    keyAges.add(projection.fireAge + 15);
  }
  settings.additionalIncomeStreams.forEach((s) => keyAges.add(s.startAge));

  const tableSnapshots = projection.yearByYear.filter((y) => keyAges.has(y.age));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive p-4 text-sm">
        {t("fire_planner.dash.error_load", { message: error.message })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Warning: retirement triggered by age, not by FI */}
      {!projection.fundedAtRetirement && (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <Trans
            i18nKey="fire_planner.dash.underfunded"
            values={{ age: settings.targetFireAge }}
            components={{ 0: <strong /> }}
          />
        </div>
      )}
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              <Tooltip>
                <TooltipTrigger className="cursor-help underline decoration-dotted">
                  {t("fire_planner.dash.kpi_fire_target_net")}
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  <p>
                    <Trans i18nKey="fire_planner.dash.kpi_net_tooltip_p1" components={{ 0: <strong /> }} />
                  </p>
                  {netFireTarget < fireTarget && (
                    <p className="mt-1">
                      <Trans
                        i18nKey="fire_planner.dash.kpi_net_tooltip_p2"
                        values={{ gross: fmt(fireTarget, currency) }}
                        components={{ 0: <strong /> }}
                      />
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{fmt(netFireTarget, currency)}</p>
            {netFireTarget < fireTarget ? (
              <p className="text-muted-foreground text-xs">
                {t("fire_planner.dash.kpi_gross_line", {
                  gross: fmt(fireTarget, currency),
                  income: fmt(totalActiveIncome, currency),
                  covers: fmt(fireTarget - netFireTarget, currency),
                })}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {t("fire_planner.dash.kpi_swr_line", {
                  swr: pct(settings.safeWithdrawalRate),
                  expenses: fmt(settings.monthlyExpensesAtFire, currency),
                })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              {t("fire_planner.dash.kpi_portfolio_value")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{fmt(totalValue, currency)}</p>
            <p
              className={`text-xs ${totalValue >= netFireTarget ? "text-green-600" : "text-muted-foreground"}`}
            >
              {totalValue >= netFireTarget
                ? t("fire_planner.dash.kpi_above_target", {
                    amount: fmt(totalValue - netFireTarget, currency),
                  })
                : t("fire_planner.dash.kpi_to_go", {
                    amount: fmt(netFireTarget - totalValue, currency),
                  })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              {t("fire_planner.dash.kpi_progress")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{pct(progress)}</p>
            <p className="text-muted-foreground text-xs">{t("fire_planner.dash.kpi_toward_fire")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              {t("fire_planner.dash.kpi_est_fire_age")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">
              {projection.fireAge ?? t("fire_planner.dash.not_reached")}
            </p>
            <p className="text-muted-foreground text-xs">
              {projection.fireAge != null
                ? projection.fireAge < settings.targetFireAge
                  ? t("fire_planner.dash.yrs_ahead", {
                      n: settings.targetFireAge - projection.fireAge,
                    })
                  : projection.fireAge === settings.targetFireAge
                    ? t("fire_planner.dash.on_target", { age: settings.targetFireAge })
                    : t("fire_planner.dash.target_age_only", { age: settings.targetFireAge })
                : t("fire_planner.dash.not_reached_by", {
                    age: settings.planningHorizonAge,
                  })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("fire_planner.dash.fire_progress_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span>{t("fire_planner.dash.portfolio_vs_target")}</span>
              <span>{pct(progress)}</span>
            </div>
            <div className="bg-muted h-3 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, progress * 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coast FIRE Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            {t("fire_planner.dash.coast_title")}
            {projection.coastFireReached ? (
              <Badge variant="default" className="bg-green-600 text-xs">
                {t("fire_planner.dash.coast_reached")}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                {t("fire_planner.dash.coast_not_yet")}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs">{t("fire_planner.dash.coast_amount_label")}</p>
              <p className="font-semibold">{fmt(coastAmount, currency)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("fire_planner.dash.current_portfolio")}</p>
              <p className="font-semibold">{fmt(totalValue, currency)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">
                {projection.coastFireReached
                  ? t("fire_planner.dash.surplus")
                  : t("fire_planner.dash.gap")}
              </p>
              <p
                className={`font-semibold ${projection.coastFireReached ? "text-green-600" : "text-red-500"}`}
              >
                {fmt(Math.abs(totalValue - coastAmount), currency)}
              </p>
            </div>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            {t("fire_planner.dash.coast_help", { age: settings.targetFireAge })}
          </p>
        </CardContent>
      </Card>

      {/* Monthly Budget at FIRE */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("fire_planner.dash.monthly_budget_title")}</CardTitle>
          <p className="text-muted-foreground text-xs">
            {t("fire_planner.dash.monthly_budget_sub", { total: fmt(totalBudget, currency) })}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Phase 1: at FIRE age */}
          <div>
            <p className="mb-2 text-xs font-medium">
              {t("fire_planner.dash.at_fire_age", {
                age: fireAgeForBudget,
                total: fmt(totalBudget, currency),
              })}
              {healthcareMonthly > 0 && (
                <span className="text-muted-foreground ml-1">
                  {t("fire_planner.dash.living_plus_healthcare", {
                    living: fmt(settings.monthlyExpensesAtFire, currency),
                    health: fmt(healthcareMonthly, currency),
                  })}
                </span>
              )}
            </p>

            {/* Visual bar */}
            <div className="mb-3 flex h-5 w-full overflow-hidden rounded-full">
              {activeStreams.map((s, i) => {
                const monthly = resolvedMonthly(s);
                const pctVal = totalBudget > 0 ? (monthly / totalBudget) * 100 : 0;
                const colors = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899"];
                return (
                  <div
                    key={s.id}
                    style={{ width: `${pctVal}%`, background: colors[i % colors.length] }}
                    title={`${s.label}: ${fmt(monthly, currency)}/mo`}
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

            {/* Breakdown rows */}
            <div className="space-y-1">
              {healthcareMonthly > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("fire_planner.dash.living_expenses")}</span>
                  <span className="text-muted-foreground">
                    {fmt(settings.monthlyExpensesAtFire, currency)}/mo
                  </span>
                </div>
              )}
              {healthcareMonthly > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("fire_planner.dash.healthcare")}</span>
                  <span className="text-muted-foreground">
                    {fmt(healthcareMonthly, currency)}/mo
                  </span>
                </div>
              )}
              {activeStreams.map((s, i) => {
                const monthly = resolvedMonthly(s);
                const pctVal = totalBudget > 0 ? (monthly / totalBudget) * 100 : 0;
                const colors = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899"];
                return (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: colors[i % colors.length] }}
                      />
                      {s.label || t("fire_planner.dash.income_stream_fallback")}
                    </span>
                    <span className="text-muted-foreground">
                      {fmt(monthly, currency)}/mo{" "}
                      <span className="text-foreground ml-1 font-medium">{pctVal.toFixed(0)}%</span>
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="bg-muted-foreground/30 inline-block h-2.5 w-2.5 rounded-full" />
                  {t("fire_planner.dash.portfolio_withdrawal")}
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

          {/* Deferred phases */}
          {deferredStreams.length > 0 && (
            <div className="space-y-3 border-t pt-3">
              <p className="text-muted-foreground text-xs">{t("fire_planner.dash.mix_evolve")}</p>
              {deferredStreams.map((s) => {
                // Cumulative income available from this stream's start age onwards
                const cumulativeIncome =
                  totalActiveIncome +
                  deferredStreams
                    .filter((d) => d.startAge <= s.startAge)
                    .reduce((sum, d) => sum + resolvedMonthly(d), 0);
                const newPortfolioWithdrawal = Math.max(0, totalBudget - cumulativeIncome);
                const extraBudget = Math.max(0, cumulativeIncome - totalBudget);

                return (
                  <div key={s.id} className="bg-muted/40 rounded p-2 text-xs">
                    <p className="font-medium">
                      {t("fire_planner.dash.from_age_stream", {
                        age: s.startAge,
                        amount: fmt(resolvedMonthly(s), currency),
                        label: s.label,
                      })}
                    </p>
                    {extraBudget > 0 ? (
                      <p className="text-muted-foreground mt-0.5">
                        {t("fire_planner.dash.income_exceeds", {
                          zero: fmt(0, currency),
                          extra: fmt(extraBudget, currency),
                        })}
                      </p>
                    ) : (
                      <p className="text-muted-foreground mt-0.5">
                        {t("fire_planner.dash.withdrawal_drops", {
                          newW: fmt(newPortfolioWithdrawal, currency),
                          oldW: fmt(portfolioWithdrawalAtFire, currency),
                        })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {settings.additionalIncomeStreams.length === 0 && (
            <p className="text-muted-foreground text-xs">{t("fire_planner.dash.no_income_streams")}</p>
          )}
        </CardContent>
      </Card>

      {/* Yearly Snapshot Table */}
      {tableSnapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("fire_planner.dash.snapshot_title")}</CardTitle>
            {hasPensionFunds && (
              <p className="text-muted-foreground mt-1 text-xs">
                {t("fire_planner.dash.snapshot_pension_note")}
              </p>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="pb-2 text-left">{t("fire_planner.dash.th_age")}</th>
                  <th className="pb-2 text-left">{t("fire_planner.dash.th_year")}</th>
                  <th className="pb-2 text-left">{t("fire_planner.dash.th_phase")}</th>
                  <th className="pb-2 text-right">{t("fire_planner.dash.th_portfolio")}</th>
                  {hasPensionFunds && (
                    <th className="pb-2 text-right">{t("fire_planner.dash.th_pension_fund")}</th>
                  )}
                  <th className="pb-2 text-right">{t("fire_planner.dash.th_contrib_yr")}</th>
                  {settings.additionalIncomeStreams.map((s) => (
                    <th key={s.id} className="whitespace-nowrap pb-2 text-right">
                      {t("fire_planner.dash.th_income_yr", {
                        label: s.label || t("fire_planner.dash.income_label"),
                      })}
                    </th>
                  ))}
                  <th className="pb-2 text-right">{t("fire_planner.dash.th_net_withdrawal")}</th>
                </tr>
              </thead>
              <tbody>
                {tableSnapshots.map((snap) => {
                  const isFire = snap.phase === "fire";
                  const isFireRow = snap.age === projection.fireAge;
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
                          {isFire ? t("fire_planner.dash.phase_fire") : t("fire_planner.dash.phase_acc")}
                        </Badge>
                      </td>
                      <td className="py-1.5 text-right">{fmt(snap.portfolioValue, currency)}</td>
                      {hasPensionFunds && (
                        <td className="py-1.5 text-right">
                          {snap.pensionAssets > 0 ? fmt(snap.pensionAssets, currency) : "—"}
                        </td>
                      )}
                      <td className="py-1.5 text-right">
                        {snap.annualContribution > 0 ? fmt(snap.annualContribution, currency) : "—"}
                      </td>
                      {settings.additionalIncomeStreams.map((s) => {
                        const income = singleStreamIncome(
                          s,
                          resolvedMonthly(s),
                          snap.age,
                          snap.age - settings.currentAge,
                          settings.inflationRate,
                        );
                        return (
                          <td key={s.id} className="py-1.5 text-right">
                            {income > 0 ? fmt(income, currency) : "—"}
                          </td>
                        );
                      })}
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

      {totalValue === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            {t("fire_planner.dash.no_portfolio")}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
