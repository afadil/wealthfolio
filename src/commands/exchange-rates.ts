import type { ExchangeRate } from '@/lib/types';

// Mock data
let mockExchangeRates: ExchangeRate[] = [
  { id: 1, fromCurrency: 'USD', toCurrency: 'EUR', rate: 0.85, source: 'MANUAL' },
  { id: 2, fromCurrency: 'EUR', toCurrency: 'GBP', rate: 0.88, source: 'MANUAL' },
  { id: 3, fromCurrency: 'GBP', toCurrency: 'JPY', rate: 150.2, source: 'YAHOO' },
];

export const getExchangeRates = async (): Promise<ExchangeRate[]> => {
  return Promise.resolve(mockExchangeRates);
};

export const updateExchangeRate = async (updatedRate: ExchangeRate): Promise<ExchangeRate> => {
  const index = mockExchangeRates.findIndex((rate) => rate.id === updatedRate.id);
  if (index !== -1) {
    mockExchangeRates[index] = updatedRate;
    return Promise.resolve(updatedRate);
  }
  throw new Error('Exchange rate not found');
};

export const addExchangeRate = async (newRate: Omit<ExchangeRate, 'id'>): Promise<ExchangeRate> => {
  const id = Math.max(...mockExchangeRates.map((rate) => rate.id)) + 1;
  const addedRate = { ...newRate, id };
  mockExchangeRates.push(addedRate);
  return Promise.resolve(addedRate);
};

export const deleteExchangeRate = async (id: number): Promise<void> => {
  const index = mockExchangeRates.findIndex((rate) => rate.id === id);
  if (index !== -1) {
    mockExchangeRates.splice(index, 1);
    return Promise.resolve();
  }
  throw new Error('Exchange rate not found');
};
