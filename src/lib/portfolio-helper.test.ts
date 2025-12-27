import { calculateGoalProgressFromContributions } from "./portfolio-helper";
import { GoalWithContributions, GoalContributionWithStatus, Goal } from "./types";

function createGoalWithContributions(
  goal: Goal,
  contributions: GoalContributionWithStatus[],
  totalContributed: number,
  progress: number,
  hasAtRiskContributions: boolean,
): GoalWithContributions {
  return {
    goal,
    contributions,
    totalContributed,
    progress,
    hasAtRiskContributions,
  };
}

describe("calculateGoalProgressFromContributions", () => {
  it("should return empty array if goalsWithContributions is empty or undefined", () => {
    expect(calculateGoalProgressFromContributions([])).toEqual([]);
    expect(
      calculateGoalProgressFromContributions(undefined as unknown as GoalWithContributions[]),
    ).toEqual([]);
  });

  it("should calculate goal progress correctly from contributions", () => {
    const goalsWithContributions: GoalWithContributions[] = [
      createGoalWithContributions(
        { id: "goal1", title: "Vacation Fund", targetAmount: 10000 },
        [
          {
            id: "c1",
            goalId: "goal1",
            accountId: "acc1",
            accountName: "Checking",
            accountCurrency: "USD",
            amount: 2500,
            contributedAt: "2024-01-01",
            isAtRisk: false,
          },
          {
            id: "c2",
            goalId: "goal1",
            accountId: "acc2",
            accountName: "Savings",
            accountCurrency: "USD",
            amount: 1100,
            contributedAt: "2024-01-02",
            isAtRisk: false,
          },
        ],
        3600,
        0.36,
        false,
      ),
      createGoalWithContributions(
        { id: "goal2", title: "New Car", targetAmount: 25000 },
        [
          {
            id: "c3",
            goalId: "goal2",
            accountId: "acc1",
            accountName: "Checking",
            accountCurrency: "USD",
            amount: 1040,
            contributedAt: "2024-01-03",
            isAtRisk: false,
          },
        ],
        1040,
        0.0416,
        false,
      ),
      createGoalWithContributions(
        { id: "goal3", title: "Zero Target Goal", targetAmount: 0 },
        [],
        0,
        0,
        false,
      ),
      createGoalWithContributions(
        { id: "goal4", title: "High Progress Goal", targetAmount: 100 },
        [
          {
            id: "c4",
            goalId: "goal4",
            accountId: "acc3",
            accountName: "Cash",
            accountCurrency: "USD",
            amount: 2000,
            contributedAt: "2024-01-04",
            isAtRisk: true,
            atRiskAmount: 500,
          },
        ],
        2000,
        20,
        true,
      ),
    ];

    const result = calculateGoalProgressFromContributions(goalsWithContributions, "USD");

    // Goals are sorted by targetAmount in the function
    const expectedOrder = ["Zero Target Goal", "High Progress Goal", "Vacation Fund", "New Car"];
    result.forEach((res, index) => {
      expect(res.name).toBe(expectedOrder[index]);
    });

    const vacationFundProgress = result.find((g) => g.name === "Vacation Fund");
    expect(vacationFundProgress).toBeDefined();
    if (vacationFundProgress) {
      expect(vacationFundProgress.targetValue).toBe(10000);
      expect(vacationFundProgress.currentValue).toBe(3600);
      expect(vacationFundProgress.progress).toBe(0.36);
      expect(vacationFundProgress.currency).toBe("USD");
      expect(vacationFundProgress.hasAtRiskContributions).toBe(false);
    }

    const newCarProgress = result.find((g) => g.name === "New Car");
    expect(newCarProgress).toBeDefined();
    if (newCarProgress) {
      expect(newCarProgress.targetValue).toBe(25000);
      expect(newCarProgress.currentValue).toBe(1040);
      expect(newCarProgress.progress).toBe(0.0416);
      expect(newCarProgress.currency).toBe("USD");
      expect(newCarProgress.hasAtRiskContributions).toBe(false);
    }

    const zeroTargetGoalProgress = result.find((g) => g.name === "Zero Target Goal");
    expect(zeroTargetGoalProgress).toBeDefined();
    if (zeroTargetGoalProgress) {
      expect(zeroTargetGoalProgress.targetValue).toBe(0);
      expect(zeroTargetGoalProgress.currentValue).toBe(0);
      expect(zeroTargetGoalProgress.progress).toBe(0);
      expect(zeroTargetGoalProgress.currency).toBe("USD");
    }

    const highProgressGoal = result.find((g) => g.name === "High Progress Goal");
    expect(highProgressGoal).toBeDefined();
    if (highProgressGoal) {
      expect(highProgressGoal.targetValue).toBe(100);
      expect(highProgressGoal.currentValue).toBe(2000);
      expect(highProgressGoal.progress).toBe(20);
      expect(highProgressGoal.currency).toBe("USD");
      expect(highProgressGoal.hasAtRiskContributions).toBe(true);
    }
  });

  it("should return progress for goals with no contributions", () => {
    const goalsWithContributions: GoalWithContributions[] = [
      createGoalWithContributions(
        { id: "goal1", title: "Unallocated Goal", targetAmount: 5000 },
        [],
        0,
        0,
        false,
      ),
    ];

    const result = calculateGoalProgressFromContributions(goalsWithContributions, "USD");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Unallocated Goal");
    expect(result[0].targetValue).toBe(5000);
    expect(result[0].currentValue).toBe(0);
    expect(result[0].progress).toBe(0);
    expect(result[0].currency).toBe("USD");
    expect(result[0].hasAtRiskContributions).toBe(false);
  });

  it("should use the provided base currency", () => {
    const goalsWithContributions: GoalWithContributions[] = [
      createGoalWithContributions(
        { id: "goal1", title: "Test Goal", targetAmount: 150000 },
        [],
        210,
        0.0014,
        false,
      ),
    ];

    const result = calculateGoalProgressFromContributions(goalsWithContributions, "JPY");
    expect(result.length).toBe(1);
    expect(result[0].currency).toBe("JPY");
  });
});
