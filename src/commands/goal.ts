import { invokeTauri, logger } from "@/adapters";
import { newGoalSchema } from "@/lib/schemas";
import { Goal, GoalAllocation } from "@/lib/types";
import z from "zod";

// Form schema type (uses Date for date fields)
type NewGoalForm = z.infer<typeof newGoalSchema>;

// API input type (uses string for date fields, matching the backend)
export type NewGoalInput = Omit<NewGoalForm, "deadline"> & {
  deadline?: string;
};

// Raw backend type including legacy fields
interface RawGoalAllocation extends GoalAllocation {
  percentAllocation?: number;
  allocationAmount?: number;
}

// Helper to normalize allocations from backend
const normalizeAllocation = (raw: RawGoalAllocation): GoalAllocation => {
  return {
    ...raw,
    // Use new fields, fallback to legacy, fallback to 0
    initialContribution: raw.initialContribution ?? raw.allocationAmount ?? 0,
    allocatedPercent: raw.allocatedPercent ?? raw.percentAllocation ?? 0,
  };
};

export const getGoals = async (): Promise<Goal[]> => {
  try {
    return invokeTauri("get_goals");
  } catch (error) {
    logger.error("Error fetching goals.");
    throw error;
  }
};

export const createGoal = async (goal: NewGoalInput): Promise<Goal> => {
  const newGoal = {
    ...goal,
    yearlyContribution: 0,
    goalType: "NEEDS",
    isAchieved: false,
  };
  try {
    return invokeTauri("create_goal", { goal: newGoal });
  } catch (error) {
    logger.error("Error creating goal.");
    throw error;
  }
};

export const updateGoal = async (goal: Goal): Promise<Goal> => {
  try {
    return invokeTauri("update_goal", { goal });
  } catch (error) {
    logger.error("Error updating goal.");
    throw error;
  }
};

export const deleteGoal = async (goalId: string): Promise<void> => {
  try {
    await invokeTauri("delete_goal", { goalId });
    return;
  } catch (error) {
    logger.error("Error deleting goal.");
    throw error;
  }
};

export const updateGoalsAllocations = async (allocations: GoalAllocation[]): Promise<void> => {
  try {
    await invokeTauri("update_goal_allocations", { allocations });
    return;
  } catch (error) {
    logger.error("Error saving goals allocations.");
    throw error;
  }
};

export const getGoalsAllocation = async (): Promise<GoalAllocation[]> => {
  try {
    const allocations: RawGoalAllocation[] = await invokeTauri<RawGoalAllocation[]>("load_goals_allocations");
    return allocations.map(normalizeAllocation);
  } catch (error) {
    logger.error("Error fetching goals allocations.");
    throw error;
  }
};

export interface GoalProgressSnapshot {
  goalId: string;
  goalTitle: string;
  queryDate: string;
  initValue: number;
  currentValue: number;
  growth: number;
  allocationDetails: AllocationDetail[];
}

export interface AllocationDetail {
  accountId: string;
  percentAllocation: number;
  accountValueAtGoalStart: number;
  accountCurrentValue: number;
  accountGrowth: number;
  allocatedGrowth: number;
}

export const getGoalProgress = async (
  goalId: string,
  date?: string
): Promise<GoalProgressSnapshot> => {
  try {
    return invokeTauri("get_goal_progress", { goalId, date });
  } catch (error) {
    logger.error("Error fetching goal progress.");
    throw error;
  }
};

export const getGoalAllocationsOnDate = async (
  goalId: string,
  date?: string
): Promise<GoalAllocation[]> => {
  try {
    const allocations: RawGoalAllocation[] = await invokeTauri<RawGoalAllocation[]>("get_goal_allocations_on_date", { goalId, date });
    return allocations.map(normalizeAllocation);
  } catch (error) {
    logger.error("Error fetching goal allocations on date.");
    throw error;
  }
};

export interface AllocationConflictValidationRequest {
  accountId: string;
  startDate: string;
  endDate: string;
  percentAllocation: number;
  excludeAllocationId?: string;
}

export interface AllocationConflictValidationResponse {
  valid: boolean;
  message: string;
}

export const validateAllocationConflict = async (
  request: AllocationConflictValidationRequest
): Promise<AllocationConflictValidationResponse> => {
  try {
    return invokeTauri("validate_allocation_conflict", { request });
  } catch (error) {
    logger.error("Error validating allocation conflict.");
    throw error;
  }
};

export const deleteGoalAllocation = async (allocationId: string): Promise<void> => {
  try {
    await invokeTauri("delete_goal_allocation", { allocationId });
    return;
  } catch (error) {
    logger.error("Error deleting goal allocation.");
    throw error;
  }
};
