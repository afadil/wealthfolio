// import type { Account, Asset } from '@/generated/client';

import {
  AccountTotal,
  FinancialHistory,
  Goal,
  GoalAllocation,
  GoalProgress,
  Holding,
} from './types';

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

export const formatAccountsData = (
  data: FinancialHistory[],
  baseCurrency: String = 'USD',
): AccountTotal[] | undefined => {
  return data
    ?.filter((history) => history.account?.id !== 'TOTAL')
    .map((history) => {
      const todayValue = history.history[history.history.length - 1];
      return {
        id: history.account?.id || '',
        name: history.account?.name || '',
        group: history.account?.group || '',
        currency: history.account?.currency || '',
        marketValue: todayValue?.marketValue || 0,
        cashBalance: todayValue?.availableCash || 0,
        totalGainAmount: todayValue?.totalGainValue || 0,
        totalGainPercent: todayValue?.totalGainPercentage || 0,
        totalValue: todayValue?.marketValue + todayValue?.availableCash,
        totalValueConverted:
          (todayValue?.marketValue + todayValue?.availableCash) * (todayValue?.exchangeRate || 1),
        marketValueConverted: todayValue?.marketValue * (todayValue?.exchangeRate || 1) || 0,
        cashBalanceConverted: todayValue?.availableCash * (todayValue?.exchangeRate || 1) || 0,
        bookValueConverted: todayValue?.bookCost * (todayValue?.exchangeRate || 1) || 0,
        baseCurrency: baseCurrency,
      } as AccountTotal;
    });
};

export function calculateGoalProgress(
  accounts: AccountTotal[],
  goals: Goal[],
  allocations: GoalAllocation[],
): GoalProgress[] {
  // Create a map of accountId to marketValue for quick lookup
  const accountValueMap = new Map<string, number>();
  accounts.forEach((account) => {
    accountValueMap.set(account.id, account.totalValueConverted);
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
      currency: accounts[0]?.baseCurrency || 'USD',
    };
  });
}
