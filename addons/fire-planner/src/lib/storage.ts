import type { AddonContext } from "@wealthfolio/addon-sdk";
import type { FireSettings } from "../types";

const SETTINGS_KEY = "fire-planner-settings";

export const DEFAULT_SETTINGS: FireSettings = {
  monthlyExpensesAtFire: 3000,
  safeWithdrawalRate: 0.035,
  withdrawalStrategy: "constant-dollar",
  expectedAnnualReturn: 0.07,
  expectedReturnStdDev: 0.12,
  inflationRate: 0.02,
  currentAge: 30,
  targetFireAge: 50,
  monthlyContribution: 1000,
  contributionGrowthRate: 0.02,
  planningHorizonAge: 90,
  additionalIncomeStreams: [],
  targetAllocations: {},
  currency: "USD",
};

export async function loadSettings(ctx: AddonContext): Promise<FireSettings> {
  try {
    const raw = await ctx.api.secrets.get(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(ctx: AddonContext, settings: FireSettings): Promise<void> {
  await ctx.api.secrets.set(SETTINGS_KEY, JSON.stringify(settings));
}
