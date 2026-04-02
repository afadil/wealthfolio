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
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@wealthfolio/ui/chart";
import { useState, useMemo, useEffect, useCallback } from "react";
import type {
  FireSettings,
  MonteCarloResult,
  ScenarioResult,
  SorrScenario,
  SensitivityResult,
} from "../types";
import type { RetirementOverview } from "@/lib/types";
import {
  runFireMonteCarlo,
  runFireStrategyComparison,
  runFireScenarioAnalysis,
  runFireSorr,
  runFireSensitivity,
} from "@/adapters";

interface Props {
  settings: FireSettings;
  totalValue: number;
  isLoading: boolean;
  retirementOverview?: RetirementOverview;
}

/**
 * Resolve DC stream monthly payouts at a given retirement age.
 * Pure display helper: balance * (1+r)^years * swr / 12.
 */
function resolveDcPayouts(
  streams: FireSettings["additionalIncomeStreams"],
  currentAge: number,
  retirementAge: number,
  swr: number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of streams) {
    if (s.streamType !== "dc") continue;
    const totalYears = Math.max(0, s.startAge - currentAge);
    const contribYears = Math.max(0, Math.min(s.startAge, retirementAge) - currentAge);
    const growthOnlyYears = totalYears - contribYears;
    const r = s.accumulationReturn ?? 0.04;
    const initial = s.currentValue ?? 0;
    const monthly = s.monthlyContribution ?? 0;
    const fvLump = initial * Math.pow(1 + r, totalYears);
    const fvAnnuityAtStop =
      r > 1e-9
        ? (monthly * 12 * (Math.pow(1 + r, contribYears) - 1)) / r
        : monthly * 12 * contribYears;
    const fvAnnuity = fvAnnuityAtStop * Math.pow(1 + r, growthOnlyYears);
    map.set(s.id, ((fvLump + fvAnnuity) * swr) / 12);
  }
  return map;
}

function fmt(value: number, currency: string) {
  return formatAmount(value, currency);
}

function fmtCompact(value: number) {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(0) + "k";
  return value.toFixed(0);
}

// ─── Monte Carlo Section ───────────────────────────────────────────────────────

