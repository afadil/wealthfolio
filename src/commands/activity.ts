import { Activity, ActivityCreate, ActivityDetails, ActivitySearchResponse, ActivityUpdate } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb, logger } from '@/adapters';

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
    logger.error('Error fetching all activities.');
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
      case RUN_ENV.WEB:
        return invokeWeb('search_activities', {
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
    logger.error('Error fetching activities.');
    throw error;
  }
};

export const createActivity = async (activity: ActivityCreate): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('create_activity', { activity: activity });
      case RUN_ENV.WEB:
        return invokeWeb('create_activity', { activity });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error creating activity.');
    throw error;
  }
};

export const updateActivity = async (activity: ActivityUpdate): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_activity', { activity: activity });
      case RUN_ENV.WEB:
        return invokeWeb('update_activity', { activity });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error updating activity.');
    throw error;
  }
};

export const saveActivities = async (activities: ActivityUpdate[]): Promise<Activity[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('save_activities', { activities: activities });
      case RUN_ENV.WEB:
        return invokeWeb('save_activities', { activities });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error saving activities.');
    throw error;
  }
};

export const deleteActivity = async (activityId: string): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('delete_activity', { activityId });
      case RUN_ENV.WEB:
        return invokeWeb('delete_activity', { activityId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error deleting activity.');
    throw error;
  }
};
