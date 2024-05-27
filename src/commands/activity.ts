import { invoke } from '@tauri-apps/api';
import * as z from 'zod';
import { Activity, ActivityDetails, ActivityImport, ActivitySearchResponse } from '@/lib/types';
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

export const getActivities = async (): Promise<ActivityDetails[]> => {
  try {
    const activities = await invoke('get_activities');
    return activities as ActivityDetails[];
  } catch (error) {
    console.error('Error fetching activities:', error);
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
    const result = await invoke('search_activities', {
      page,
      pageSize,
      accountIdFilter: filters?.accountId,
      activityTypeFilter: filters?.activityType,
      assetIdKeyword: searchKeyword,
      sort,
    });
    return result as ActivitySearchResponse;
  } catch (error) {
    console.error('Error fetching activities:', error);
    throw error;
  }
};

// createActivity
export const createActivity = async (activity: NewActivity): Promise<Activity> => {
  try {
    const newActivity = await invoke('create_activity', { activity });
    return newActivity as Activity;
  } catch (error) {
    console.error('Error creating activity:', error);
    throw error;
  }
};

// updateActivity
export const updateActivity = async (activity: NewActivity): Promise<Activity> => {
  try {
    const updatedActivity = await invoke('update_activity', { activity });
    return updatedActivity as Activity;
  } catch (error) {
    console.error('Error updating activity:', error);
    throw error;
  }
};

// deleteActivity
export const deleteActivity = async (activityId: string): Promise<void> => {
  try {
    await invoke('delete_activity', { activityId });
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
    const result: ActivityImport[] = await invoke('check_activities_import', {
      accountId: account_id,
      filePath: file_path,
    });
    return result;
  } catch (error) {
    console.error('Error checking activities import:', error);
    throw error;
  }
};

// importActivities
export const createActivities = async (activities: NewActivity[]): Promise<Number> => {
  try {
    const importResult: Number = await invoke('create_activities', { activities });
    return importResult;
  } catch (error) {
    console.error('Error importing activities:', error);
    throw error;
  }
};
