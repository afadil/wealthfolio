import { AccountSummary, Goal, GoalAllocation, GoalProgress, PortfolioHistory } from './types';

export function calculateGoalProgress(
  accounts: AccountSummary[],
  goals: Goal[],
  allocations: GoalAllocation[],
): GoalProgress[] {
  // Extract base currency from the first account's performance, or default to 'USD'
  const baseCurrency = accounts[0]?.performance?.baseCurrency || 'USD';

  // Create a map of accountId to marketValue for quick lookup
  const accountValueMap = new Map<string, number>();
  accounts.forEach((account) => {
    accountValueMap.set(
      account.account.id,
      account?.performance?.totalValue * (account?.performance?.exchangeRate || 1),
    );
  });

  // Sort goals by targetValue
  goals.sort((a, b) => a.targetAmount - b.targetAmount);

  return goals.map((goal) => {
    const goalAllocations = allocations.filter((allocation) => allocation.goalId === goal.id) || [];
    const totalAllocatedValue = goalAllocations.reduce((total, allocation) => {
      const accountValue = accountValueMap.get(allocation.accountId) || 0;
      const allocatedValue = (accountValue * allocation.percentAllocation) / 100;
      return total + allocatedValue;
    }, 0);

    // Calculate progress
    const progress = goal.targetAmount > 0 ? (totalAllocatedValue / goal.targetAmount) * 100 : 0;

    return {
      name: goal.title,
      targetValue: goal.targetAmount,
      currentValue: totalAllocatedValue,
      progress: progress,
      currency: baseCurrency,
    };
  });
}

export function getValuesForInterval(
  history: PortfolioHistory[],
  interval: '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL',
): { startValue: PortfolioHistory; endValue: PortfolioHistory; twr: number } | undefined {
  if (history.length === 0) return undefined;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let startDate: Date;

  switch (interval) {
    case '1D':
      startDate = new Date(now.setDate(now.getDate() - 1));
      break;
    case '1W':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case '1M':
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case '3M':
      startDate = new Date(now.setMonth(now.getMonth() - 3));
      break;
    case '1Y':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    case 'ALL':
    default:
      startDate = new Date(0); // Earliest possible date
  }

  startDate.setHours(0, 0, 0, 0);

  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const relevantHistory = sortedHistory.filter((item) => new Date(item.date) >= startDate);
  const startValue = relevantHistory[0] || sortedHistory[0];
  const endValue = relevantHistory[relevantHistory.length - 1];

  // Calculate TWR
  let twr = 1;
  for (let i = 1; i < relevantHistory.length; i++) {
    const prev = relevantHistory[i - 1];
    const curr = relevantHistory[i];
    const subperiodReturn = (curr.totalValue - curr.netDeposit + prev.netDeposit) / prev.totalValue;
    twr *= subperiodReturn;
  }
  twr = (twr - 1) * 100; // Convert to percentage

  return { startValue, endValue, twr };
}
