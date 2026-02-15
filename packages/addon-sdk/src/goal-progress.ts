import type { Goal, GoalAllocation, AccountValuation, GoalProgress } from './data-types';

/**
 * Calculate goal progress using allocations.
 * Converts account values to base currency, applies percent allocation per account,
 * and computes progress ratio (0–1+) against target amount.
 */
export function calculateGoalProgress(
  accountsValuations: AccountValuation[],
  goals: Goal[],
  allocations: GoalAllocation[],
): GoalProgress[] {
  if (!accountsValuations || accountsValuations.length === 0 || !goals || !allocations) {
    return [];
  }

  const baseCurrency = accountsValuations[0].baseCurrency ?? 'USD';

  // accountId -> totalValue in base currency
  const accountValueMap = new Map<string, number>();
  accountsValuations.forEach((account) => {
    const valueInBaseCurrency = (account.totalValue ?? 0) * (account.fxRateToBase ?? 1);
    accountValueMap.set(account.accountId, valueInBaseCurrency);
  });

  // goalId -> allocations
  const allocationsByGoal = new Map<string, GoalAllocation[]>();
  allocations.forEach((alloc) => {
    const existing = allocationsByGoal.get(alloc.goalId) ?? [];
    allocationsByGoal.set(alloc.goalId, [...existing, alloc]);
  });

  const sortedGoals = [...goals].sort((a, b) => a.targetAmount - b.targetAmount);

  return sortedGoals.map((goal) => {
    const goalAllocations = allocationsByGoal.get(goal.id) ?? [];

    const totalAllocatedValue = goalAllocations.reduce((total, allocation) => {
      const accountValueInBase = accountValueMap.get(allocation.accountId) ?? 0;
      return total + (accountValueInBase * allocation.percentAllocation) / 100;
    }, 0);

    const progress = goal.targetAmount > 0 ? totalAllocatedValue / goal.targetAmount : 0;

    return {
      name: goal.title,
      targetValue: goal.targetAmount,
      currentValue: totalAllocatedValue,
      progress,
      currency: baseCurrency,
    };
  });
}
