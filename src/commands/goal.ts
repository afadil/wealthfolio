import { invoke } from '@tauri-apps/api';
import * as z from 'zod';
import { Goal, GoalAllocation } from '@/lib/types';
import { newGoalSchema } from '@/lib/schemas';

type NewGoal = z.infer<typeof newGoalSchema>;

export const getGoals = async (): Promise<Goal[]> => {
  try {
    const goals = await invoke('get_goals');
    return goals as Goal[];
  } catch (error) {
    console.error('Error fetching goals:', error);
    throw error;
  }
};

export const createGoal = async (goal: NewGoal): Promise<Goal> => {
  const newGoal = {
    ...goal,
    yearlyContribution: 0,
    goalType: 'NEEDS',
    isAchieved: false,
  };
  try {
    const createdGoal = await invoke('create_goal', { goal: newGoal });
    return createdGoal as Goal;
  } catch (error) {
    console.error('Error creating goal:', error);
    throw error;
  }
};

export const updateGoal = async (goal: Goal): Promise<Goal> => {
  try {
    const updatedGoal = await invoke('update_goal', { goal });
    return updatedGoal as Goal;
  } catch (error) {
    console.error('Error updating goal:', error);
    throw error;
  }
};

export const deleteGoal = async (goalId: string): Promise<void> => {
  try {
    await invoke('delete_goal', { goalId });
  } catch (error) {
    console.error('Error deleting goal:', error);
    throw error;
  }
};

export const updateGoalsAllocations = async (allocations: GoalAllocation[]): Promise<void> => {
  try {
    await invoke('update_goal_allocations', { allocations });
  } catch (error) {
    console.error('Error saving goals allocations:', error);
    throw error;
  }
};

export const getGoalsAllocation = async (): Promise<GoalAllocation[]> => {
  try {
    const allocations = await invoke('load_goals_allocations');
    return allocations as GoalAllocation[];
  } catch (error) {
    console.error('Error fetching goals allocations:', error);
    throw error;
  }
};
