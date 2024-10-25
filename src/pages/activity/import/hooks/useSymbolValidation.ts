import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QuoteSummary } from '@/lib/types';

// Fake implementation for symbol validation
const validateSymbol = async (symbol: string): Promise<boolean> => {
  // Simulate an API call to validate the symbol
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(symbol.length > 10 && symbol !== 'INVALID');
    }, 500);
  });
};

export function useSymbolValidation(symbols: string[]) {
  const [invalidSymbols, setInvalidSymbols] = useState<string[]>([]);

  const { data, isLoading } = useQuery<string[], Error>({
    queryKey: ['validate-symbols', symbols],
    queryFn: async () => {
      const results = await Promise.all(symbols.map(validateSymbol));
      return symbols.filter((_, index) => !results[index]);
    },
    enabled: symbols.length > 0,
  });

  useEffect(() => {
    if (data) {
      setInvalidSymbols(data);
    }
  }, [data]);

  return { invalidSymbols, isLoading };
}
