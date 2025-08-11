import type { ActivityDetails } from '@wealthfolio/addon-sdk';

export interface FeeSummary {
  period: 'TOTAL' | 'YTD' | 'LAST_YEAR';
  totalFees: number;
  currency: string;
  monthlyAverage: number;
  yoyGrowth: number | null;
  byType: Record<string, number>;
  byAccount: Record<string, number>;
  byAsset: Record<string, number>;
  byMonth: Record<string, number>;
  byCurrency: Record<string, number>;
}

export interface FeeAnalytics {
  // Fee efficiency metrics
  averageFeePerTransaction: number;
  feeAsPercentageOfPortfolio: number;
  highestFeeTransaction: {
    id: string;
    assetSymbol: string;
    fee: number;
    date: string;
    activityType: string;
  } | null;
  
  // Fee trends
  feesByCategory: Array<{
    category: string;
    amount: number;
    percentage: number;
    transactions: number;
  }>;
  
  // Cost efficiency by asset
  assetFeeAnalysis: Array<{
    assetSymbol: string;
    assetName: string;
    totalFees: number;
    transactionCount: number;
    averageFeePerTransaction: number;
    totalVolume: number;
    feeAsPercentageOfVolume: number;
  }>;
  
  // Account fee comparison
  accountFeeAnalysis: Array<{
    accountName: string;
    totalFees: number;
    transactionCount: number;
    averageFeePerTransaction: number;
    feeAsPercentageOfAccountValue: number;
  }>;
  
  // Fee impact on returns
  feeImpactAnalysis: {
    totalFeesYTD: number;
    estimatedAnnualFees: number;
    potentialReturnLoss: number; // Based on average market return
  };
}

// Helper function to safely convert string numbers to actual numbers
function safeParseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? 0 : parsed;
}

interface FeeCalculationParams {
  activities: ActivityDetails[];
  period: 'TOTAL' | 'YTD' | 'LAST_YEAR';
  baseCurrency: string;
}

export function calculateFeeSummary({ activities, period, baseCurrency }: FeeCalculationParams): FeeSummary {
  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;

  // Filter activities by period
  const filteredActivities = activities.filter((activity) => {
    const activityDate = new Date(activity.date);
    const activityYear = activityDate.getFullYear();

    switch (period) {
      case 'YTD':
        return activityYear === currentYear;
      case 'LAST_YEAR':
        return activityYear === lastYear;
      case 'TOTAL':
      default:
        return true;
    }
  });

  // Extract all fees from activities
  const feeActivities = filteredActivities.filter((activity) => {
    const fee = safeParseNumber(activity.fee);
    const amount = safeParseNumber(activity.amount);
    
    // Include dedicated FEE activities and transaction fees from other activities
    return activity.activityType === 'FEE' || fee > 0;
  });

  // Calculate totals
  let totalFees = 0;
  const byType: Record<string, number> = {};
  const byAccount: Record<string, number> = {};
  const byAsset: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const byCurrency: Record<string, number> = {};

  feeActivities.forEach((activity) => {
    const activityDate = new Date(activity.date);
    const monthKey = `${activityDate.getFullYear()}-${String(activityDate.getMonth() + 1).padStart(2, '0')}`;
    
    // For FEE activities, use the full amount; for others, use the fee field
    const feeAmount = activity.activityType === 'FEE' 
      ? safeParseNumber(activity.amount)
      : safeParseNumber(activity.fee);
    
    totalFees += feeAmount;

    // Group by fee type - use the same categorization as Fee Categories
    let feeType: string;
    switch (activity.activityType) {
      case 'FEE':
        feeType = 'Management Fees';
        break;
      case 'BUY':
      case 'SELL':
        feeType = 'Trading Fees';
        break;
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT':
        feeType = 'Transfer Fees';
        break;
      default:
        feeType = 'Other Fees';
    }
    byType[feeType] = (byType[feeType] || 0) + feeAmount;

    // Group by account
    const accountKey = activity.accountName || 'Unknown Account';
    byAccount[accountKey] = (byAccount[accountKey] || 0) + feeAmount;

    // Group by asset (for transaction fees)
    if (activity.activityType !== 'FEE') {
      const assetKey = activity.assetSymbol || 'Unknown Asset';
      byAsset[assetKey] = (byAsset[assetKey] || 0) + feeAmount;
    }

    // Group by month
    byMonth[monthKey] = (byMonth[monthKey] || 0) + feeAmount;

    // Group by currency
    const currency = activity.currency || baseCurrency;
    byCurrency[currency] = (byCurrency[currency] || 0) + feeAmount;
  });

  // Calculate monthly average
  const monthsInPeriod = Object.keys(byMonth).length || 1;
  const monthlyAverage = totalFees / monthsInPeriod;

  // Calculate year-over-year growth (simplified)
  let yoyGrowth: number | null = null;
  if (period === 'YTD' || period === 'LAST_YEAR') {
    // This would need more sophisticated calculation with previous period data
    yoyGrowth = 0; // Placeholder
  }

  return {
    period,
    totalFees,
    currency: baseCurrency,
    monthlyAverage,
    yoyGrowth,
    byType,
    byAccount,
    byAsset,
    byMonth,
    byCurrency,
  };
}

