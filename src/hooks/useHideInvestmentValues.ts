import { useHideInvestmentValues as useHideCtx } from '@/context/hideInvestmentValuesProvider';

export function useHideInvestmentValues() {
  return useHideCtx();
}