import type {
  FireSettings,
  FireProjection,
  MonteCarloResult,
  ScenarioResult,
  SorrScenario,
  SensitivityResult,
  StrategyComparisonResult,
} from "@/pages/fire-planner/types";
import {
  projectFireDate,
  runMonteCarlo,
  runScenarioAnalysis,
  runSequenceOfReturnsRisk,
  runSensitivityAnalysis,
  runStrategyComparison,
} from "@/pages/fire-planner/lib/fire-math";

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
  return projectFireDate(settings, currentPortfolio);
};

const WEB_MAX_SIMS = 10_000;

export const runFireMonteCarlo = async (
  settings: FireSettings,
  currentPortfolio: number,
  nSims = WEB_MAX_SIMS,
): Promise<MonteCarloResult> => {
  return runMonteCarlo(settings, currentPortfolio, Math.min(nSims, WEB_MAX_SIMS));
};

export const runFireScenarioAnalysis = async (
  settings: FireSettings,
  currentPortfolio: number,
): Promise<ScenarioResult[]> => {
  return runScenarioAnalysis(settings, currentPortfolio);
};

export const runFireSorr = async (
  settings: FireSettings,
  portfolioAtFire: number,
  retirementStartAge: number,
): Promise<SorrScenario[]> => {
  return runSequenceOfReturnsRisk(settings, portfolioAtFire, retirementStartAge);
};

export const runFireSensitivity = async (
  settings: FireSettings,
  currentPortfolio: number,
): Promise<SensitivityResult> => {
  return runSensitivityAnalysis(settings, currentPortfolio);
};

export const runFireStrategyComparison = async (
  settings: FireSettings,
  currentPortfolio: number,
  nSims = 5_000,
): Promise<StrategyComparisonResult> => {
  return runStrategyComparison(settings, currentPortfolio, nSims);
};
