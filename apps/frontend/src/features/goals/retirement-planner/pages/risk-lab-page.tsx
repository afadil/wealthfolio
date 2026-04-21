import {
  runRetirementDecisionSensitivity,
  runRetirementMonteCarlo,
  runRetirementSorr,
  runRetirementStrategyComparison,
  runRetirementStressTests,
} from "@/adapters";
import type { RetirementOverview } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  TooltipContent,
  TooltipTrigger,
  Tooltip as UiTooltip,
} from "@wealthfolio/ui/components/ui/tooltip";
import type { CSSProperties } from "react";
import { Fragment, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DecisionSensitivityCell,
  DecisionSensitivityMatrix,
  DecisionSensitivityResult,
  MonteCarloResult,
  RetirementPlan,
  SorrScenario,
  StrategyComparisonResult,
  StressSeverity,
  StressTestResult,
} from "../types";

type PlannerMode = "fire" | "traditional";

interface Props {
  plan: RetirementPlan;
  totalValue: number;
  isLoading: boolean;
  retirementOverview?: RetirementOverview;
  plannerMode?: PlannerMode;
  goalId?: string;
}

const CHART = {
  portfolio: "hsl(38, 75%, 50%)",
  portfolioSoft: "hsla(38, 75%, 50%, 0.16)",
  income: "var(--fi-stream-1)",
  risk: "hsl(8, 67%, 48%)",
  muted: "hsl(var(--muted-foreground))",
  grid: "hsl(var(--border))",
};

function fmt(value: number, currency: string) {
  return formatAmount(value, currency);
}

function fmtCompact(value: number, currency = "USD") {
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 1_000_000 ? 2 : abs >= 100_000 ? 0 : abs >= 1_000 ? 1 : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits,
    }).format(value);
  } catch {
    return formatAmount(value, currency);
  }
}

function pct(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function severityRank(severity: StressSeverity) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function stableSeed(parts: unknown[]) {
  const input = JSON.stringify(parts);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : error ? String(error) : null;
}

function topStress(stresses?: StressTestResult[]) {
  return [...(stresses ?? [])].sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      b.delta.shortfallAtGoalAge - a.delta.shortfallAtGoalAge ||
      Math.abs(b.delta.portfolioAtHorizon) - Math.abs(a.delta.portfolioAtHorizon),
  )[0];
}

function InlineAmountTooltip({
  value,
  currency,
  label,
  baseline,
  stressed,
  delta,
  tone = "default",
}: {
  value: number;
  currency: string;
  label: string;
  baseline: number;
  stressed: number;
  delta: number;
  tone?: "default" | "shortfall";
}) {
  return (
    <UiTooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-help font-medium tabular-nums underline decoration-dotted underline-offset-4",
            tone === "shortfall" ? "text-amber-600" : "text-foreground",
          )}
        >
          {fmtCompact(value, currency)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-wider">{label}</div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
          <span className="text-muted-foreground">Baseline</span>
          <span className="text-right">{fmt(baseline, currency)}</span>
          <span className="text-muted-foreground">Stressed</span>
          <span className="text-right">{fmt(stressed, currency)}</span>
          <span className="text-muted-foreground">Delta</span>
          <span className={cn("text-right", delta < 0 ? "text-destructive" : "text-amber-600")}>
            {delta > 0 ? "+" : delta < 0 ? "-" : ""}
            {fmt(Math.abs(delta), currency)}
          </span>
        </div>
      </TooltipContent>
    </UiTooltip>
  );
}

function deterministicRiskContent(stress: StressTestResult | undefined, currency: string) {
  if (!stress) return "Stress tests are loading.";
  if (stress.severity === "low") {
    return "No preset stress materially changes the baseline result.";
  }

  const horizonDrop = Math.max(0, -stress.delta.portfolioAtHorizon);
  const shortfallIncrease = Math.max(0, stress.delta.shortfallAtGoalAge);
  const fragments: React.ReactNode[] = [];
  if (horizonDrop > 0) {
    fragments.push(
      <>
        horizon balance drops by{" "}
        <InlineAmountTooltip
          value={horizonDrop}
          currency={currency}
          label="End portfolio impact"
          baseline={stress.baseline.portfolioAtHorizon}
          stressed={stress.stressed.portfolioAtHorizon}
          delta={stress.delta.portfolioAtHorizon}
        />
      </>,
    );
  }
  if (shortfallIncrease > 0) {
    fragments.push(
      <>
        target shortfall increases by{" "}
        <InlineAmountTooltip
          value={shortfallIncrease}
          currency={currency}
          label="Goal shortfall impact"
          baseline={stress.baseline.shortfallAtGoalAge}
          stressed={stress.stressed.shortfallAtGoalAge}
          delta={stress.delta.shortfallAtGoalAge}
          tone="shortfall"
        />
      </>,
    );
  }
  if (stress.delta.fiAgeYears && stress.delta.fiAgeYears > 0) {
    fragments.push(
      <>
        FI moves{" "}
        <span className="text-foreground font-medium tabular-nums">{stress.delta.fiAgeYears}</span>{" "}
        years later
      </>,
    );
  }

  return (
    <>
      {stress.label} is the largest risk
      {fragments.length ? ": " : "."}
      {fragments.map((fragment, index) => (
        <Fragment key={index}>
          {index > 0 ? " and " : ""}
          {fragment}
        </Fragment>
      ))}
      {fragments.length ? "." : null}
    </>
  );
}

function baselineStatusCopy(isFunded: boolean, fiAge: number | null, desiredAge: number) {
  if (isFunded) return "on track";
  if (!fiAge) return "not reachable";
  const years = fiAge - desiredAge;
  if (years <= 0) return "on track";
  return `${years} ${years === 1 ? "year" : "years"} late`;
}

function HeroMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <div className="border-border/70 px-3 py-3 first:rounded-l-lg last:rounded-r-lg md:border-l md:first:border-l-0">
      <p className="text-muted-foreground text-[9px] font-semibold uppercase tracking-[0.18em]">
        {label}
      </p>
      <div
        className={cn(
          "mt-1.5 text-xl font-semibold leading-none tracking-tight",
          tone === "good" && "text-[hsl(102,32%,39%)]",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </div>
      <div className="text-muted-foreground mt-1.5 text-xs">{detail}</div>
    </div>
  );
}

function PlanResilienceHero({
  plan,
  overview,
  stresses,
  stressLoading,
  mc,
}: {
  plan: RetirementPlan;
  overview?: RetirementOverview;
  stresses?: StressTestResult[];
  stressLoading: boolean;
  mc?: MonteCarloResult;
}) {
  const currency = plan.currency;
  const desiredAge = overview?.desiredFireAge ?? plan.personal.targetRetirementAge;
  const fiAge = overview?.fiAge ?? null;
  const isFunded = overview?.fundedAtGoalAge ?? false;
  const status = baselineStatusCopy(isFunded, fiAge, desiredAge);
  const topRisk = topStress(stresses);
  const risk = stressLoading
    ? "Stress tests are loading."
    : deterministicRiskContent(topRisk, currency);
  const gapLabel =
    !overview || overview.shortfallAtGoalAge <= 0
      ? "None"
      : fmt(overview.shortfallAtGoalAge, currency);
  const gapDetail =
    !overview || overview.shortfallAtGoalAge <= 0
      ? "funded"
      : `${fmt(overview.shortfallAtGoalAge, currency)} gap`;
  const fiDetail = fiAge
    ? fiAge <= desiredAge
      ? "on target"
      : `${fiAge - desiredAge} ${fiAge - desiredAge === 1 ? "year" : "years"} late`
    : "not reached";

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="space-y-4 p-5 md:p-6">
        <div className="flex gap-4">
          <div
            className={cn(
              "mt-2 h-14 w-1.5 shrink-0 rounded-full",
              isFunded ? "bg-[hsl(111,25%,48%)]" : "bg-destructive",
            )}
          />
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-muted-foreground text-[9px] font-semibold uppercase tracking-[0.22em]">
                Risk Lab · deterministic
              </p>
              <h2 className="mt-2 max-w-[95%] font-serif text-2xl font-normal leading-[1.15] tracking-tight">
                Your plan is{" "}
                <span
                  className={cn(
                    "whitespace-nowrap font-medium",
                    isFunded ? "text-[hsl(111,25%,43%)]" : "text-destructive",
                  )}
                >
                  {status}
                </span>
                <span className="text-muted-foreground font-sans text-[0.6em] font-normal italic">
                  {" "}
                  under baseline assumptions.
                </span>
              </h2>
              <p className="text-muted-foreground mt-4 max-w-[620px] text-sm leading-relaxed">
                {risk}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-muted/25 grid overflow-hidden rounded-lg border md:grid-cols-4">
          <HeroMetric label="Desired age" value={desiredAge} detail="your goal" />
          <HeroMetric
            label="Baseline FI age"
            value={fiAge ?? "—"}
            detail={fiDetail}
            tone={fiAge && fiAge <= desiredAge ? "good" : fiAge ? "bad" : "default"}
          />
          <HeroMetric
            label="Shortfall at goal"
            value={gapLabel}
            detail={gapDetail}
            tone={overview && overview.shortfallAtGoalAge <= 0 ? "good" : "bad"}
          />
          <HeroMetric
            label="Success probability"
            value={mc ? pct(mc.successRate) : "—"}
            detail={mc ? `${mc.nSimulations.toLocaleString()} paths` : "not run"}
            tone={mc ? (mc.successRate >= 0.8 ? "good" : "bad") : "default"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function compactDelta(value: number, currency: string) {
  if (Math.abs(value) < 1) return "—";
  const direction = value > 0 ? "↑" : "↓";
  const sign = value > 0 ? "+" : "-";
  return `${direction}${sign}${fmtCompact(Math.abs(value), currency)}`;
}

function fiAgeDeltaLabel(stress: StressTestResult) {
  const delta = stress.delta.fiAgeYears;
  if (delta === null) return "—";
  if (delta === 0) return "unchanged";
  return delta > 0 ? `↑+${delta} yr` : `↓${Math.abs(delta)} yr`;
}

function severityBadgeClass(severity: StressSeverity) {
  if (severity === "high") return "bg-destructive/10 text-destructive";
  if (severity === "medium") return "bg-amber-500/15 text-amber-700";
  return "bg-muted text-muted-foreground";
}

function severityRailClass(severity: StressSeverity) {
  if (severity === "high") return "bg-destructive";
  if (severity === "medium") return "bg-amber-500";
  return "bg-border";
}

function impactTextClass(value: number, badWhenPositive = true) {
  if (Math.abs(value) < 1) return "text-foreground";
  const isBad = badWhenPositive ? value > 0 : value < 0;
  return isBad ? "text-destructive" : "text-[hsl(102,32%,39%)]";
}

function StressIcon({ id }: { id: StressTestResult["id"] }) {
  const className = "mt-0.5 size-3.5 shrink-0 text-muted-foreground";
  switch (id) {
    case "return-drag":
      return <Icons.TrendingDown className={className} />;
    case "inflation-shock":
      return <Icons.Percent className={className} />;
    case "spending-shock":
      return <Icons.Wallet className={className} />;
    case "retire-earlier":
      return <Icons.Calendar className={className} />;
    case "save-less":
      return <Icons.BadgeDollarSign className={className} />;
    case "early-crash":
      return <Icons.AlertTriangle className={className} />;
  }
}

function StressMetric({
  label,
  value,
  from,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  from: React.ReactNode;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.18em]">
        {label}
      </p>
      <p className={cn("mt-2 text-sm font-semibold tabular-nums", tone)}>{value}</p>
      <p className="text-muted-foreground mt-2 text-xs tabular-nums">from {from}</p>
    </div>
  );
}

function SimulationMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <div className="border-border/70 px-4 py-4 first:border-l-0 md:border-l">
      <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.18em]">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums leading-none",
          tone === "good" && "text-[hsl(102,32%,39%)]",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-2 text-xs">{detail}</p>
    </div>
  );
}

