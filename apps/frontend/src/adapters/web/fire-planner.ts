// FIRE planner is a desktop-only feature in v1. These stubs ensure web builds resolve
// the module without errors and give clear messaging at runtime.
import type {
  FireSettings,
  FireProjection,
  MonteCarloResult,
  ScenarioResult,
  SorrScenario,
  SensitivityResult,
  StrategyComparisonResult,
} from "@/pages/fire-planner/types";

const DESKTOP_ONLY = "FIRE planner requires the desktop app";

export const getFireSettings = async (): Promise<FireSettings | null> => {
  throw new Error(DESKTOP_ONLY);
};

export const saveFireSettings = async (_settings: FireSettings): Promise<void> => {
  throw new Error(DESKTOP_ONLY);
};

export const calculateFireProjection = async (
  _settings: FireSettings,
  _currentPortfolio: number,
): Promise<FireProjection> => {
  throw new Error(DESKTOP_ONLY);
};

export const runFireMonteCarlo = async (
  _settings: FireSettings,
  _currentPortfolio: number,
  _nSims?: number,
): Promise<MonteCarloResult> => {
  throw new Error(DESKTOP_ONLY);
};

export const runFireScenarioAnalysis = async (
  _settings: FireSettings,
  _currentPortfolio: number,
): Promise<ScenarioResult[]> => {
  throw new Error(DESKTOP_ONLY);
};

export const runFireSorr = async (
  _settings: FireSettings,
  _portfolioAtFire: number,
): Promise<SorrScenario[]> => {
  throw new Error(DESKTOP_ONLY);
};

export const runFireSensitivity = async (
  _settings: FireSettings,
  _currentPortfolio: number,
): Promise<SensitivityResult> => {
  throw new Error(DESKTOP_ONLY);
};

export const runFireStrategyComparison = async (
  _settings: FireSettings,
  _currentPortfolio: number,
  _nSims?: number,
): Promise<StrategyComparisonResult> => {
  throw new Error(DESKTOP_ONLY);
};
