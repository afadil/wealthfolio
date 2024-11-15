import z from 'zod';
import { Activity, ActivityDetails, ActivitySearchResponse } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri, logger } from '@/adapters';
import { newActivitySchema } from '@/lib/schemas';

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

// Type for backend API calls
interface ActivityApiData {
  id?: string;
  accountId: string;
  activityType: string;
  activityDate: string | Date;
  assetId: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  fee: number;
  isDraft: boolean;
  comment?: string | null;
}

function transformToApiData(activity: NewActivity): ActivityApiData {
  const baseData = {
    id: activity.id,
    accountId: activity.accountId,
    assetId: activity.assetId || '',
    activityType: activity.activityType,
    activityDate: activity.activityDate,
    currency: activity.currency || '',
    isDraft: activity.isDraft || false,
    comment: activity.comment,
  };

  switch (activity.activityType) {
    case 'FEE':
      return {
        ...baseData,
        quantity: 0,
        unitPrice: 0,
        fee: activity.fee,
      };

    case 'DEPOSIT':
    case 'WITHDRAWAL':
    case 'INTEREST':
    case 'DIVIDEND':
      return {
        ...baseData,
        quantity: 1,
        unitPrice: activity.unitPrice,
        fee: activity.fee || 0,
      };

    case 'SPLIT':
      return {
        ...baseData,
        quantity: activity.quantity,
        unitPrice: activity.unitPrice,
        fee: 0,
      };

    case 'TRANSFER_OUT':
      return {
        ...baseData,
        unitPrice: 1,
        quantity: activity.quantity,
        fee: activity.fee || 0,
      };

    default:
      return {
        ...baseData,
        assetId: activity.assetId,
        quantity: activity.quantity,
        unitPrice: activity.unitPrice,
        fee: activity.fee || 0,
      };
  }
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
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error fetching activities.');
    throw error;
  }
};

export const createActivity = async (activity: NewActivity): Promise<Activity> => {
  try {
    const apiData = transformToApiData(activity);

    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('create_activity', { activity: apiData });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error creating activity.');
    throw error;
  }
};

export const updateActivity = async (activity: NewActivity): Promise<Activity> => {
  try {
    const apiData = transformToApiData(activity);

    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_activity', { activity: apiData });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error updating activity.');
    throw error;
  }
};

export const deleteActivity = async (activityId: string): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('delete_activity', { activityId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error deleting activity.');
    throw error;
  }
};
