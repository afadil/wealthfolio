import type {
  FireProjection,
  MonteCarloResult,
  RetirementPlan,
  ScenarioResult,
  SorrScenario,
  SensitivityResult,
  StrategyComparisonResult,
} from "@/pages/fire-planner/types";
import type { PlannerMode } from "@/lib/types";
import { invoke } from "./core";

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
): Promise<MonteCarloResult> => {
  return invoke<MonteCarloResult>("run_retirement_monte_carlo", {
    plan,
    currentPortfolio,
    nSims,
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
