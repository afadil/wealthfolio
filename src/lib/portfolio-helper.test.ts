import { calculateGoalProgress } from './portfolio-helper';
import { AccountValuation, Goal, GoalAllocation, SimplePerformanceMetrics } from './types';

function performanceToValuations(metrics: SimplePerformanceMetrics[]): AccountValuation[] {
  let base_date = new Date();
  return metrics.map((pm: SimplePerformanceMetrics, idx: number): AccountValuation => {
    let new_date = new Date();
    new_date.setDate(base_date.getDate() + idx);
    return {
      id: `${pm.accountId}-${idx}`,
      accountId: pm.accountId,
      totalValue: pm.totalValue ?? 0,
      baseCurrency: pm.baseCurrency ?? 'USD',
      fxRateToBase: pm.fxRateToBase ?? 1,
      valuationDate: new_date.toISOString(),
      accountCurrency: 'USD',
      cashBalance: pm.totalValue ?? 0,
      investmentMarketValue: 0,
      costBasis: 0,
      netContribution: pm.totalValue ?? 0,
      calculatedAt: new_date.toISOString(),
    };
  });
}

describe('calculateGoalProgress', () => {
  it('should return empty array if essential data is missing', () => {
    expect(calculateGoalProgress([], [], [])).toEqual([]);
    expect(calculateGoalProgress(undefined as any, [], [])).toEqual([]);
    expect(calculateGoalProgress([], undefined as any, [])).toEqual([]);
    expect(calculateGoalProgress([], [], undefined as any)).toEqual([]);
  });

  it('should calculate goal progress correctly as a decimal ratio and handle various scenarios', () => {
    const accountsPerformance: AccountValuation[] = performanceToValuations([
      { accountId: 'acc1', totalValue: 5000, baseCurrency: 'USD', fxRateToBase: 1 },
      { accountId: 'acc2', totalValue: 10000, baseCurrency: 'EUR', fxRateToBase: 1.1 }, // 11000 USD
      { accountId: 'acc3', totalValue: 2000, baseCurrency: 'USD', fxRateToBase: 1 },
    ]);

    const goals: Goal[] = [
      { id: 'goal1', title: 'Vacation Fund', targetAmount: 10000 },
      { id: 'goal2', title: 'New Car', targetAmount: 25000 },
      { id: 'goal3', title: 'Zero Target Goal', targetAmount: 0 },
      { id: 'goal4', title: 'High Progress Goal', targetAmount: 100 },
    ];

    const allocations: GoalAllocation[] = [
      // Goal 1: Vacation Fund (Target: 10,000 USD)
      { id: 'alloc1', goalId: 'goal1', accountId: 'acc1', percentAllocation: 50 }, // 50% of 5000 USD = 2500 USD
      { id: 'alloc2', goalId: 'goal1', accountId: 'acc2', percentAllocation: 10 }, // 10% of 11000 USD (EUR converted) = 1100 USD
      // Total for goal1 = 2500 + 1100 = 3600 USD. Progress = 3600 / 10000 = 0.36

      // Goal 2: New Car (Target: 25,000 USD)
      { id: 'alloc3', goalId: 'goal2', accountId: 'acc1', percentAllocation: 20.8 }, // 20.8% of 5000 USD = 1040 USD
      // Total for goal2 = 1040 USD. Progress = 1040 / 25000 = 0.0416

      // Goal 4: High Progress Goal (Target: 100 USD)
      { id: 'alloc4', goalId: 'goal4', accountId: 'acc3', percentAllocation: 100 }, // 100% of 2000 USD = 2000 USD
      // Total for goal4 = 2000 USD. Progress = 2000 / 100 = 20 (i.e. 2000%)
    ];

    const result = calculateGoalProgress(accountsPerformance, goals, allocations);

    // Goals are sorted by targetAmount in the function
    const expectedOrder = ['Zero Target Goal', 'High Progress Goal', 'Vacation Fund', 'New Car'];
    result.forEach((res, index) => {
      expect(res.name).toBe(expectedOrder[index]);
    });

    const vacationFundProgress = result.find((g) => g.name === 'Vacation Fund');
    expect(vacationFundProgress).toBeDefined();
    if (vacationFundProgress) {
      expect(vacationFundProgress.name).toBe('Vacation Fund');
      expect(vacationFundProgress.targetValue).toBe(10000);
      expect(vacationFundProgress.currentValue).toBeCloseTo(3600);
      expect(vacationFundProgress.progress).toBeCloseTo(0.36); // 3600 / 10000
      expect(vacationFundProgress.currency).toBe('USD');
    }

    const newCarProgress = result.find((g) => g.name === 'New Car');
    expect(newCarProgress).toBeDefined();
    if (newCarProgress) {
      expect(newCarProgress.name).toBe('New Car');
      expect(newCarProgress.targetValue).toBe(25000);
      expect(newCarProgress.currentValue).toBeCloseTo(1040); // 5000 * 0.208
      expect(newCarProgress.progress).toBeCloseTo(0.0416); // 1040 / 25000
      expect(newCarProgress.currency).toBe('USD');
    }

    const zeroTargetGoalProgress = result.find((g) => g.name === 'Zero Target Goal');
    expect(zeroTargetGoalProgress).toBeDefined();
    if (zeroTargetGoalProgress) {
      expect(zeroTargetGoalProgress.name).toBe('Zero Target Goal');
      expect(zeroTargetGoalProgress.targetValue).toBe(0);
      expect(zeroTargetGoalProgress.currentValue).toBeCloseTo(0); // No allocations for this goal in sample data
      expect(zeroTargetGoalProgress.progress).toBe(0); // Target is 0, so progress is 0
      expect(zeroTargetGoalProgress.currency).toBe('USD');
    }

    const highProgressGoal = result.find((g) => g.name === 'High Progress Goal');
    expect(highProgressGoal).toBeDefined();
    if (highProgressGoal) {
      expect(highProgressGoal.name).toBe('High Progress Goal');
      expect(highProgressGoal.targetValue).toBe(100);
      expect(highProgressGoal.currentValue).toBeCloseTo(2000);
      expect(highProgressGoal.progress).toBeCloseTo(20); // 2000 / 100
      expect(highProgressGoal.currency).toBe('USD');
    }
  });

  it('should return empty progress for goals with no allocations', () => {
    const accountsPerformance: AccountValuation[] = performanceToValuations([
      { accountId: 'acc1', totalValue: 1000, baseCurrency: 'USD', fxRateToBase: 1 },
    ]);
    const goals: Goal[] = [{ id: 'goal1', title: 'Unallocated Goal', targetAmount: 5000 }];
    const allocations: GoalAllocation[] = []; // No allocations

    const result = calculateGoalProgress(accountsPerformance, goals, allocations);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Unallocated Goal');
    expect(result[0].targetValue).toBe(5000);
    expect(result[0].currentValue).toBe(0);
    expect(result[0].progress).toBe(0);
    expect(result[0].currency).toBe('USD');
  });

  it('should handle missing accounts in performance data gracefully', () => {
    const accountsPerformance: AccountValuation[] = performanceToValuations([
      { accountId: 'acc1', totalValue: 1000, baseCurrency: 'CAD', fxRateToBase: 0.75 }, // 750 CAD base
    ]);
    const goals: Goal[] = [{ id: 'goal1', title: 'Goal With Missing Account', targetAmount: 2000 }];
    // acc2 is allocated but not in accountsPerformance
    const allocations: GoalAllocation[] = [
      { id: 'alloc1', goalId: 'goal1', accountId: 'acc2', percentAllocation: 50 },
    ];

    const result = calculateGoalProgress(accountsPerformance, goals, allocations);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Goal With Missing Account');
    expect(result[0].currentValue).toBe(0); // Because acc2 data is missing
    expect(result[0].progress).toBe(0);
    expect(result[0].currency).toBe('CAD'); // Base currency from the first account
  });

  it('should use the first account base currency if multiple differing base currencies are present', () => {
    const accountsPerformance: AccountValuation[] = performanceToValuations([
      { accountId: 'acc1', totalValue: 1000, baseCurrency: 'JPY', fxRateToBase: 1 },
      { accountId: 'acc2', totalValue: 200, baseCurrency: 'EUR', fxRateToBase: 1.1 }, // Should be converted to JPY based on its fxRateToBase
    ]);
    const goals: Goal[] = [{ id: 'goal1', title: 'Test Goal Currency', targetAmount: 150000 }];
    const allocations: GoalAllocation[] = [
      { id: 'alloc1', goalId: 'goal1', accountId: 'acc1', percentAllocation: 10 }, // 10% of 1000 JPY = 100 JPY
      { id: 'alloc2', goalId: 'goal1', accountId: 'acc2', percentAllocation: 50 }, // 50% of (200 EUR * 1.1) = 110 JPY (assuming fxRateToBase for acc2 is to JPY)
    ];
    // Total allocated = 100 + 110 = 210 JPY
    // Progress = 210 / 150000 = 0.0014

    const result = calculateGoalProgress(accountsPerformance, goals, allocations);
    expect(result.length).toBe(1);
    const goalProgress = result[0];
    expect(goalProgress.name).toBe('Test Goal Currency');
    expect(goalProgress.currency).toBe('JPY'); // Base currency from the first account
    expect(goalProgress.targetValue).toBe(150000);
    expect(goalProgress.currentValue).toBeCloseTo(1000 * 0.1 + 200 * 1.1 * 0.5); // 100 + 110 = 210
    expect(goalProgress.progress).toBeCloseTo((1000 * 0.1 + 200 * 1.1 * 0.5) / 150000); // 210 / 150000
  });
});

// Mock for SimplePerformanceMetrics performance field
// jest.mock('./types', () => {
//   const originalModule = jest.requireActual('./types');
//   return {
//     ...originalModule,
//     SimplePerformanceMetrics: { // Not really used due to structural typing
//       ...originalModule.SimplePerformanceMetrics,
//       performance: { change: 0, changePercent: 0, history: [] }, // Default mock
//     },
//   };
// });
