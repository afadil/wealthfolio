import { useMemo } from 'react';
import { AccountValuation } from '@/lib/types'; // Use only AccountValuation

// Define a common structure based on AccountValuation
type ValuationDataBase = Pick<AccountValuation, 'valuationDate' | 'totalValue' | 'netContribution'>;
interface ValuationData extends ValuationDataBase {
    calculatedAt?: string;
    // Add properties that might exist on AccountValuation from different sources
    baseCurrency?: string; 
    accountCurrency?: string; 
}

interface DerivedMetrics {
  gainLossAmount: number;
  simpleReturn: number;
  currentValuation: ValuationData | null;
}

export function useDerivedValuationMetrics(valuationHistory: ValuationData[] | undefined | null): DerivedMetrics {
  return useMemo(() => {
    if (!valuationHistory || valuationHistory.length === 0) {
      return {
        gainLossAmount: 0,
        simpleReturn: 0,
        currentValuation: null,
      };
    }
    
    const lastValue = valuationHistory[valuationHistory.length - 1];

    // If only one data point, return 0 gain/loss and the single point as current valuation
    if (valuationHistory.length < 2) {
      return {
        gainLossAmount: 0,
        simpleReturn: 0,
        currentValuation: lastValue || null,
      };
    }

    const firstValue = valuationHistory[0];

    // Ensure values are numbers before calculation
    const startValue = firstValue.totalValue ?? 0;
    const endValue = lastValue.totalValue ?? 0;
    const startContribution = firstValue.netContribution ?? 0;
    const endContribution = lastValue.netContribution ?? 0;

    const changeInContributions = endContribution - startContribution;
    const calculatedGainLossAmount = endValue - startValue - changeInContributions;

    let calculatedSimpleReturn = 0;
    // Avoid division by zero or NaN
    if (startValue !== 0 && !isNaN(startValue)) {
      calculatedSimpleReturn = calculatedGainLossAmount / startValue;
    }

    return {
      gainLossAmount: calculatedGainLossAmount,
      simpleReturn: calculatedSimpleReturn,
      currentValuation: lastValue,
    };
  }, [valuationHistory]);
} 