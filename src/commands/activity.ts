import z from 'zod';
import { Activity, ActivityDetails, ActivitySearchResponse } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';
import { newActivitySchema } from '@/lib/schemas';
import { error as logError } from '@tauri-apps/plugin-log';

export type NewActivity = z.infer<typeof newActivitySchema>;

interface Filters {
  accountId?: string;
  activityType?: string;
  symbol?: string;
}

interface Sort {
  id: string;
  desc: boolean;
}

export const getActivities = async (): Promise<ActivityDetails[]> => {
  try {
    const response = await searchActivities(0, Number.MAX_SAFE_INTEGER, {}, '', {
      id: 'date',
      desc: true,
    });
    return response.data;
  } catch (error) {
    logError('Error fetching all activities.');
    throw error;
  }
};

export const searchActivities = async (
  page: number,
  pageSize: number,
  filters: Filters,
  searchKeyword: string,
  sort: Sort,
): Promise<ActivitySearchResponse> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('search_activities', {
          page,
          pageSize,
          accountIdFilter: filters?.accountId,
          activityTypeFilter: filters?.activityType,
          assetIdKeyword: searchKeyword,
          sort,
        });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error fetching activities.');
    throw error;
  }
};

// createActivity
export const createActivity = async (activity: NewActivity): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('create_activity', { activity });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error creating activity.');
    throw error;
  }
};

// updateActivity
export const updateActivity = async (activity: NewActivity): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_activity', { activity });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error updating activity.');
    throw error;
  }
};

// deleteActivity
export const deleteActivity = async (activityId: string): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('delete_activity', { activityId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error deleting activity.');
    throw error;
  }
};
