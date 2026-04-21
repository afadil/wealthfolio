import { invoke } from "./core";
import type {
  DecisionSensitivityResult,
  FireProjection,
  MonteCarloResult,
  RetirementPlan,
  ScenarioResult,
  SorrScenario,
  SensitivityResult,
  StressTestResult,
  StrategyComparisonResult,
} from "@/features/goals/retirement-planner/types";
import type { PlannerMode } from "@/lib/types";

export type { SensitivityResult, StrategyComparisonResult };

export const calculateRetirementProjection = async (
  plan: RetirementPlan,
  currentPortfolio: number,
  plannerMode?: PlannerMode,
  goalId?: string,
): Promise<FireProjection> => {
  return invoke<FireProjection>("calculate_retirement_projection", {
    plan,
    currentPortfolio,
    plannerMode,
    goalId,
  });
};

export const runRetirementMonteCarlo = async (
  plan: RetirementPlan,
  currentPortfolio: number,
  nSims = 100_000,
  plannerMode?: PlannerMode,
  goalId?: string,
  seed?: number,
): Promise<MonteCarloResult> => {
  return invoke<MonteCarloResult>("run_retirement_monte_carlo", {
    plan,
    currentPortfolio,
    nSims,
    plannerMode,
    goalId,
    seed,
  });
};

export const runRetirementStressTests = async (
  plan: RetirementPlan,
  currentPortfolio: number,
  plannerMode?: PlannerMode,
  goalId?: string,
): Promise<StressTestResult[]> => {
  return invoke<StressTestResult[]>("run_retirement_stress_tests", {
    plan,
    currentPortfolio,
    plannerMode,
    goalId,
  });
};

export const runRetirementScenarioAnalysis = async (
  plan: RetirementPlan,
  currentPortfolio: number,
  plannerMode?: PlannerMode,
  goalId?: string,
): Promise<ScenarioResult[]> => {
  return invoke<ScenarioResult[]>("run_retirement_scenario_analysis", {
    plan,
    currentPortfolio,
    plannerMode,
    goalId,
  });
};

export const runRetirementSorr = async (
  plan: RetirementPlan,
  portfolioAtFire: number,
  retirementStartAge: number,
  goalId?: string,
): Promise<SorrScenario[]> => {
  return invoke<SorrScenario[]>("run_retirement_sorr", {
    plan,
    portfolioAtFire,
    retirementStartAge,
    goalId,
  });
};

export const runRetirementSensitivity = async (
  plan: RetirementPlan,
  currentPortfolio: number,
  plannerMode?: PlannerMode,
  goalId?: string,
): Promise<SensitivityResult> => {
  return invoke<SensitivityResult>("run_retirement_sensitivity", {
    plan,
    currentPortfolio,
    plannerMode,
    goalId,
  });
};

export const runRetirementDecisionSensitivity = async (
  plan: RetirementPlan,
  currentPortfolio: number,
  plannerMode?: PlannerMode,
  goalId?: string,
): Promise<DecisionSensitivityResult> => {
  return invoke<DecisionSensitivityResult>("run_retirement_decision_sensitivity", {
    plan,
    currentPortfolio,
    plannerMode,
    goalId,
  });
};

export const runRetirementStrategyComparison = async (
  plan: RetirementPlan,
  currentPortfolio: number,
  nSims = 5_000,
  plannerMode?: PlannerMode,
  goalId?: string,
): Promise<StrategyComparisonResult> => {
  return invoke<StrategyComparisonResult>("run_retirement_strategy_comparison", {
    plan,
    currentPortfolio,
    nSims,
    plannerMode,
    goalId,
  });
};
