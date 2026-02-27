export interface DividendSuggestion {
  id: string;
  symbol: string;
  date: string; // YYYY-MM-DD
  shares: number;
  dividendPerShare: number;
  amount: number;
  currency: string;
  accountId: string;
  availableAccountIds: string[];
}