function MonteCarloSection({
  settings,
  totalValue,
  fireTarget,
}: {
  settings: FireSettings;
  totalValue: number;
  fireTarget: number;
}) {
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compResult, setCompResult] = useState<{
    constantDollar: MonteCarloResult;
    constantPercentage: MonteCarloResult;
  } | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const strategy = settings.withdrawalStrategy ?? "constant-dollar";

  // Invalidate stale results whenever settings change
  useEffect(() => {
    setResult(null);
    setCompResult(null);
    setError(null);
    setCompareError(null);
  }, [settings]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await runFireMonteCarlo(settings, totalValue, 100_000);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const compare = async () => {
    setComparing(true);
    setCompareError(null);
    try {
      const res = await runFireStrategyComparison(settings, totalValue, 5_000);
      setCompResult(res);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : String(e));
    } finally {
      setComparing(false);
    }
  };

  const chartData = result
    ? result.ageAxis.map((age, i) => ({
        age,
        p10: result.percentiles.p10[i],
        p25: result.percentiles.p25[i],
        p50: result.percentiles.p50[i],
        p75: result.percentiles.p75[i],
        p90: result.percentiles.p90[i],
      }))
    : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm">Monte Carlo Simulation</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            100,000 simulations · fat-tailed two-regime returns (μ={" "}
            {(settings.expectedAnnualReturn * 100).toFixed(1)}%, σ={" "}
            {(settings.expectedReturnStdDev * 100).toFixed(1)}%) · stochastic inflation ·{" "}
            <span className="font-medium">
              {strategy === "constant-dollar" ? "constant-dollar" : "constant-%"} strategy
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={compare} disabled={comparing || running} variant="outline" size="sm">
            {comparing ? "Comparing…" : "Compare Strategies"}
          </Button>
          <Button onClick={run} disabled={running || comparing} size="sm">
            {running ? "Running…" : result ? "Re-run" : "Run Simulation"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-destructive py-2 text-sm">{error}</p>}
        {compareError && <p className="text-destructive py-2 text-sm">{compareError}</p>}
        {running && (
          <div className="space-y-2 py-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        )}

        {!running && result && (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-xs">Success Rate</p>
                <p
                  className={`text-lg font-bold ${
                    result.successRate >= 0.9
                      ? "text-green-600"
                      : result.successRate >= 0.7
                        ? "text-yellow-600"
                        : "text-red-500"
                  }`}
                >
                  {(result.successRate * 100).toFixed(0)}%
                </p>
              </div>
              <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/30">
                <p className="text-muted-foreground text-xs">Median FI Age</p>
                {result.medianFireAge !== null ? (
                  <>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                      {result.medianFireAge}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {new Date().getFullYear() + (result.medianFireAge - settings.currentAge)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-red-500">Not reached</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-xs">P50 Portfolio at Horizon</p>
                <p className="text-lg font-bold">
                  {fmt(result.finalPortfolioAtHorizon.p50, settings.currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">P10 Portfolio at Horizon</p>
                <p className="text-lg font-bold">
                  {fmt(result.finalPortfolioAtHorizon.p10, settings.currency)}
                </p>
              </div>
            </div>

            {/* Fan chart */}
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="age"
                    label={{ value: "Age", position: "insideBottom", offset: -2 }}
                  />
                  <YAxis tickFormatter={fmtCompact} />
                  <Tooltip
                    formatter={(value: number | undefined) => fmt(value ?? 0, settings.currency)}
                    labelFormatter={(age) => `Age ${age}`}
                  />
                  <Legend />
                  <ReferenceLine
                    y={fireTarget}
                    stroke="orange"
                    strokeDasharray="6 3"
                    label={{ value: "FIRE Target", position: "right", fontSize: 10 }}
                  />
                  <ReferenceLine
                    x={settings.targetFireAge}
                    stroke="#94a3b8"
                    strokeDasharray="4 2"
                    label={{
                      value: "Target",
                      position: "insideTopRight",
                      fontSize: 9,
                      fill: "#94a3b8",
                    }}
                  />
                  {result.medianFireAge !== null && (
                    <ReferenceLine
                      x={result.medianFireAge}
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      label={{
                        value: `FI: ${result.medianFireAge}`,
                        position: "insideTopLeft",
                        fontSize: 11,
                        fontWeight: 700,
                        fill: "#f59e0b",
                      }}
                    />
                  )}
                  <Line dataKey="p90" name="P90" stroke="#22c55e" dot={false} strokeWidth={1.5} />
                  <Line dataKey="p75" name="P75" stroke="#86efac" dot={false} strokeWidth={1} />
                  <Line
                    dataKey="p50"
                    name="P50 (Median)"
                    stroke="#3b82f6"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line dataKey="p25" name="P25" stroke="#fca5a5" dot={false} strokeWidth={1} />
                  <Line dataKey="p10" name="P10" stroke="#ef4444" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-muted-foreground mt-1 text-center text-xs">
                Portfolio value from age {settings.currentAge} to {settings.planningHorizonAge}{" "}
                across 100,000 simulations
              </p>
            </div>
          </div>
        )}

        {!running && !result && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Click "Run Simulation" to model 10,000 possible retirement paths.
          </p>
        )}

        {comparing && (
          <div className="space-y-2 py-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {!comparing && compResult && (
          <div className="border-t pt-4">
            <p className="mb-2 text-xs font-semibold">
              Strategy Comparison (5,000 simulations each)
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="pb-2 text-left">Metric</th>
                  <th className="pb-2 text-right">Constant Dollar</th>
                  <th className="pb-2 text-right">Constant %</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-1.5">Success Rate</td>
                  <td className="py-1.5 text-right">
                    {(compResult.constantDollar.successRate * 100).toFixed(0)}%
                  </td>
                  <td className="py-1.5 text-right">
                    {(compResult.constantPercentage.successRate * 100).toFixed(0)}%
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-1.5">Median FIRE Age</td>
                  <td className="py-1.5 text-right">{compResult.constantDollar.medianFireAge}</td>
                  <td className="py-1.5 text-right">
                    {compResult.constantPercentage.medianFireAge}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-1.5">Median portfolio at horizon</td>
                  <td className="py-1.5 text-right">
                    {fmt(compResult.constantDollar.finalPortfolioAtHorizon.p50, settings.currency)}
                  </td>
                  <td className="py-1.5 text-right">
                    {fmt(
                      compResult.constantPercentage.finalPortfolioAtHorizon.p50,
                      settings.currency,
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5">P10 portfolio at horizon</td>
                  <td className="py-1.5 text-right">
                    {fmt(compResult.constantDollar.finalPortfolioAtHorizon.p10, settings.currency)}
                  </td>
                  <td className="py-1.5 text-right">
                    {fmt(
                      compResult.constantPercentage.finalPortfolioAtHorizon.p10,
                      settings.currency,
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-muted-foreground mt-2 text-xs">
              Constant %: the portfolio mathematically never depletes (high success rate expected),
              but annual spending varies with market performance.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Scenario Analysis Section ─────────────────────────────────────────────────

function ScenarioSection({ settings, totalValue }: { settings: FireSettings; totalValue: number }) {
  const [scenarios, setScenarios] = useState<ScenarioResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runFireScenarioAnalysis(settings, totalValue);
      setScenarios(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [settings, totalValue]);

  // Auto-run on mount and when settings change
  useEffect(() => {
    setScenarios(null);
    setError(null);
    run();
  }, [run]);

  const COLORS = ["#ef4444", "#3b82f6", "#22c55e"];

  const chartData = useMemo(() => {
    if (!scenarios) return [];
    const maxLen = Math.max(...scenarios.map((s) => s.yearByYear.length));
    return Array.from({ length: maxLen }, (_, i) => {
      const entry: Record<string, number | string> = {
        age: settings.currentAge + i,
      };
      scenarios.forEach((s) => {
        entry[s.label] = s.yearByYear[i]?.portfolioValue ?? 0;
      });
      return entry;
    });
  }, [scenarios, settings.currentAge]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Scenario Analysis</CardTitle>
        <p className="text-muted-foreground text-xs">Same settings, three return assumptions</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-destructive py-2 text-sm">{error}</p>}
        {loading && (
          <div className="space-y-2 py-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        )}
        {!loading && scenarios && (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="age" />
                <YAxis tickFormatter={fmtCompact} />
                <Tooltip
                  formatter={(value: number | undefined) => fmt(value ?? 0, settings.currency)}
                  labelFormatter={(age) => `Age ${age}`}
                />
                <Legend />
                {scenarios.map((s, i) =>
                  s.fireAge != null ? (
                    <ReferenceLine
                      key={`fire-${s.label}`}
                      x={s.fireAge}
                      stroke={COLORS[i]}
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      label={{
                        value: `${s.fireAge}`,
                        position: i === 0 ? "insideTopRight" : i === 1 ? "top" : "insideTopLeft",
                        fontSize: 11,
                        fontWeight: 700,
                        fill: COLORS[i],
                      }}
                    />
                  ) : null,
                )}
                {scenarios.map((s, i) => (
                  <Line
                    key={s.label}
                    dataKey={s.label}
                    stroke={COLORS[i]}
                    dot={false}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>

            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="pb-2 text-left">Scenario</th>
                  <th className="pb-2 text-right">Return</th>
                  <th className="pb-2 text-right">FIRE Age</th>
                  <th className="pb-2 text-right">Portfolio at Horizon</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s, i) => (
                  <tr key={s.label} className="border-b last:border-0">
                    <td className="py-1.5 font-medium" style={{ color: COLORS[i] }}>
                      {s.label}
                    </td>
                    <td className="py-1.5 text-right">{(s.annualReturn * 100).toFixed(1)}%</td>
                    <td
                      className="py-1.5 text-right font-semibold"
                      style={{ color: s.fireAge ? COLORS[i] : undefined }}
                    >
                      {s.fireAge ?? "—"}
                    </td>
                    <td className="py-1.5 text-right">
                      {fmt(s.portfolioAtHorizon, settings.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Income Streams Projection Section ────────────────────────────────────────

const STREAM_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6"];

function IncomeProjectionSection({
  settings,
  actualFireAge,
}: {
  settings: FireSettings;
  actualFireAge: number;
}) {
  const streams = settings.additionalIncomeStreams;
  if (streams.length === 0) return null;

  const horizonYears = Math.max(1, settings.planningHorizonAge - settings.currentAge);
  const fireAge = actualFireAge;
  const dcPayouts = resolveDcPayouts(
    settings.additionalIncomeStreams,
    settings.currentAge,
    settings.targetFireAge,
    settings.safeWithdrawalRate,
  );

  function realStreamValue(s: (typeof streams)[number], i: number): number {
    const baseMonthly = dcPayouts.get(s.id) ?? s.monthlyAmount;
    const rate =
      s.annualGrowthRate !== undefined
        ? s.annualGrowthRate
        : s.adjustForInflation
          ? settings.inflationRate
          : 0;
    const nominal = baseMonthly * 12 * Math.pow(1 + rate, i);
    return nominal / Math.pow(1 + settings.inflationRate, i);
  }

  const realExpenses = settings.monthlyExpensesAtFire * 12;

  const chartData = useMemo(() => {
    return Array.from({ length: horizonYears + 1 }, (_, i) => {
      const age = settings.currentAge + i;
      const entry: Record<string, number | null> = {
        age,
        expenses: age >= fireAge ? realExpenses : null,
      };
      for (const s of streams) {
        entry[s.id] = age >= s.startAge ? realStreamValue(s, i) : 0;
      }
      return entry;
    });
  }, [settings, streams, fireAge, horizonYears, realExpenses]);

  const keyAges = useMemo(() => {
    const ages = new Set<number>([fireAge, fireAge + 5, fireAge + 10, fireAge + 20]);
    streams.forEach((s) => ages.add(s.startAge));
    return [...ages]
      .filter((a) => a >= settings.currentAge && a <= settings.planningHorizonAge)
      .sort((a, b) => a - b);
  }, [streams, fireAge, settings.currentAge, settings.planningHorizonAge]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Income Streams Projection</CardTitle>
        <p className="text-muted-foreground text-xs">
          All amounts in today's euros (real terms). Inflation-indexed streams appear flat;
          non-indexed streams lose purchasing power over time. The gap between total income and the
          expense line is what the portfolio must cover each year.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="age" />
            <YAxis tickFormatter={fmtCompact} />
            <Tooltip
              formatter={(value: number | undefined, name: string | undefined) => {
                const stream = streams.find((s) => s.id === name);
                const label = stream ? stream.label || "Stream" : (name ?? "");
                return [fmt(value ?? 0, settings.currency), label];
              }}
              labelFormatter={(age) => `Age ${age} (today's €)`}
            />
            <Legend
              formatter={(value) => {
                const stream = streams.find((s) => s.id === value);
                return stream ? stream.label || "Stream" : value;
              }}
            />
            {streams.map((s, i) => (
              <Area
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.id}
                stackId="income"
                stroke={STREAM_COLORS[i % STREAM_COLORS.length]}
                fill={STREAM_COLORS[i % STREAM_COLORS.length]}
                fillOpacity={0.35}
                dot={false}
              />
            ))}
            <Line
              dataKey="expenses"
              name="FIRE Expenses"
              stroke="#ef4444"
              dot={false}
              strokeWidth={2}
              strokeDasharray="5 3"
              connectNulls={false}
            />
            <ReferenceLine
              x={fireAge}
              stroke="#94a3b8"
              strokeDasharray="4 2"
              label={{ value: "FIRE", position: "top", fontSize: 10 }}
            />
          </AreaChart>
        </ResponsiveContainer>

        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="pb-2 text-left">Age</th>
              {streams.map((s) => (
                <th key={s.id} className="pb-2 text-right">
                  {s.label || "Stream"}
                </th>
              ))}
              <th className="pb-2 text-right">Total income/yr</th>
              <th className="pb-2 text-right">Expenses/yr</th>
              <th className="pb-2 text-right">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {keyAges.map((age) => {
              const i = age - settings.currentAge;
              const totalIncome = streams.reduce((sum, s) => {
                if (age < s.startAge) return sum;
                return sum + realStreamValue(s, i);
              }, 0);
              const expenses = age >= fireAge ? realExpenses : null;
              const coverage = expenses && expenses > 0 ? totalIncome / expenses : null;
              const isFireRow = age === fireAge;

              return (
                <tr
                  key={age}
                  className={`border-b last:border-0 ${isFireRow ? "font-semibold" : ""}`}
                >
                  <td className="py-1.5">
                    {age}
                    {isFireRow && (
                      <span className="text-muted-foreground ml-1 font-normal">(FIRE)</span>
                    )}
                  </td>
                  {streams.map((s) => {
                    if (age < s.startAge)
                      return (
                        <td key={s.id} className="text-muted-foreground py-1.5 text-right">
                          —
                        </td>
                      );
                    return (
                      <td key={s.id} className="py-1.5 text-right">
                        {fmt(realStreamValue(s, i), settings.currency)}
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-right">{fmt(totalIncome, settings.currency)}</td>
                  <td className="py-1.5 text-right">
                    {expenses !== null ? fmt(expenses, settings.currency) : "—"}
                  </td>
                  <td
                    className={`py-1.5 text-right font-medium ${
                      coverage === null
                        ? ""
                        : coverage >= 1
                          ? "text-green-600"
                          : coverage >= 0.5
                            ? "text-yellow-600"
                            : "text-muted-foreground"
                    }`}
                  >
                    {coverage !== null ? (coverage * 100).toFixed(0) + "%" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Sensitivity Analysis Section ─────────────────────────────────────────────

function SensitivitySection({
  settings,
  totalValue,
}: {
  settings: FireSettings;
  totalValue: number;
}) {
  const [sensitivity, setSensitivity] = useState<SensitivityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runFireSensitivity(settings, totalValue);
      setSensitivity(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [settings, totalValue]);

  useEffect(() => {
    setSensitivity(null);
    setError(null);
    run();
  }, [run]);

  function cellBg(fireAge: number | null): string {
    if (fireAge === null) return "bg-red-100 dark:bg-red-950/30";
    if (fireAge <= settings.targetFireAge - 5) return "bg-green-100 dark:bg-green-950/30";
    if (fireAge <= settings.targetFireAge) return "bg-blue-100 dark:bg-blue-950/30";
    if (fireAge <= settings.targetFireAge + 5) return "bg-yellow-50 dark:bg-yellow-950/20";
    return "bg-red-50 dark:bg-red-950/20";
  }

  function isCurrentContrib(contrib: number) {
    return Math.abs(contrib - settings.monthlyContribution) < 1;
  }
  function isCurrentReturn(ret: number) {
    return Math.abs(ret - settings.expectedAnnualReturn) < 0.001;
  }

  const { contribution, swr } = sensitivity ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Sensitivity Analysis</CardTitle>
        <p className="text-muted-foreground text-xs">
          FIRE age by monthly contribution × expected return.{" "}
          <span className="text-blue-600">Blue = your settings.</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-6 overflow-x-auto">
        {error && <p className="text-destructive py-2 text-sm">{error}</p>}
        {loading && (
          <div className="space-y-2 py-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-[120px] w-full" />
          </div>
        )}
        {!loading && contribution && swr && (
          <>
            <div>
              <p className="mb-2 text-xs font-semibold">FIRE Age (monthly contribution × return)</p>
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="text-muted-foreground pr-2 text-left font-normal">
                      Monthly ↓ / Return →
                    </th>
                    {contribution.returnColumns.map((r) => (
                      <th
                        key={r}
                        className={`px-2 py-1 text-center ${isCurrentReturn(r) ? "font-bold text-blue-600" : "text-muted-foreground font-normal"}`}
                      >
                        {(r * 100).toFixed(0)}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contribution.contributionRows.map((contrib, ri) => (
                    <tr key={contrib}>
                      <td
                        className={`py-1 pr-2 ${isCurrentContrib(contrib) ? "font-bold text-blue-600" : "text-muted-foreground"}`}
                      >
                        {formatAmount(contrib, settings.currency)}
                      </td>
                      {contribution.returnColumns.map((r, ci) => {
                        const age = contribution.fireAges[ri][ci];
                        const highlight = isCurrentContrib(contrib) && isCurrentReturn(r);
                        return (
                          <td
                            key={r}
                            className={`px-2 py-1 text-center ${cellBg(age)} ${highlight ? "ring-2 ring-blue-500" : ""}`}
                          >
                            {age ?? `>${settings.planningHorizonAge}`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold">FIRE Age (SWR × return)</p>
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="text-muted-foreground pr-2 text-left font-normal">
                      SWR ↓ / Return →
                    </th>
                    {swr.returnColumns.map((r) => (
                      <th
                        key={r}
                        className={`px-2 py-1 text-center ${isCurrentReturn(r) ? "font-bold text-blue-600" : "text-muted-foreground font-normal"}`}
                      >
                        {(r * 100).toFixed(0)}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {swr.swrRows.map((rate, ri) => {
                    const isCurrentSWR = Math.abs(rate - settings.safeWithdrawalRate) < 0.001;
                    return (
                      <tr key={rate}>
                        <td
                          className={`py-1 pr-2 ${isCurrentSWR ? "font-bold text-blue-600" : "text-muted-foreground"}`}
                        >
                          {(rate * 100).toFixed(1)}%
                        </td>
                        {swr.returnColumns.map((r, ci) => {
                          const age = swr.fireAges[ri][ci];
                          const highlight = isCurrentSWR && isCurrentReturn(r);
                          return (
                            <td
                              key={r}
                              className={`px-2 py-1 text-center ${cellBg(age)} ${highlight ? "ring-2 ring-blue-500" : ""}`}
                            >
                              {age ?? `>${settings.planningHorizonAge}`}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Sequence of Returns Risk Section ─────────────────────────────────────────

function SorrSection({
  settings,
  totalValue,
  portfolioAtFire: portfolioAtFireProp,
  retirementStartAge: retirementStartAgeProp,
  fireReached,
}: {
  settings: FireSettings;
  totalValue: number;
  portfolioAtFire: number;
  retirementStartAge: number;
  fireReached: boolean;
}) {
  const portfolioAtFire = portfolioAtFireProp > 0 ? portfolioAtFireProp : totalValue;
  const retirementStartAge = retirementStartAgeProp;

  const [scenarios, setScenarios] = useState<SorrScenario[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runFireSorr(settings, portfolioAtFire, retirementStartAge);
      setScenarios(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [settings, portfolioAtFire, retirementStartAge]);

  useEffect(() => {
    setScenarios(null);
    setError(null);
    run();
  }, [run]);

  const COLORS = ["#3b82f6", "#ef4444", "#f97316", "#a855f7", "#64748b"];

  const chartData = useMemo(() => {
    if (!scenarios) return [];
    const maxLen = Math.max(...scenarios.map((s) => s.portfolioPath.length));
    return Array.from({ length: maxLen }, (_, i) => {
      const entry: Record<string, number | string> = {
        year: i,
        age: retirementStartAge + i,
      };
      scenarios.forEach((s) => {
        entry[s.label] = s.portfolioPath[i] ?? 0;
      });
      return entry;
    });
  }, [scenarios, retirementStartAge]);

  const annualExpenses = settings.monthlyExpensesAtFire * 12;
  const dcPayouts = resolveDcPayouts(
    settings.additionalIncomeStreams,
    settings.currentAge,
    retirementStartAge,
    settings.safeWithdrawalRate,
  );
  const annualIncomeAtFire = settings.additionalIncomeStreams
    .filter((s) => retirementStartAge >= s.startAge)
    .reduce((sum, s) => sum + (dcPayouts.get(s.id) ?? s.monthlyAmount) * 12, 0);
  const incomeRatio = annualExpenses > 0 ? annualIncomeAtFire / annualExpenses : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Sequence of Returns Risk</CardTitle>
        <p className="text-muted-foreground text-xs">
          A market crash in the first years of FIRE is more dangerous than the same crash later.
          Starting portfolio: {fmt(portfolioAtFire, settings.currency)}
          {!fireReached && " (current portfolio — FIRE not yet reached in projection)"}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-destructive py-2 text-sm">{error}</p>}
        {!fireReached && (
          <div className="rounded bg-yellow-50 p-3 text-xs dark:bg-yellow-950/20">
            FIRE has not been reached within your planning horizon. Results below show crash
            scenarios starting from your current portfolio — they are illustrative only.
          </div>
        )}
        {incomeRatio > 0.3 && (
          <div className="rounded bg-green-50 p-3 text-xs dark:bg-green-950/20">
            Your additional income ({fmt(annualIncomeAtFire / 12, settings.currency)}/mo) covers{" "}
            {(incomeRatio * 100).toFixed(0)}% of your FIRE expenses, significantly reducing
            sequence-of-returns risk.
          </div>
        )}
        {loading && (
          <div className="space-y-2 py-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        )}
        {!loading && scenarios && (
          <>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="pb-2 text-left">Scenario</th>
                  <th className="pb-2 text-right">Final Value</th>
                  <th className="pb-2 text-center">
                    Survived to age {settings.planningHorizonAge}?
                  </th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s, i) => (
                  <tr key={s.label} className="border-b last:border-0">
                    <td className="py-1.5 font-medium" style={{ color: COLORS[i] }}>
                      {s.label}
                    </td>
                    <td className="py-1.5 text-right">{fmt(s.finalValue, settings.currency)}</td>
                    <td className="py-1.5 text-center">
                      <Badge variant={s.survived ? "default" : "destructive"} className="text-xs">
                        {s.survived ? "Yes" : "No"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="age"
                  label={{ value: "Age", position: "insideBottom", offset: -2 }}
                />
                <YAxis tickFormatter={fmtCompact} />
                <Tooltip
                  formatter={(value: number | undefined) => fmt(value ?? 0, settings.currency)}
                  labelFormatter={(age) => `Age ${age}`}
                />
                <Legend />
                {scenarios.map((s, i) => (
                  <Line
                    key={s.label}
                    dataKey={s.label}
                    stroke={COLORS[i]}
                    dot={false}
                    strokeWidth={s.label === "Base (constant)" ? 2 : 1.5}
                    strokeDasharray={s.label === "Base (constant)" ? undefined : "4 2"}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SimulationsPage({
  settings,
  totalValue,
  isLoading,
  retirementOverview,
}: Props) {
  const actualFireAge = retirementOverview?.fiAge ?? settings.targetFireAge;
  const fireTarget = retirementOverview?.netFireTarget ?? 0;
  const portfolioAtFire = retirementOverview?.portfolioAtGoalAge ?? totalValue;
  const fireReached = retirementOverview?.fundedAtGoalAge ?? false;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MonteCarloSection settings={settings} totalValue={totalValue} fireTarget={fireTarget} />
      <ScenarioSection settings={settings} totalValue={totalValue} />
      <IncomeProjectionSection settings={settings} actualFireAge={actualFireAge} />
      <SensitivitySection settings={settings} totalValue={totalValue} />
      <SorrSection
        settings={settings}
        totalValue={totalValue}
        portfolioAtFire={portfolioAtFire}
        retirementStartAge={actualFireAge}
        fireReached={fireReached}
      />
    </div>
  );
}
