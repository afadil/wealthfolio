import { invoke } from "./core";
import type {
  FireSettings,
  FireProjection,
  MonteCarloResult,
  ScenarioResult,
  SorrScenario,
} from "@/pages/fire-planner/types";

export interface SensitivityResult {
  contribution: {
    contributionRows: number[];
    returnColumns: number[];
    fireAges: (number | null)[][];
  };
  swr: {
    swrRows: number[];
    returnColumns: number[];
    fireAges: (number | null)[][];
  };
}

export interface StrategyComparisonResult {
  constantDollar: MonteCarloResult;
  constantPercentage: MonteCarloResult;
}

export const getFireSettings = async (): Promise<FireSettings | null> => {
  return invoke<FireSettings | null>("get_fire_settings");
};

export const saveFireSettings = async (settings: FireSettings): Promise<void> => {
  return invoke<void>("save_fire_settings", { settings });
};

export const calculateFireProjection = async (
  settings: FireSettings,
  currentPortfolio: number,
): Promise<FireProjection> => {
  return invoke<FireProjection>("calculate_fire_projection", { settings, currentPortfolio });
};

export const runFireMonteCarlo = async (
  settings: FireSettings,
  currentPortfolio: number,
  nSims = 10_000,
): Promise<MonteCarloResult> => {
  return invoke<MonteCarloResult>("run_fire_monte_carlo", {
    settings,
    currentPortfolio,
    nSims,
  });
};

export const runFireScenarioAnalysis = async (
  settings: FireSettings,
  currentPortfolio: number,
): Promise<ScenarioResult[]> => {
  return invoke<ScenarioResult[]>("run_fire_scenario_analysis", { settings, currentPortfolio });
};

export const runFireSorr = async (
  settings: FireSettings,
  portfolioAtFire: number,
): Promise<SorrScenario[]> => {
  return invoke<SorrScenario[]>("run_fire_sorr", { settings, portfolioAtFire });
};

export const runFireSensitivity = async (
  settings: FireSettings,
  currentPortfolio: number,
): Promise<SensitivityResult> => {
  return invoke<SensitivityResult>("run_fire_sensitivity", { settings, currentPortfolio });
};

export const runFireStrategyComparison = async (
  settings: FireSettings,
  currentPortfolio: number,
  nSims = 5_000,
): Promise<StrategyComparisonResult> => {
  return invoke<StrategyComparisonResult>("run_fire_strategy_comparison", {
    settings,
    currentPortfolio,
    nSims,
  });
};
