import type {
  FireSettings,
  FireProjection,
  YearlySnapshot,
  MonteCarloResult,
  ScenarioResult,
  SorrScenario,
  AllocationHealth,
  SensitivityMatrix,
  SensitivitySWRMatrix,
} from "../types";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function gaussianRandom(mean: number, std: number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Two-regime fat-tailed return distribution.
// 85% normal years: μ+1.5%, σ×0.8 — 15% stress years: μ−8.5%, σ×1.8
// Long-run mean preserved: 0.85×(μ+0.015) + 0.15×(μ−0.085) = μ
function sampleReturn(mean: number, std: number): number {
  if (Math.random() < 0.15) {
    return gaussianRandom(mean - 0.085, std * 1.8);
  }
  return gaussianRandom(mean + 0.015, std * 0.8);
}

function additionalIncomeAtAge(
  streams: FireSettings["additionalIncomeStreams"],
  age: number,
  yearsFromNow: number,
  inflationRate: number,
): number {
  return streams
    .filter((s) => age >= s.startAge)
    .reduce((sum, s) => {
      const annual = s.monthlyAmount * 12;
      const rate =
        s.annualGrowthRate !== undefined
          ? s.annualGrowthRate
          : s.adjustForInflation
            ? inflationRate
            : 0;
      return sum + annual * Math.pow(1 + rate, yearsFromNow);
    }, 0);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ─── Core FIRE Calculations ────────────────────────────────────────────────────

// Gross FIRE target — ignores income streams. Used for display / SWR label.
export function calculateFireTarget(settings: FireSettings): number {
  return (settings.monthlyExpensesAtFire * 12) / settings.safeWithdrawalRate;
}

// Net FIRE target — subtracts income available from day-1 of FIRE (startAge <= targetFireAge).
// Deferred streams (e.g. INPS at 67 when FIRE at 55) are NOT subtracted here;
// the portfolio needs to bridge that gap on its own.
export function calculateNetFireTarget(settings: FireSettings): number {
  const incomeAtFireAge = settings.additionalIncomeStreams
    .filter((s) => s.startAge <= settings.targetFireAge)
    .reduce((sum, s) => sum + s.monthlyAmount, 0);
  const netMonthly = Math.max(0, settings.monthlyExpensesAtFire - incomeAtFireAge);
  return (netMonthly * 12) / settings.safeWithdrawalRate;
}

export function calculateCoastFireAmount(settings: FireSettings): number {
  const fireTarget = calculateNetFireTarget(settings);
  const yearsToGrow = settings.targetFireAge - settings.currentAge;
  if (yearsToGrow <= 0) return fireTarget;
  // Inflate real target to nominal value at FIRE age, then discount back at nominal return
  return (
    (fireTarget * Math.pow(1 + settings.inflationRate, yearsToGrow)) /
    Math.pow(1 + settings.expectedAnnualReturn, yearsToGrow)
  );
}

// ─── Deterministic Projection ──────────────────────────────────────────────────

// Track pension fund balances year by year (separate from main portfolio).
// Three phases:
//   1. Pre-FIRE (still employed): fund grows + contributions (TFR) are added
//   2. Post-FIRE, pre-payout: fund grows on investment return only (no more TFR)
//   3. Payout (age >= startAge): fund is fixed; monthly income drawn from it
function stepPensionFunds(
  streams: FireSettings["additionalIncomeStreams"],
  balances: Map<string, number>,
  age: number,
  inFire: boolean,
): number {
  let total = 0;
  for (const s of streams) {
    const hasAccumulation = (s.currentValue ?? 0) > 0 || (s.monthlyContribution ?? 0) > 0;
    if (!hasAccumulation) continue;

    const current = balances.get(s.id) ?? s.currentValue ?? 0;

    if (age < s.startAge) {
      const r = s.accumulationReturn ?? 0.04;
      // Contributions (TFR) only while still employed — stop at FIRE
      const contributions = inFire ? 0 : (s.monthlyContribution ?? 0) * 12;
      const next = current * (1 + r) + contributions;
      balances.set(s.id, next);
      total += next;
    } else {
      // Payout age reached: fund converted to annuity — zero out for subsequent snapshots.
      // The snapshot for this year already captured the peak balance (read before this step).
      balances.set(s.id, 0);
    }
  }
  return total;
}

export function projectFireDate(settings: FireSettings, currentPortfolio: number): FireProjection {
  // Real (today's €) target for display; each loop year inflates it to nominal for the trigger
  const realFireTarget = calculateNetFireTarget(settings);
  const coastAmount = calculateCoastFireAmount(settings);
  const startYear = new Date().getFullYear();
  const horizonYears = Math.max(1, settings.planningHorizonAge - settings.currentAge);
  const r = settings.expectedAnnualReturn;
  const contribGrowth = settings.salaryGrowthRate ?? settings.contributionGrowthRate;

  let portfolio = currentPortfolio;
  let fireAge: number | null = null;
  let fireYear: number | null = null;
  let portfolioAtFire = 0;
  let inFire = false;
  const yearByYear: YearlySnapshot[] = [];

  // Initialise pension fund balances from currentValue of each stream
  const pensionBalances = new Map<string, number>(
    settings.additionalIncomeStreams.map((s) => [s.id, s.currentValue ?? 0]),
  );

  for (let i = 0; i <= horizonYears; i++) {
    const age = settings.currentAge + i;
    const year = startYear + i;

    // Snapshot uses start-of-year pension value (before stepping for this year)
    const pensionAssets = [...pensionBalances.values()].reduce((s, v) => s + v, 0);

    // Trigger FIRE when nominal portfolio ≥ nominal target (real target × (1+inf)^i)
    const nominalFireTarget = realFireTarget * Math.pow(1 + settings.inflationRate, i);
    if (!inFire && (portfolio >= nominalFireTarget || age >= settings.targetFireAge)) {
      inFire = true;
      fireAge = age;
      fireYear = year;
      portfolioAtFire = portfolio;
    }

    if (inFire) {
      const annualExpenses =
        settings.monthlyExpensesAtFire * 12 * Math.pow(1 + settings.inflationRate, i);
      const annualIncome = additionalIncomeAtAge(
        settings.additionalIncomeStreams,
        age,
        i,
        settings.inflationRate,
      );

      const netWithdrawal =
        (settings.withdrawalStrategy ?? "constant-dollar") === "constant-percentage"
          ? settings.safeWithdrawalRate * portfolio
          : Math.max(0, annualExpenses - annualIncome);

      yearByYear.push({
        age,
        year,
        phase: "fire",
        portfolioValue: Math.max(0, portfolio),
        annualContribution: 0,
        annualWithdrawal: annualExpenses,
        annualIncome,
        netWithdrawalFromPortfolio: netWithdrawal,
        pensionAssets,
      });

      portfolio = Math.max(0, portfolio * (1 + r) - netWithdrawal);
    } else {
      const annualContribution = settings.monthlyContribution * 12 * Math.pow(1 + contribGrowth, i);

      yearByYear.push({
        age,
        year,
        phase: "accumulation",
        portfolioValue: portfolio,
        annualContribution,
        annualWithdrawal: 0,
        annualIncome: 0,
        netWithdrawalFromPortfolio: 0,
        pensionAssets,
      });

      portfolio = portfolio * (1 + r) + annualContribution;
    }

    // Advance pension balances for the next iteration (contributions stop once in FIRE)
    stepPensionFunds(settings.additionalIncomeStreams, pensionBalances, age, inFire);
  }

  return {
    fireAge,
    fireYear,
    portfolioAtFire,
    coastFireAmount: coastAmount,
    coastFireReached: currentPortfolio >= coastAmount,
    yearByYear,
  };
}

// ─── Monte Carlo ───────────────────────────────────────────────────────────────

export function runMonteCarlo(
  settings: FireSettings,
  currentPortfolio: number,
  nSims = 1000,
): MonteCarloResult {
  const realFireTarget = calculateNetFireTarget(settings); // real (today's €); inflated per year for trigger
  const horizonYears = Math.max(1, settings.planningHorizonAge - settings.currentAge);
  const contribGrowth = settings.salaryGrowthRate ?? settings.contributionGrowthRate;

  // paths[simIndex][yearIndex] = portfolio value
  const paths: number[][] = [];
  let survivedCount = 0;
  const fireAges: number[] = [];

  const useConstantPct =
    (settings.withdrawalStrategy ?? "constant-dollar") === "constant-percentage";

  for (let sim = 0; sim < nSims; sim++) {
    let portfolio = currentPortfolio;
    let inFire = false;
    let simFireAge: number | null = null;
    const path: number[] = [];
    let cumulativeInflation = 1.0;

    for (let i = 0; i <= horizonYears; i++) {
      const age = settings.currentAge + i;
      path.push(Math.max(0, portfolio));

      const nominalFireTarget = realFireTarget * Math.pow(1 + settings.inflationRate, i);
      if (!inFire && (portfolio >= nominalFireTarget || age >= settings.targetFireAge)) {
        inFire = true;
        simFireAge = age;
      }

      const annualReturn = sampleReturn(
        settings.expectedAnnualReturn,
        settings.expectedReturnStdDev,
      );

      if (inFire) {
        const annualExpenses = settings.monthlyExpensesAtFire * 12 * cumulativeInflation;
        const annualIncome = additionalIncomeAtAge(
          settings.additionalIncomeStreams,
          age,
          i,
          settings.inflationRate,
        );
        const netWithdrawal = useConstantPct
          ? settings.safeWithdrawalRate * portfolio
          : Math.max(0, annualExpenses - annualIncome);
        portfolio = Math.max(0, portfolio * (1 + annualReturn) - netWithdrawal);
      } else {
        const annualContribution =
          settings.monthlyContribution * 12 * Math.pow(1 + contribGrowth, i);
        portfolio = portfolio * (1 + annualReturn) + annualContribution;
      }

      // Stochastic inflation: update cumulative factor for the next year
      cumulativeInflation *= 1 + gaussianRandom(settings.inflationRate, 0.01);
    }

    paths.push(path);
    if (portfolio > 0) survivedCount++;
    if (simFireAge !== null) fireAges.push(simFireAge);
  }

  // Compute percentile paths across all simulations at each year
  const yearCount = horizonYears + 1;
  const p10: number[] = [];
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  const p90: number[] = [];
  const ageAxis: number[] = [];

  for (let i = 0; i < yearCount; i++) {
    const vals = paths.map((p) => p[i]).sort((a, b) => a - b);
    p10.push(percentile(vals, 0.1));
    p25.push(percentile(vals, 0.25));
    p50.push(percentile(vals, 0.5));
    p75.push(percentile(vals, 0.75));
    p90.push(percentile(vals, 0.9));
    ageAxis.push(settings.currentAge + i);
  }

  const finalVals = paths.map((p) => p[yearCount - 1]).sort((a, b) => a - b);

  fireAges.sort((a, b) => a - b);
  const medianFireAge =
    fireAges.length > 0 ? fireAges[Math.floor(fireAges.length / 2)] : settings.targetFireAge;

  return {
    successRate: survivedCount / nSims,
    medianFireAge,
    percentiles: { p10, p25, p50, p75, p90 },
    ageAxis,
    finalPortfolioAtHorizon: {
      p10: percentile(finalVals, 0.1),
      p25: percentile(finalVals, 0.25),
      p50: percentile(finalVals, 0.5),
      p75: percentile(finalVals, 0.75),
      p90: percentile(finalVals, 0.9),
    },
    nSimulations: nSims,
  };
}

// ─── Scenario Analysis ─────────────────────────────────────────────────────────

export function runScenarioAnalysis(
  settings: FireSettings,
  currentPortfolio: number,
): ScenarioResult[] {
  const scenarios = [
    { label: "Pessimistic", delta: -0.02 },
    { label: "Base case", delta: 0 },
    { label: "Optimistic", delta: +0.015 },
  ];

  return scenarios.map(({ label, delta }) => {
    const adjusted: FireSettings = {
      ...settings,
      expectedAnnualReturn: settings.expectedAnnualReturn + delta,
    };
    const proj = projectFireDate(adjusted, currentPortfolio);
    const lastSnapshot = proj.yearByYear[proj.yearByYear.length - 1];
    return {
      label,
      annualReturn: adjusted.expectedAnnualReturn,
      fireAge: proj.fireAge,
      portfolioAtHorizon: lastSnapshot?.portfolioValue ?? 0,
      yearByYear: proj.yearByYear,
    };
  });
}

// ─── Sequence of Returns Risk ──────────────────────────────────────────────────

export function runSequenceOfReturnsRisk(
  settings: FireSettings,
  portfolioAtFire: number,
): SorrScenario[] {
  const r = settings.expectedAnnualReturn;
  const years = Math.max(10, settings.planningHorizonAge - settings.targetFireAge);
  // yearsToFire offsets the inflation/income-growth index so it is always
  // "years from today" (currentAge), not "years from FIRE date".
  const yearsToFire = Math.max(0, settings.targetFireAge - settings.currentAge);

  const useConstantPct =
    (settings.withdrawalStrategy ?? "constant-dollar") === "constant-percentage";

  const scenarios: { label: string; returnsFactory: () => number[] }[] = [
    {
      label: "Base (constant)",
      returnsFactory: () => Array(years).fill(r),
    },
    {
      label: "Crash Year 1 (−30%)",
      returnsFactory: () => [-0.3, ...Array(years - 1).fill(r + 0.01)],
    },
    {
      label: "Crash Year 5 (−30%)",
      returnsFactory: () => [...Array(4).fill(r), -0.3, ...Array(years - 5).fill(r + 0.01)],
    },
    {
      label: "Double Crash",
      returnsFactory: () => [-0.25, r, r, r, -0.2, ...Array(years - 5).fill(r)],
    },
    {
      label: "Lost Decade",
      returnsFactory: () => [...Array(10).fill(0), ...Array(years - 10).fill(r + 0.02)],
    },
  ];

  return scenarios.map(({ label, returnsFactory }) => {
    const returns = returnsFactory();
    const path: number[] = [];
    let portfolio = portfolioAtFire;

    for (let i = 0; i < years; i++) {
      path.push(Math.max(0, portfolio));
      const age = settings.targetFireAge + i;
      // yearsFromNow must be relative to currentAge (not FIRE date) so that
      // expenses and inflation-linked income are correctly priced in future money.
      const yearsFromNow = yearsToFire + i;
      const annualExpenses =
        settings.monthlyExpensesAtFire * 12 * Math.pow(1 + settings.inflationRate, yearsFromNow);
      const annualIncome = additionalIncomeAtAge(
        settings.additionalIncomeStreams,
        age,
        yearsFromNow,
        settings.inflationRate,
      );
      const netWithdrawal = useConstantPct
        ? settings.safeWithdrawalRate * portfolio
        : Math.max(0, annualExpenses - annualIncome);
      portfolio = Math.max(0, portfolio * (1 + returns[i]) - netWithdrawal);
    }
    path.push(Math.max(0, portfolio));

    return {
      label,
      returns,
      portfolioPath: path,
      finalValue: portfolio,
      survived: portfolio > 0,
    };
  });
}

// ─── Allocation Drift ──────────────────────────────────────────────────────────

export interface HoldingInput {
  symbol: string;
  name: string;
  marketValue: number;
}

export interface ActivityInput {
  symbol: string;
  activityType: string;
  date: string; // ISO date string
}

export function checkAllocationDrift(
  holdings: HoldingInput[],
  targetAllocations: Record<string, number>,
  activities: ActivityInput[],
): AllocationHealth[] {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  if (totalValue === 0) return [];

  const today = new Date();

  return Object.entries(targetAllocations)
    .filter(([, target]) => target > 0)
    .map(([symbol, targetWeight]) => {
      const holding = holdings.find((h) => h.symbol === symbol || h.name === symbol);
      const currentValue = holding?.marketValue ?? 0;
      const currentWeight = currentValue / totalValue;
      const drift = currentWeight - targetWeight;

      // Find last BUY for this symbol
      const buys = activities
        .filter(
          (a) => (a.symbol === symbol || a.symbol === holding?.symbol) && a.activityType === "BUY",
        )
        .map((a) => new Date(a.date).getTime())
        .filter((t) => !isNaN(t));

      const lastBuy = buys.length > 0 ? Math.max(...buys) : null;
      const daysSinceLastBuy = lastBuy
        ? Math.floor((today.getTime() - lastBuy) / (1000 * 60 * 60 * 24))
        : null;

      const status: AllocationHealth["status"] =
        drift < -0.02 ? "underweight" : drift > 0.02 ? "overweight" : "ok";

      return {
        symbol,
        name: holding?.name ?? symbol,
        currentWeight,
        targetWeight,
        drift,
        status,
        currentValue,
        daysSinceLastBuy,
      };
    });
}

// ─── Strategy Comparison ───────────────────────────────────────────────────────

export function runStrategyComparison(
  settings: FireSettings,
  currentPortfolio: number,
  nSims = 1000,
): { constantDollar: MonteCarloResult; constantPercentage: MonteCarloResult } {
  return {
    constantDollar: runMonteCarlo(
      { ...settings, withdrawalStrategy: "constant-dollar" },
      currentPortfolio,
      nSims,
    ),
    constantPercentage: runMonteCarlo(
      { ...settings, withdrawalStrategy: "constant-percentage" },
      currentPortfolio,
      nSims,
    ),
  };
}

// ─── Sensitivity Analysis ──────────────────────────────────────────────────────

export function runSensitivityAnalysis(
  settings: FireSettings,
  currentPortfolio: number,
): { contribution: SensitivityMatrix; swr: SensitivitySWRMatrix } {
  const contributionMultipliers = [0.5, 0.75, 1.0, 1.25, 1.5];
  const returnValues = [0.04, 0.05, 0.06, 0.07, 0.08, 0.09];
  const swrValues = [0.03, 0.035, 0.04, 0.045, 0.05];

  const contributionRows = contributionMultipliers.map((m) => settings.monthlyContribution * m);

  const fireAges: (number | null)[][] = contributionRows.map((contribution) =>
    returnValues.map((ret) => {
      const s: FireSettings = {
        ...settings,
        monthlyContribution: contribution,
        expectedAnnualReturn: ret,
      };
      return projectFireDate(s, currentPortfolio).fireAge;
    }),
  );

  const fireAgesBySwr: (number | null)[][] = swrValues.map((swr) =>
    returnValues.map((ret) => {
      const s: FireSettings = {
        ...settings,
        safeWithdrawalRate: swr,
        expectedAnnualReturn: ret,
      };
      return projectFireDate(s, currentPortfolio).fireAge;
    }),
  );

  return {
    contribution: { contributionRows, returnColumns: returnValues, fireAges },
    swr: { swrRows: swrValues, returnColumns: returnValues, fireAges: fireAgesBySwr },
  };
}
