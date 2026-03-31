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
import type { FireSettings, IncomeStream } from "../types";
import {
  calculateFireTarget,
  calculateNetFireTarget,
  calculateCoastFireAmount,
  projectFireDate,
  resolveDcPayouts,
} from "../lib/fire-math";

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
}

function modeLabel(mode: PlannerMode) {
  return {
    target: mode === "fire" ? "FIRE Target" : "Retirement Target",
    targetNet: mode === "fire" ? "FIRE Target (net)" : "Retirement Target (net)",
    estAge: mode === "fire" ? "Est. FIRE Age" : "Retirement Age",
    progress: mode === "fire" ? "FIRE Progress" : "Retirement Progress",
    coast: mode === "fire" ? "Coast FIRE" : "Coast Amount",
    budgetAt: mode === "fire" ? "Monthly Budget at FIRE" : "Monthly Budget at Retirement",
    prefix: mode === "fire" ? "FIRE" : "Retirement",
  };
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

export default function DashboardPage({
  settings,
  portfolioData,
  isLoading,
  plannerMode = "fire",
}: Props) {
  const L = modeLabel(plannerMode);
  const { totalValue, error } = portfolioData;
  const currency = settings.currency;

  const fireTarget = useMemo(() => calculateFireTarget(settings), [settings]);
  const netFireTarget = useMemo(
    () => calculateNetFireTarget(settings, settings.targetFireAge),
    [settings],
  );
  const coastAmount = useMemo(() => calculateCoastFireAmount(settings), [settings]);
  const projection = useMemo(() => projectFireDate(settings, totalValue), [settings, totalValue]);

  const progress = netFireTarget > 0 ? Math.min(1, totalValue / netFireTarget) : 0;

  const fireAgeForBudget = projection.fireAge ?? settings.targetFireAge;

  // Resolve DC stream payouts using the projected retirement age (not just target).
  // This ensures the budget breakdown reflects actual early/late retirement timing.
  const dcPayouts = useMemo(
    () =>
      resolveDcPayouts(
        settings.additionalIncomeStreams,
        settings.currentAge,
        fireAgeForBudget,
        settings.safeWithdrawalRate,
      ),
    [settings, fireAgeForBudget],
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
        Failed to load portfolio data: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Warning: retirement triggered by age, not by FI */}
      {!projection.fundedAtRetirement && (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <strong>Underfunded plan:</strong> at the current trajectory the portfolio does not reach
          the {L.target.toLowerCase()} by age {settings.targetFireAge}. Retirement starts at the
          target age anyway, but withdrawals may deplete the portfolio early. Increase
          contributions, extend the target age, or reduce planned expenses.
        </div>
      )}
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              <Tooltip>
                <TooltipTrigger className="cursor-help underline decoration-dotted">
                  {L.targetNet}
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  <p>
                    <strong>Net target</strong> — portfolio needed after subtracting income streams
                    that start at or before your retirement age.
                  </p>
                  {netFireTarget < fireTarget && (
                    <p className="mt-1">
                      The <strong>gross target</strong> is {fmt(fireTarget, currency)} — the full
                      amount before income offsets. Both numbers are correct; they measure different
                      things.
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
                Gross {fmt(fireTarget, currency)} − {fmt(totalActiveIncome, currency)}/mo income
                already covers {fmt(fireTarget - netFireTarget, currency)}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {pct(settings.safeWithdrawalRate)} SWR ·{" "}
                {fmt(settings.monthlyExpensesAtFire, currency)}/mo
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Portfolio Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{fmt(totalValue, currency)}</p>
            <p
              className={`text-xs ${totalValue >= netFireTarget ? "text-green-600" : "text-muted-foreground"}`}
            >
              {totalValue >= netFireTarget
                ? `${fmt(totalValue - netFireTarget, currency)} above target`
                : `${fmt(netFireTarget - totalValue, currency)} to go`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{pct(progress)}</p>
            <p className="text-muted-foreground text-xs">toward {L.target.toLowerCase()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              {plannerMode === "fire" ? L.estAge : "Sustainability"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {plannerMode === "fire" ? (
              <>
                <p className="text-xl font-bold">{projection.fireAge ?? "Not reached"}</p>
                <p className="text-muted-foreground text-xs">
                  {projection.fireAge != null
                    ? projection.fireAge < settings.targetFireAge
                      ? `${settings.targetFireAge - projection.fireAge} yrs ahead of target`
                      : projection.fireAge === settings.targetFireAge
                        ? `on target (age ${settings.targetFireAge})`
                        : `target age ${settings.targetFireAge}`
                    : `not reached by age ${settings.planningHorizonAge}`}
                </p>
              </>
            ) : (
              <>
                <p
                  className={`text-xl font-bold ${projection.fundedAtRetirement ? "text-green-600" : "text-red-500"}`}
                >
                  {projection.fundedAtRetirement ? "Funded" : "Underfunded"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {projection.fundedAtRetirement
                    ? `Portfolio covers retirement at age ${settings.targetFireAge}`
                    : `${fmt(netFireTarget - totalValue, currency)} gap at age ${settings.targetFireAge}`}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Progress Bars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{L.progress}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span>Portfolio vs {L.target}</span>
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

      {/* Coast Card — FIRE mode only */}
      {plannerMode === "fire" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              {L.coast}
              {projection.coastFireReached ? (
                <Badge variant="default" className="bg-green-600 text-xs">
                  Reached ✓
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Not yet
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
              <div>
                <p className="text-muted-foreground text-xs">{L.coast} amount needed today</p>
                <p className="font-semibold">{fmt(coastAmount, currency)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Current portfolio</p>
                <p className="font-semibold">{fmt(totalValue, currency)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">
                  {projection.coastFireReached ? "Surplus" : "Gap"}
                </p>
                <p
                  className={`font-semibold ${projection.coastFireReached ? "text-green-600" : "text-red-500"}`}
                >
                  {fmt(Math.abs(totalValue - coastAmount), currency)}
                </p>
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              {L.coast} means your current portfolio, growing at your expected return with no
              further contributions, would reach your {L.target.toLowerCase()} by age{" "}
              {settings.targetFireAge}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Monthly Budget at Retirement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{L.budgetAt}</CardTitle>
          <p className="text-muted-foreground text-xs">
            How your {fmt(totalBudget, currency)}/mo is funded at each phase of retirement
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Phase 1: at retirement age */}
          <div>
            <p className="mb-2 text-xs font-medium">
              At age {fireAgeForBudget} — {fmt(totalBudget, currency)}/mo total
              {healthcareMonthly > 0 && (
                <span className="text-muted-foreground ml-1">
                  ({fmt(settings.monthlyExpensesAtFire, currency)} living +{" "}
                  {fmt(healthcareMonthly, currency)} healthcare)
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
                  <span className="text-muted-foreground">Living expenses</span>
                  <span className="text-muted-foreground">
                    {fmt(settings.monthlyExpensesAtFire, currency)}/mo
                  </span>
                </div>
              )}
              {healthcareMonthly > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Healthcare</span>
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
                      {s.label || "Income stream"}
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

          {/* Deferred phases */}
          {deferredStreams.length > 0 && (
            <div className="space-y-3 border-t pt-3">
              <p className="text-muted-foreground text-xs">How the mix evolves over time:</p>
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
                      From age {s.startAge}: +{fmt(resolvedMonthly(s), currency)}/mo ({s.label})
                    </p>
                    {extraBudget > 0 ? (
                      <p className="text-muted-foreground mt-0.5">
                        Income exceeds base expenses — portfolio withdrawal drops to{" "}
                        <span className="font-medium text-green-600">€0</span> and you have{" "}
                        <span className="font-medium text-green-600">
                          {fmt(extraBudget, currency)}/mo
                        </span>{" "}
                        extra spending power
                      </p>
                    ) : (
                      <p className="text-muted-foreground mt-0.5">
                        Portfolio withdrawal drops to{" "}
                        <span className="font-medium text-green-600">
                          {fmt(newPortfolioWithdrawal, currency)}/mo
                        </span>{" "}
                        (was {fmt(portfolioWithdrawalAtFire, currency)}/mo at retirement)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {settings.additionalIncomeStreams.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No income streams configured. Add pension, part-time work, or annuity streams in
              Settings to see how they reduce your portfolio withdrawal.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Yearly Snapshot Table */}
      {tableSnapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Year-by-Year Snapshot</CardTitle>
            {hasPensionFunds && (
              <p className="text-muted-foreground mt-1 text-xs">
                Pension fund balances grow with contributions until retirement, then on investment
                return only. Accumulation-fund payouts are derived from the projected balance at
                payout age.
              </p>
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
                  {settings.additionalIncomeStreams.map((s) => (
                    <th key={s.id} className="whitespace-nowrap pb-2 text-right">
                      {s.label || "Income"}/yr
                    </th>
                  ))}
                  <th className="pb-2 text-right">Net Withdrawal/yr</th>
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
                          {isFire ? L.prefix : "Acc."}
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
            No portfolio data found. Add accounts and holdings in Wealthfolio to see your retirement
            projection.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
