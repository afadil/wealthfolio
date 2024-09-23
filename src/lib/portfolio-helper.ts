// import type { Account, Asset } from '@/generated/client';

import { AccountSummary, Goal, GoalAllocation, GoalProgress, Holding } from './types';

export function aggregateHoldingsBySymbol(holdings: Holding[]): Holding[] {
  const aggregated: Record<string, Holding> = {};
  let totalMarketValue = 0;

  for (const holding of holdings) {
    const symbol = holding.symbol;

    if (!aggregated[symbol]) {
      aggregated[symbol] = { ...holding };
    } else {
      aggregated[symbol].quantity += holding.quantity;
      aggregated[symbol].marketValue = aggregated[symbol].quantity * (holding.marketPrice || 0);
      aggregated[symbol].bookValue += holding.bookValue;
      aggregated[symbol].marketValueConverted = holding.marketValueConverted;
      aggregated[symbol].bookValueConverted = holding.bookValueConverted;
      aggregated[symbol].averageCost =
        aggregated[symbol].bookValue / (aggregated[symbol].quantity || 1);

      const totalGainAmount = aggregated[symbol].marketValue - aggregated[symbol].bookValue;
      const totalGainAmountConverted =
        aggregated[symbol].marketValueConverted - aggregated[symbol].bookValueConverted;
      aggregated[symbol].performance.totalGainPercent =
        (aggregated[symbol].marketValue - aggregated[symbol].bookValue) /
        aggregated[symbol].bookValue;
      aggregated[symbol].performance.totalGainAmount = totalGainAmount;
      aggregated[symbol].performance.totalGainAmountConverted = totalGainAmountConverted;
      aggregated[symbol].performance.dayGainPercent = holding.performance.dayGainPercent;
      aggregated[symbol].performance.dayGainAmount =
        (holding.performance.dayGainPercent || 0) * aggregated[symbol].marketValue;
      aggregated[symbol].performance.dayGainAmountConverted =
        holding.performance.dayGainAmountConverted;
    }

    totalMarketValue += aggregated[symbol].marketValue;
  }

  // calculate holding percent in the portfolio
  const result = Object.values(aggregated).map((holding) => {
    holding.portfolioPercent = (holding.marketValue / totalMarketValue) * 100;
    return holding;
  });

  return result;
}

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
