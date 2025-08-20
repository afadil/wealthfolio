import { useMemo } from 'react';
import { useHoldings } from './use-holdings';
import { type AddonContext } from '@wealthfolio/addon-sdk';

interface UseInvestmentMetricsOptions {
  accountId: string;
  ctx: AddonContext;
  targetAmount: number;
  stepSize: number;
}

export function useInvestmentMetrics({ 
  accountId, 
  ctx, 
  targetAmount, 
  stepSize 
}: UseInvestmentMetricsOptions) {
  const { data: holdings, isLoading, error } = useHoldings({ accountId, ctx });

  const metrics = useMemo(() => {
    const currentAmount = holdings?.reduce((acc: number, holding: any) => {
      return acc + (holding.marketValue?.base || 0);
    }, 0) ?? 0;

    const progressPercent = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
    const totalSteps = Math.ceil(targetAmount / stepSize);
    const completedSteps = Math.floor(currentAmount / stepSize);
    const partialStep = currentAmount % stepSize;
    const partialPercent = partialStep > 0 ? (partialStep / stepSize) * 100 : 0;
    const remainingAmount = Math.max(0, targetAmount - currentAmount);

    return {
      currentAmount,
      targetAmount,
      progressPercent,
      totalSteps,
      completedSteps,
      partialStep,
      partialPercent,
      remainingAmount,
      stepSize,
      isTargetReached: currentAmount >= targetAmount,
    };
  }, [holdings, targetAmount, stepSize]);

  return {
    ...metrics,
    isLoading,
    error,
  };
}
