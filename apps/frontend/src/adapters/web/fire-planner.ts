import type {
  FireSettings,
  FireProjection,
  MonteCarloResult,
  ScenarioResult,
  SorrScenario,
  SensitivityResult,
  StrategyComparisonResult,
} from "@/pages/fire-planner/types";
import { invoke } from "./core";

const STORAGE_KEY = "fire_planner_settings";

export const getFireSettings = async (): Promise<FireSettings | null> => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FireSettings;
  } catch {
    return null;
  }
};

export const saveFireSettings = async (settings: FireSettings): Promise<void> => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
  nSims = 100_000,
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
  return invoke<ScenarioResult[]>("run_fire_scenario_analysis", {
    settings,
    currentPortfolio,
  });
};

export const runFireSorr = async (
  settings: FireSettings,
  portfolioAtFire: number,
  retirementStartAge: number,
): Promise<SorrScenario[]> => {
  return invoke<SorrScenario[]>("run_fire_sorr", {
    settings,
    portfolioAtFire,
    retirementStartAge,
  });
};

export const runFireSensitivity = async (
  settings: FireSettings,
  currentPortfolio: number,
): Promise<SensitivityResult> => {
  return invoke<SensitivityResult>("run_fire_sensitivity", {
    settings,
    currentPortfolio,
  });
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