function StressTestsSection({
  stresses,
  loading,
  error,
  currency,
}: {
  stresses?: StressTestResult[];
  loading: boolean;
  error: unknown;
  currency: string;
}) {
  const sorted = useMemo(
    () =>
      [...(stresses ?? [])].sort(
        (a, b) =>
          severityRank(b.severity) - severityRank(a.severity) ||
          b.delta.shortfallAtGoalAge - a.delta.shortfallAtGoalAge,
      ),
    [stresses],
  );
  const message = errorMessage(error);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-muted-foreground/55 text-[10px] font-normal uppercase leading-none tracking-[0.24em]">
            Stress tests · {sorted.length || 6} scenarios
          </p>
          <h2 className="mt-2 font-serif text-[23px] font-normal leading-[1.05] tracking-[-0.02em]">
            What could break this plan?
          </h2>
        </div>
        <p className="text-muted-foreground/55 pt-0.5 text-[13px] font-normal italic leading-none">
          Sorted by impact. Deltas vs. baseline.
        </p>
      </div>

      {message && <p className="text-destructive py-2 text-sm">{message}</p>}

      {loading && (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {sorted.map((stress) => (
            <div
              key={stress.id}
              className="bg-card relative overflow-hidden rounded-xl border shadow-sm"
            >
              <div
                className={cn(
                  "absolute inset-y-5 left-0 w-0.5 rounded-r-full",
                  severityRailClass(stress.severity),
                )}
              />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StressIcon id={stress.id} />
                      <h3 className="text-base font-semibold leading-none">{stress.label}</h3>
                    </div>
                    <p className="text-muted-foreground mt-3 line-clamp-2 text-sm">
                      {stress.description}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.14em]",
                      severityBadgeClass(stress.severity),
                    )}
                  >
                    {stress.severity}
                  </Badge>
                </div>

                <div className="mt-5 border-t pt-4">
                  <div className="grid grid-cols-3 gap-4">
                    <StressMetric
                      label="FI age"
                      value={fiAgeDeltaLabel(stress)}
                      from={stress.baseline.fiAge ?? "—"}
                      tone={
                        stress.delta.fiAgeYears && stress.delta.fiAgeYears > 0
                          ? "text-destructive"
                          : undefined
                      }
                    />
                    <StressMetric
                      label="Shortfall"
                      value={compactDelta(stress.delta.shortfallAtGoalAge, currency)}
                      from={fmtCompact(stress.baseline.shortfallAtGoalAge, currency)}
                      tone={impactTextClass(stress.delta.shortfallAtGoalAge)}
                    />
                    <StressMetric
                      label="End portfolio"
                      value={compactDelta(stress.delta.portfolioAtHorizon, currency)}
                      from={fmtCompact(stress.baseline.portfolioAtHorizon, currency)}
                      tone={impactTextClass(stress.delta.portfolioAtHorizon, false)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MonteCarloTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload?: MonteCarloChartPoint }>;
  label?: string | number;
  currency: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="bg-popover rounded-lg border p-3 text-xs shadow-sm">
      <p className="font-semibold">Age {label}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">P90</span>
        <span className="text-right tabular-nums">{fmt(point.p90, currency)}</span>
        <span className="text-muted-foreground">P75</span>
        <span className="text-right tabular-nums">{fmt(point.p75, currency)}</span>
        <span className="text-muted-foreground">P50</span>
        <span className="text-right tabular-nums">{fmt(point.p50, currency)}</span>
        <span className="text-muted-foreground">P25</span>
        <span className="text-right tabular-nums">{fmt(point.p25, currency)}</span>
        <span className="text-muted-foreground">P10</span>
        <span className="text-right tabular-nums">{fmt(point.p10, currency)}</span>
      </div>
    </div>
  );
}

interface MonteCarloChartPoint {
  age: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p10Base: number;
  p10ToP90: number;
}

interface ReferenceCaptionProps {
  viewBox?: {
    x?: number;
    y?: number;
  };
  value: string;
  fill: string;
  side: "left" | "right";
}

function ReferenceCaption({ viewBox, value, fill, side }: ReferenceCaptionProps) {
  const x = typeof viewBox?.x === "number" ? viewBox.x : 0;
  const y = typeof viewBox?.y === "number" ? viewBox.y : 0;
  const gap = side === "left" ? -12 : 12;

  return (
    <text
      x={x + gap}
      y={y + 12}
      textAnchor={side === "left" ? "end" : "start"}
      fill={fill}
      fontSize={11}
      fontWeight={600}
    >
      {value}
    </text>
  );
}

function MonteCarloFanChart({
  result,
  currency,
  desiredAge,
}: {
  result: MonteCarloResult;
  currency: string;
  desiredAge: number;
}) {
  const chartData = result.ageAxis.map((age, index) => {
    const p10 = result.percentiles.p10[index] ?? 0;
    const p25 = result.percentiles.p25[index] ?? p10;
    const p50 = result.percentiles.p50[index] ?? p10;
    const p75 = result.percentiles.p75[index] ?? p50;
    const p90 = result.percentiles.p90[index] ?? p50;
    return {
      age,
      p10,
      p25,
      p50,
      p75,
      p90,
      p10Base: p10,
      p10ToP90: Math.max(0, p90 - p10),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData} margin={{ top: 18, right: 28, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="age"
          axisLine={false}
          tickLine={false}
          tick={{ fill: CHART.muted, fontSize: 12 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: CHART.muted, fontSize: 12 }}
          tickFormatter={(value) => fmtCompact(Number(value), currency)}
        />
        <Tooltip content={<MonteCarloTooltip currency={currency} />} />
        <Area
          dataKey="p10Base"
          stackId="fan"
          stroke="none"
          fill="transparent"
          isAnimationActive={false}
        />
        <Area dataKey="p10ToP90" stackId="fan" stroke="none" fill="hsl(92 18% 70% / 0.42)" />
        <Line dataKey="p50" stroke="hsl(91,34%,29%)" strokeWidth={2.25} dot={false} />
        <ReferenceLine
          x={desiredAge}
          stroke="hsl(50 3% 42%)"
          strokeDasharray="3 3"
          strokeWidth={1.4}
          label={(props) => (
            <ReferenceCaption
              {...props}
              value={`goal @${desiredAge}`}
              fill="hsl(50 3% 42%)"
              side="left"
            />
          )}
        />
        {result.medianFireAge && result.medianFireAge !== desiredAge && (
          <ReferenceLine
            x={result.medianFireAge}
            stroke="hsl(91,34%,29%)"
            strokeDasharray="3 3"
            strokeWidth={1.4}
            label={(props) => (
              <ReferenceCaption
                {...props}
                value={`median FI @${result.medianFireAge}`}
                fill="hsl(91,34%,29%)"
                side="right"
              />
            )}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MonteCarloDistributionSection({
  plan,
  result,
  running,
  error,
  onRun,
}: {
  plan: RetirementPlan;
  result?: MonteCarloResult;
  running: boolean;
  error: unknown;
  onRun: (nSims: number) => void;
}) {
  const message = errorMessage(error);
  const desiredAge = plan.personal.targetRetirementAge;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-0">
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-6">
          <div>
            <p className="text-muted-foreground/60 text-[10px] font-normal uppercase leading-none tracking-[0.24em]">
              Monte Carlo · stochastic
            </p>
            <CardTitle className="mt-2 font-serif text-[23px] font-normal leading-[1.05] tracking-[-0.02em]">
              How often does this plan succeed?
            </CardTitle>
            <p className="text-muted-foreground mt-4 max-w-[620px] text-sm leading-relaxed">
              Each simulation draws a new sequence of returns from your expected return and
              volatility. Seeded results stay stable across reruns.
            </p>
          </div>
          {result && (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRun(10_000)}
                disabled={running}
              >
                <Icons.Sparkles className="mr-2 size-3.5" />
                {running ? "Running…" : "Run 10k"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onRun(100_000)} disabled={running}>
                Run 100k (precision)
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {message && <p className="text-destructive text-sm">{message}</p>}
        {running && (
          <div className="space-y-3 p-5 md:p-6">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-[320px] w-full rounded-xl" />
          </div>
        )}
        {!running && !result && (
          <div className="m-5 rounded-xl bg-[hsl(88,45%,84%)] px-4 py-4 text-[hsl(91,31%,24%)] md:m-6 md:px-5">
            <div className="flex flex-col gap-4 text-center md:flex-row md:items-center md:justify-between md:text-left">
              <div>
                <p className="text-sm font-semibold">No stochastic run yet.</p>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[hsl(91,22%,32%)]">
                  Run 10k simulations to estimate success probability, median FI age, and downside
                  horizon value.
                </p>
              </div>
              <div className="flex shrink-0 justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => onRun(10_000)}
                  disabled={running}
                  className="bg-[hsl(91,34%,29%)] text-white hover:bg-[hsl(91,34%,24%)]"
                >
                  <Icons.Sparkles className="mr-2 size-3.5" />
                  Run 10k
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRun(100_000)}
                  disabled={running}
                  className="text-[hsl(91,31%,24%)] hover:bg-[hsl(91,34%,29%)]/10"
                >
                  Run 100k precision
                </Button>
              </div>
            </div>
          </div>
        )}
        {!running && result && (
          <>
            <div className="bg-muted/10 grid border-b md:grid-cols-5">
              <SimulationMetric
                label="Success rate"
                value={pct(result.successRate)}
                detail="portfolio > 0 at horizon"
                tone={result.successRate >= 0.8 ? "good" : "bad"}
              />
              <SimulationMetric
                label="Median FI age"
                value={result.medianFireAge ?? "—"}
                detail={`vs goal ${desiredAge}`}
              />
              <SimulationMetric
                label="Horizon · P10"
                value={fmtCompact(result.finalPortfolioAtHorizon.p10, plan.currency)}
                detail="bad-luck path"
                tone={result.finalPortfolioAtHorizon.p10 > 0 ? "default" : "bad"}
              />
              <SimulationMetric
                label="Horizon · P50"
                value={fmtCompact(result.finalPortfolioAtHorizon.p50, plan.currency)}
                detail="median"
              />
              <SimulationMetric
                label="Horizon · P90"
                value={fmtCompact(result.finalPortfolioAtHorizon.p90, plan.currency)}
                detail="good-luck path"
                tone="good"
              />
            </div>
            <div className="p-5 pt-3 md:p-6 md:pt-4">
              <MonteCarloFanChart
                result={result}
                currency={plan.currency}
                desiredAge={desiredAge}
              />
              <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-3 rounded-sm bg-[hsl(92_18%_70%_/_0.35)]" />
                  P10-P90 range
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-0.5 w-6 bg-[hsl(91,34%,29%)]" />
                  Median path
                </span>
                <span className="flex items-center gap-2">
                  <span className="border-muted-foreground h-0 w-6 border-t border-dashed" />
                  Goal age
                </span>
                {result.medianFireAge && result.medianFireAge !== desiredAge && (
                  <span className="flex items-center gap-2">
                    <span className="h-0 w-6 border-t border-dashed border-[hsl(91,34%,29%)]" />
                    Median FI age
                  </span>
                )}
                <span className="ml-auto italic">
                  Seeded · {result.nSimulations.toLocaleString()} sims
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function axisMoney(value: number, currency: string) {
  return fmtCompact(value, currency).replace(".0", "");
}

function SensitivityMatrixCard({
  title,
  subtitle,
  axisLabel,
  children,
}: {
  title: string;
  subtitle: string;
  axisLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
        </div>
        <p className="text-muted-foreground whitespace-nowrap pt-1 text-sm">{axisLabel}</p>
      </CardHeader>
      {children}
    </Card>
  );
}

function matrixBaselineCell(matrix: DecisionSensitivityMatrix) {
  if (matrix.baselineRow == null || matrix.baselineColumn == null) return null;
  return matrix.cells[matrix.baselineRow]?.[matrix.baselineColumn] ?? null;
}

function matrixDeltaRange(matrix: DecisionSensitivityMatrix) {
  const baseline = matrixBaselineCell(matrix);
  const baselinePortfolio = displayMetricBucket(baseline?.portfolioAtHorizon ?? 0);
  const deltas = matrix.cells
    .flat()
    .map((cell) => displayMetricBucket(cell.portfolioAtHorizon) - baselinePortfolio)
    .filter(Number.isFinite);
  return {
    baselinePortfolio,
    maxGain: Math.max(...deltas, 1),
    maxLoss: Math.max(...deltas.map((value) => Math.abs(Math.min(value, 0))), 1),
  };
}

function displayMetricBucket(value: number) {
  const abs = Math.abs(value);
  const scale = abs >= 1_000_000 ? 10_000 : abs >= 100_000 ? 1_000 : abs >= 1_000 ? 100 : 1;
  return Math.round(value / scale) * scale;
}

function logStrength(value: number, max: number) {
  if (value <= 0) return 0;
  return Math.min(1, Math.log1p(value) / Math.log1p(Math.max(1, max)));
}

function tint(color: "success" | "warning" | "destructive", strength: number) {
  const token =
    color === "success" ? "--success" : color === "warning" ? "--warning" : "--destructive";
  const mix = 5 + Math.max(0, Math.min(1, strength)) * 11;
  return `color-mix(in srgb, var(${token}) ${mix}%, var(--card))`;
}

function neutralRamp(lightStart: number, lightEnd: number, strength: number) {
  const lightness = lightStart - (lightStart - lightEnd) * Math.max(0, Math.min(1, strength));
  return `hsl(70 8% ${lightness}%)`;
}

function isFlatColumn(matrix: DecisionSensitivityMatrix, column: number) {
  if (matrix.baselineColumn == null || column === matrix.baselineColumn) return false;
  return matrix.cells.every((row, rowIndex) => {
    const cell = row[column];
    const baseline = matrix.cells[rowIndex]?.[matrix.baselineColumn!];
    if (!cell || !baseline) return false;
    return (
      Math.abs(cell.portfolioAtHorizon - baseline.portfolioAtHorizon) < 1 &&
      Math.abs(cell.shortfallAtGoalAge - baseline.shortfallAtGoalAge) < 1 &&
      cell.fiAge === baseline.fiAge
    );
  });
}

function sensitivityCellStyle({
  cell,
  baseline,
  range,
  active,
}: {
  cell: DecisionSensitivityCell;
  baseline: DecisionSensitivityCell | null;
  range: ReturnType<typeof matrixDeltaRange>;
  active: boolean;
}): CSSProperties {
  if (active) {
    return {
      backgroundColor: "var(--card)",
      color: "var(--foreground)",
    };
  }

  if (cell.portfolioAtHorizon <= 0) {
    return {
      backgroundColor: tint("destructive", 0.55),
      color: "var(--foreground)",
    };
  }

  const baselinePortfolio = displayMetricBucket(baseline?.portfolioAtHorizon ?? range.baselinePortfolio);
  const delta = displayMetricBucket(cell.portfolioAtHorizon) - baselinePortfolio;

  if (delta === 0) {
    return {
      backgroundColor: neutralRamp(93, 89, 0.25),
      color: "var(--foreground)",
    };
  }

  if (delta > 0) {
    const strength = logStrength(delta, range.maxGain);
    return {
      backgroundColor: tint("success", strength),
      color: "var(--foreground)",
    };
  }

  const strength = logStrength(Math.abs(delta), range.maxLoss);
  return {
    backgroundColor: tint("warning", strength),
    color: "var(--foreground)",
  };
}

function DecisionHeatmap({
  matrix,
  currency,
  formatRow,
  formatColumn,
  flatColumnHint,
}: {
  matrix: DecisionSensitivityMatrix;
  currency: string;
  formatRow: (value: number, label: string) => string;
  formatColumn: (value: number, label: string) => string;
  flatColumnHint?: string;
}) {
  const range = matrixDeltaRange(matrix);
  const baseline = matrixBaselineCell(matrix);

  return (
    <div className="overflow-x-auto px-5 pb-5 pt-6">
      <table className="w-full min-w-[560px] border-separate border-spacing-[3px] text-sm">
        <thead>
          <tr>
            <th className="w-24" />
            {matrix.columnValues.map((value, column) => (
              <th
                key={`${value}-${column}`}
                className={cn(
                  "text-muted-foreground px-2 pb-2.5 text-center text-[13px] font-semibold tabular-nums",
                  column === matrix.baselineColumn && "text-foreground",
                )}
              >
                {flatColumnHint && isFlatColumn(matrix, column) ? (
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-4">
                        {formatColumn(value, matrix.columnLabels[column] ?? "")}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">{flatColumnHint}</TooltipContent>
                  </UiTooltip>
                ) : (
                  formatColumn(value, matrix.columnLabels[column] ?? "")
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rowValues.map((rowValue, row) => (
            <tr key={`${rowValue}-${row}`}>
              <td
                className={cn(
                  "text-muted-foreground pr-3 text-right text-[13px] font-semibold tabular-nums",
                  row === matrix.baselineRow && "text-foreground",
                )}
              >
                {formatRow(rowValue, matrix.rowLabels[row] ?? "")}
              </td>
              {matrix.columnValues.map((columnValue, column) => {
                const cell = matrix.cells[row]?.[column];
                if (!cell) return <td key={`${columnValue}-${column}`} />;
                const active = row === matrix.baselineRow && column === matrix.baselineColumn;
                return (
                  <td key={`${columnValue}-${column}`}>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "rounded-[6px] px-3 py-[13px] text-center text-[13px] font-semibold tabular-nums transition-shadow",
                            active && "ring-2 ring-[hsl(91,34%,29%)] ring-offset-0",
                          )}
                          style={sensitivityCellStyle({ cell, baseline, range, active })}
                        >
                          {fmtCompact(cell.portfolioAtHorizon, currency)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        <div className="text-[10px] font-semibold uppercase tracking-wider">
                          {matrix.rowLabel} × {matrix.columnLabel}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                          <span className="text-muted-foreground">{matrix.rowLabel}</span>
                          <span className="text-right">
                            {formatRow(rowValue, matrix.rowLabels[row] ?? "")}
                          </span>
                          <span className="text-muted-foreground">{matrix.columnLabel}</span>
                          <span className="text-right">
                            {formatColumn(columnValue, matrix.columnLabels[column] ?? "")}
                          </span>
                          <span className="text-muted-foreground">End portfolio today</span>
                          <span className="text-right">
                            {fmt(cell.portfolioAtHorizon, currency)}
                          </span>
                          <span className="text-muted-foreground">Delta vs baseline</span>
                          <span
                            className={cn(
                              "text-right",
                              cell.portfolioAtHorizon > range.baselinePortfolio
                                ? "text-success"
                                : cell.portfolioAtHorizon < range.baselinePortfolio
                                  ? "text-muted-foreground"
                                  : "",
                            )}
                          >
                            {cell.portfolioAtHorizon >= range.baselinePortfolio ? "+" : "-"}
                            {fmt(
                              Math.abs(cell.portfolioAtHorizon - range.baselinePortfolio),
                              currency,
                            )}
                          </span>
                          <span className="text-muted-foreground">FI age</span>
                          <span className="text-right">{cell.fiAge ?? "Not reached"}</span>
                          <span className="text-muted-foreground">Goal shortfall today</span>
                          <span className="text-right">
                            {fmt(cell.shortfallAtGoalAge, currency)}
                          </span>
                        </div>
                      </TooltipContent>
                    </UiTooltip>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WhatMovesThePlanSection({
  sensitivity,
  loading,
  error,
  plan,
  plannerMode = "fire",
}: {
  sensitivity?: DecisionSensitivityResult;
  loading: boolean;
  error: unknown;
  plan: RetirementPlan;
  plannerMode?: PlannerMode;
}) {
  const message = errorMessage(error);
  const isFireMode = plannerMode !== "traditional";

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-muted-foreground/55 text-[10px] font-normal uppercase leading-none tracking-[0.24em]">
            Sensitivity · 2 grids
          </p>
          <h2 className="mt-2 font-serif text-[23px] font-normal leading-[1.05] tracking-[-0.02em]">
            What moves the plan?
          </h2>
        </div>
        <p className="text-muted-foreground/55 pt-0.5 text-[13px] font-normal italic leading-none">
          Baseline highlighted.
        </p>
      </div>

      {message && <p className="text-destructive text-sm">{message}</p>}
      {loading && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}
      {!loading && sensitivity && (
        <div className="grid gap-3 lg:grid-cols-2">
          <SensitivityMatrixCard
            title="Contribution × Return"
            subtitle="Portfolio at horizon in today's dollars"
            axisLabel="Expected return ↑ / Monthly contribution ↔"
          >
            <DecisionHeatmap
              matrix={sensitivity.contributionReturn}
              currency={plan.currency}
              formatRow={(value, label) => label || `${(value * 100).toFixed(1)}%`}
              formatColumn={(value) => axisMoney(value, plan.currency)}
            />
          </SensitivityMatrixCard>

          <SensitivityMatrixCard
            title={`${isFireMode ? "Desired age" : "Retirement age"} × Spending`}
            subtitle="Portfolio at horizon in today's dollars"
            axisLabel={`Monthly spending ↑ / ${isFireMode ? "Desired age" : "Retirement age"} ↔`}
          >
            <DecisionHeatmap
              matrix={sensitivity.retirementAgeSpending}
              currency={plan.currency}
              formatRow={(value) => axisMoney(value, plan.currency)}
              formatColumn={(value, label) => label || String(Math.round(value))}
              flatColumnHint={
                isFireMode
                  ? "No material change: in FIRE mode, withdrawals still start when the plan reaches FI, not necessarily at this desired age."
                  : undefined
              }
            />
          </SensitivityMatrixCard>
        </div>
      )}
    </section>
  );
}
function StrategyComparisonTable({
  result,
  currency,
}: {
  result: StrategyComparisonResult;
  currency: string;
}) {
  const rows = [
    ["Constant dollar", result.constantDollar],
    ["Constant percentage", result.constantPercentage],
    ["Guardrails", result.guardrails],
  ] as const;

  return (
    <div className="border-t">
      {rows.map(([label, row]) => (
        <div
          key={label}
          className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 border-b py-3 text-sm last:border-b-0"
        >
          <div>
            <p className="font-medium">{label}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{pct(row.successRate)} success</p>
          </div>
          <p className="text-muted-foreground tabular-nums">
            {row.medianFireAge ? `FI ${row.medianFireAge}` : "No FI"}
          </p>
          <p className="min-w-24 text-right font-semibold tabular-nums">
            {fmtCompact(row.finalPortfolioAtHorizon.p50, currency)}
          </p>
        </div>
      ))}
    </div>
  );
}

function SorrTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string | number;
    value?: number | string;
    color?: string;
  }>;
  label?: string | number;
  currency: string;
}) {
  const visiblePayload = payload?.filter((entry) => entry.value != null) ?? [];
  if (!active || visiblePayload.length === 0) return null;

  return (
    <div className="bg-popover min-w-56 rounded-lg border p-3 text-xs shadow-sm">
      <p className="font-semibold">Age {label}</p>
      <div className="mt-2 space-y-1.5">
        {visiblePayload.map((entry) => (
          <div
            key={String(entry.name)}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-2 tabular-nums"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: entry.color ?? CHART.muted }}
            />
            <span className="text-muted-foreground truncate">{entry.name}</span>
            <span className="font-medium">{fmt(Number(entry.value ?? 0), currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SorrChart({
  scenarios,
  currency,
  retirementStartAge,
}: {
  scenarios: SorrScenario[];
  currency: string;
  retirementStartAge: number;
}) {
  const colors = [
    "hsl(91,34%,29%)",
    "hsl(8,55%,45%)",
    "hsl(38,65%,43%)",
    "hsl(191,24%,42%)",
    "hsl(50,4%,45%)",
  ];
  const maxLen = Math.max(...scenarios.map((scenario) => scenario.portfolioPath.length));
  const data = Array.from({ length: maxLen }, (_, index) => {
    const entry: Record<string, number> = { age: retirementStartAge + index };
    scenarios.forEach((scenario) => {
      entry[scenario.label] = scenario.portfolioPath[index] ?? 0;
    });
    return entry;
  });

  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={data} margin={{ top: 12, right: 18, left: 18, bottom: 10 }}>
        <CartesianGrid
          vertical={false}
          stroke="hsl(var(--border))"
          strokeDasharray="3 3"
          opacity={0.55}
        />
        <XAxis
          dataKey="age"
          hide
          axisLine={false}
          tickLine={false}
          tick={{ fill: CHART.muted, fontSize: 12 }}
        />
        <YAxis
          hide
          axisLine={false}
          tickLine={false}
          tick={{ fill: CHART.muted, fontSize: 12 }}
          tickFormatter={(value) => fmtCompact(Number(value), currency)}
        />
        <Tooltip
          content={<SorrTooltip currency={currency} />}
          cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "3 3" }}
        />
        {scenarios.map((scenario, index) => (
          <Line
            key={scenario.label}
            dataKey={scenario.label}
            stroke={colors[index % colors.length]}
            dot={false}
            activeDot={{ r: 4, stroke: "hsl(var(--card))", strokeWidth: 2 }}
            strokeWidth={scenario.label === "Base (constant)" ? 2.2 : 1.5}
            strokeDasharray={scenario.label === "Base (constant)" ? undefined : "4 4"}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function AdvancedSection({
  plan,
  overview,
  strategyResult,
  strategyRunning,
  strategyError,
  onRunStrategy,
  sorrResult,
  sorrRunning,
  sorrError,
  onRunSorr,
}: {
  plan: RetirementPlan;
  overview?: RetirementOverview;
  strategyResult?: StrategyComparisonResult;
  strategyRunning: boolean;
  strategyError: unknown;
  onRunStrategy: () => void;
  sorrResult?: SorrScenario[];
  sorrRunning: boolean;
  sorrError: unknown;
  onRunSorr: () => void;
}) {
  const retirementStartAge = overview?.retirementStartAge ?? plan.personal.targetRetirementAge;
  const canRunSorr = (overview?.portfolioAtRetirementStart ?? 0) > 0;

  return (
    <details open className="bg-card group overflow-hidden rounded-xl border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-start gap-3">
          <Icons.ChevronDown className="text-muted-foreground mt-3 size-3.5 transition-transform group-open:rotate-180" />
          <div>
            <p className="text-muted-foreground/60 text-[10px] font-normal uppercase leading-none tracking-[0.24em]">
              Advanced
            </p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-[-0.01em]">
              Sequence-of-returns & strategy comparison
            </h2>
          </div>
        </div>
      </summary>

      <div className="grid gap-8 border-t p-5 lg:grid-cols-2">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Sample sequence-of-returns paths</h3>
              <p className="text-muted-foreground mt-2 max-w-[720px] text-sm leading-relaxed">
                Five crash-timing paths through your retirement window. Early losses matter more
                than late ones.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRunSorr}
              disabled={sorrRunning || !canRunSorr}
              className="shrink-0"
            >
              {sorrRunning ? "Running…" : sorrResult ? "Refresh" : "Run paths"}
            </Button>
          </div>

          {!canRunSorr && (
            <p className="text-muted-foreground mt-4 text-sm">
              Sequence risk needs a positive projected portfolio at retirement start.
            </p>
          )}
          {errorMessage(sorrError) && (
            <p className="text-destructive mt-4 text-sm">{errorMessage(sorrError)}</p>
          )}
          {sorrResult ? (
            <>
              <div className="mt-2">
                <SorrChart
                  scenarios={sorrResult}
                  currency={plan.currency}
                  retirementStartAge={retirementStartAge}
                />
              </div>
              <div className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                {sorrResult.map((scenario) => (
                  <div
                    key={scenario.label}
                    className="flex items-center justify-between gap-3 tabular-nums"
                  >
                    <span className="text-muted-foreground truncate">{scenario.label}</span>
                    <span className="font-medium">
                      {scenario.survived
                        ? fmtCompact(scenario.finalValue, plan.currency)
                        : `Fails ${scenario.failureAge ?? "?"}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            canRunSorr && (
              <div className="text-muted-foreground mt-6 rounded-lg border border-dashed p-6 text-center text-sm">
                Run paths to see how crash timing changes the cash path value.
              </div>
            )
          )}
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Strategy comparison</h3>
              <p className="text-muted-foreground mt-2 max-w-[720px] text-sm leading-relaxed">
                Different withdrawal rules at your current assumptions. Stable vs. responsive
                spending trades off certainty for efficiency.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRunStrategy}
              disabled={strategyRunning}
              className="shrink-0"
            >
              {strategyRunning ? "Comparing…" : strategyResult ? "Refresh" : "Compare"}
            </Button>
          </div>
          {errorMessage(strategyError) && (
            <p className="text-destructive mt-4 text-sm">{errorMessage(strategyError)}</p>
          )}
          <div className="mt-4">
            {strategyResult ? (
              <StrategyComparisonTable result={strategyResult} currency={plan.currency} />
            ) : (
              <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                Compare strategies to see FI age and median horizon value.
              </div>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

export default function RiskLabPage({
  plan,
  totalValue,
  isLoading,
  retirementOverview,
  plannerMode,
  goalId,
}: Props) {
  const portfolioNow = retirementOverview?.portfolioNow ?? totalValue;
  const portfolioAtRetirementStart = retirementOverview?.portfolioAtRetirementStart ?? portfolioNow;
  const retirementStartAge =
    retirementOverview?.retirementStartAge ?? plan.personal.targetRetirementAge;
  const planKey = useMemo(() => JSON.stringify(plan), [plan]);

  const stressQuery = useQuery({
    queryKey: ["retirement-risk-lab-stress", goalId, plannerMode, planKey, portfolioNow],
    queryFn: () => runRetirementStressTests(plan, portfolioNow, plannerMode, goalId),
    enabled: !isLoading,
    staleTime: 5 * 60 * 1000,
  });

  const sensitivityQuery = useQuery({
    queryKey: [
      "retirement-risk-lab-decision-sensitivity",
      goalId,
      plannerMode,
      planKey,
      portfolioNow,
    ],
    queryFn: () => runRetirementDecisionSensitivity(plan, portfolioNow, plannerMode, goalId),
    enabled: !isLoading,
    staleTime: 5 * 60 * 1000,
  });

  const monteCarlo = useMutation({
    mutationFn: (nSims: number) =>
      runRetirementMonteCarlo(
        plan,
        portfolioNow,
        nSims,
        plannerMode,
        goalId,
        stableSeed([planKey, portfolioNow, plannerMode, goalId, nSims]),
      ),
  });

  const strategyComparison = useMutation({
    mutationFn: () =>
      runRetirementStrategyComparison(plan, portfolioNow, 5_000, plannerMode, goalId),
  });

  const sorr = useMutation({
    mutationFn: () =>
      runRetirementSorr(plan, portfolioAtRetirementStart, retirementStartAge, goalId),
  });

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
      <PlanResilienceHero
        plan={plan}
        overview={retirementOverview}
        stresses={stressQuery.data}
        stressLoading={stressQuery.isLoading}
        mc={monteCarlo.data}
      />

      <MonteCarloDistributionSection
        plan={plan}
        result={monteCarlo.data}
        running={monteCarlo.isPending}
        error={monteCarlo.error}
        onRun={(nSims) => monteCarlo.mutate(nSims)}
      />

      <StressTestsSection
        stresses={stressQuery.data}
        loading={stressQuery.isLoading}
        error={stressQuery.error}
        currency={plan.currency}
      />

      <WhatMovesThePlanSection
        sensitivity={sensitivityQuery.data}
        loading={sensitivityQuery.isLoading}
        error={sensitivityQuery.error}
        plan={plan}
        plannerMode={plannerMode}
      />

      <AdvancedSection
        plan={plan}
        overview={retirementOverview}
        strategyResult={strategyComparison.data}
        strategyRunning={strategyComparison.isPending}
        strategyError={strategyComparison.error}
        onRunStrategy={() => strategyComparison.mutate()}
        sorrResult={sorr.data}
        sorrRunning={sorr.isPending}
        sorrError={sorr.error}
        onRunSorr={() => sorr.mutate()}
      />
    </div>
  );
}