interface FeeAnalyticsParams {
  activities: ActivityDetails[];
  portfolioValue: number;
}

export function calculateFeeAnalytics({ activities, portfolioValue }: FeeAnalyticsParams): FeeAnalytics {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Filter to current year for YTD calculations
  const ytdActivities = activities.filter(activity => 
    new Date(activity.date).getFullYear() === currentYear
  );

  // Get all fee-related activities
  const feeActivities = activities.filter(activity => {
    const fee = safeParseNumber(activity.fee);
    return activity.activityType === 'FEE' || fee > 0;
  });

  const ytdFeeActivities = ytdActivities.filter(activity => {
    const fee = safeParseNumber(activity.fee);
    return activity.activityType === 'FEE' || fee > 0;
  });

  // Calculate basic metrics
  const totalFees = feeActivities.reduce((sum, activity) => {
    const feeAmount = activity.activityType === 'FEE' 
      ? safeParseNumber(activity.amount)
      : safeParseNumber(activity.fee);
    return sum + feeAmount;
  }, 0);

  const totalTransactions = feeActivities.length;
  const averageFeePerTransaction = totalTransactions > 0 ? totalFees / totalTransactions : 0;
  const feeAsPercentageOfPortfolio = portfolioValue > 0 ? (totalFees / portfolioValue) * 100 : 0;

  // Find highest fee transaction
  let highestFeeTransaction: FeeAnalytics['highestFeeTransaction'] = null;
  let highestFee = 0;

  feeActivities.forEach(activity => {
    const fee = activity.activityType === 'FEE' 
      ? safeParseNumber(activity.amount)
      : safeParseNumber(activity.fee);
    
    if (fee > highestFee) {
      highestFee = fee;
      highestFeeTransaction = {
        id: activity.id,
        assetSymbol: activity.assetSymbol,
        fee,
        date: activity.date.toString(),
        activityType: activity.activityType,
      };
    }
  });

  // Categorize fees
  const feeCategories = new Map<string, { amount: number; transactions: number }>();
  
  feeActivities.forEach(activity => {
    const fee = activity.activityType === 'FEE' 
      ? safeParseNumber(activity.amount)
      : safeParseNumber(activity.fee);
    
    let category: string;
    
    switch (activity.activityType) {
      case 'BUY':
      case 'SELL':
        category = 'Trading Fees';
        break;
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT':
        category = 'Transfer Fees';
        break;
      default:
        category = 'Other Fees';
    }
    
    const existing = feeCategories.get(category) || { amount: 0, transactions: 0 };
    feeCategories.set(category, {
      amount: existing.amount + fee,
      transactions: existing.transactions + 1,
    });
  });

  const feesByCategory = Array.from(feeCategories.entries()).map(([category, data]) => ({
    category,
    amount: data.amount,
    percentage: totalFees > 0 ? (data.amount / totalFees) * 100 : 0,
    transactions: data.transactions,
  }));

  // Asset fee analysis
  const assetFeeMap = new Map<string, {
    fees: number;
    transactions: number;
    volume: number;
    name: string;
  }>();

  activities.forEach(activity => {
    if (activity.activityType === 'FEE') return; // Skip dedicated fee activities
    
    const fee = safeParseNumber(activity.fee);
    const amount = safeParseNumber(activity.amount);
    const quantity = safeParseNumber(activity.quantity);
    const unitPrice = safeParseNumber(activity.unitPrice);
    
    // Calculate volume based on available data
    const volume = amount > 0 ? amount : Math.abs(quantity * unitPrice);
    
    const symbol = activity.assetSymbol;
    const name = activity.assetName || symbol;
    
    if (fee > 0 || volume > 0) {
      const existing = assetFeeMap.get(symbol) || { 
        fees: 0, 
        transactions: 0, 
        volume: 0, 
        name 
      };
      
      assetFeeMap.set(symbol, {
        fees: existing.fees + fee,
        transactions: existing.transactions + (fee > 0 ? 1 : 0),
        volume: existing.volume + volume,
        name: existing.name,
      });
    }
  });

  const assetFeeAnalysis = Array.from(assetFeeMap.entries())
    .filter(([, data]) => data.fees > 0)
    .map(([symbol, data]) => ({
      assetSymbol: symbol,
      assetName: data.name,
      totalFees: data.fees,
      transactionCount: data.transactions,
      averageFeePerTransaction: data.transactions > 0 ? data.fees / data.transactions : 0,
      totalVolume: data.volume,
      feeAsPercentageOfVolume: data.volume > 0 ? (data.fees / data.volume) * 100 : 0,
    }))
    .sort((a, b) => b.totalFees - a.totalFees);

  // Account fee analysis
  const accountFeeMap = new Map<string, {
    fees: number;
    transactions: number;
  }>();

  feeActivities.forEach(activity => {
    const fee = activity.activityType === 'FEE' 
      ? safeParseNumber(activity.amount)
      : safeParseNumber(activity.fee);
    const accountName = activity.accountName;
    
    const existing = accountFeeMap.get(accountName) || { fees: 0, transactions: 0 };
    accountFeeMap.set(accountName, {
      fees: existing.fees + fee,
      transactions: existing.transactions + 1,
    });
  });

  const accountFeeAnalysis = Array.from(accountFeeMap.entries())
    .map(([accountName, data]) => ({
      accountName,
      totalFees: data.fees,
      transactionCount: data.transactions,
      averageFeePerTransaction: data.transactions > 0 ? data.fees / data.transactions : 0,
      feeAsPercentageOfAccountValue: 0, // Would need account values to calculate
    }))
    .sort((a, b) => b.totalFees - a.totalFees);

  // Fee impact analysis
  const totalFeesYTD = ytdFeeActivities.reduce((sum, activity) => {
    const feeAmount = activity.activityType === 'FEE' 
      ? safeParseNumber(activity.amount)
      : safeParseNumber(activity.fee);
    return sum + feeAmount;
  }, 0);

  const monthsElapsed = now.getMonth() + 1;
  const estimatedAnnualFees = monthsElapsed > 0 ? (totalFeesYTD / monthsElapsed) * 12 : 0;
  
  // Assume 7% average market return for potential return loss calculation
  const potentialReturnLoss = estimatedAnnualFees * 0.07;

  return {
    averageFeePerTransaction,
    feeAsPercentageOfPortfolio,
    highestFeeTransaction,
    feesByCategory,
    assetFeeAnalysis,
    accountFeeAnalysis,
    feeImpactAnalysis: {
      totalFeesYTD,
      estimatedAnnualFees,
      potentialReturnLoss,
    },
  };
}
