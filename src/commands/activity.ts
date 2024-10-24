import z from 'zod';
import { Activity, ActivityDetails, ActivityImport, ActivitySearchResponse } from '@/lib/types';
import { newActivitySchema } from '@/lib/schemas';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';

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
    console.error('Error fetching all activities:', error);
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
    console.error('Error fetching activities:', error);
    throw error;
  }
};

// createActivity
export const createActivity = async (activity: NewActivity): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('create_activity', { activity, isPublic: activity.isPublic });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error creating activity:', error);
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
    console.error('Error updating activity:', error);
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
    console.error('Error deleting activity:', error);
    throw error;
  }
};

//checkActivitiesImport
export const checkActivitiesImport = async ({
  account_id,
  file_path,
}: {
  account_id: string;
  file_path: string;
}): Promise<ActivityImport[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('check_activities_import', {
          accountId: account_id,
          filePath: file_path,
        });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error checking activities import:', error);
    throw error;
  }
};

// importActivities
export const createActivities = async (activities: NewActivity[]): Promise<Number> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('create_activities', { activities });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error importing activities:', error);
    throw error;
  }
};
