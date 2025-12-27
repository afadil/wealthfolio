import { GoalWithContributions, GoalProgress } from "./types";

export function calculateGoalProgressFromContributions(
  goalsWithContributions: GoalWithContributions[],
  baseCurrency: string = "USD",
): GoalProgress[] {
  if (!goalsWithContributions || goalsWithContributions.length === 0) {
    return [];
  }

  // Create a sorted copy of goals to avoid mutating the original array
  const sortedGoals = [...goalsWithContributions].sort(
    (a, b) => a.goal.targetAmount - b.goal.targetAmount,
  );

  // Calculate progress for each goal
  return sortedGoals.map((gwc) => {
    return {
      name: gwc.goal.title,
      targetValue: gwc.goal.targetAmount,
      currentValue: gwc.totalContributed,
      progress: gwc.progress,
      currency: baseCurrency,
      hasAtRiskContributions: gwc.hasAtRiskContributions,
    };
  });
}
