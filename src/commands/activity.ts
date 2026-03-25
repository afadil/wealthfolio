import {
  Activity,
  ActivityBulkMutationRequest,
  ActivityBulkMutationResult,
  ActivityCreate,
  ActivityDetails,
  ActivitySearchResponse,
  ActivityUpdate,
} from "@/lib/types";
import { invokeTauri, logger } from "@/adapters";

interface Filters {
  accountId?: string | string[];
  activityType?: string | string[];
  symbol?: string;
}

interface Sort {
  id: string;
  desc: boolean;
}

export const getActivities = async (accountId?: string): Promise<ActivityDetails[]> => {
  try {
    const response = await searchActivities(
      0,
      Number.MAX_SAFE_INTEGER,
      accountId ? { accountId } : {},
      "",
      {
        id: "date",
        desc: true,
      },
    );
    return response.data;
  } catch (error) {
    logger.error("Error fetching all activities.");
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
    return invokeTauri("search_activities", {
      page,
      pageSize,
      accountIdFilter: filters?.accountId,
      activityTypeFilter: filters?.activityType,
      assetIdKeyword: searchKeyword,
      sort,
    });
  } catch (error) {
    logger.error("Error fetching activities.");
    throw error;
  }
};

export const createActivity = async (activity: ActivityCreate): Promise<Activity> => {
  try {
    return invokeTauri("create_activity", { activity: activity });
  } catch (error) {
    logger.error("Error creating activity.");
    throw error;
  }
};

export const updateActivity = async (activity: ActivityUpdate): Promise<Activity> => {
  try {
    return invokeTauri("update_activity", { activity: activity });
  } catch (error) {
    logger.error("Error updating activity.");
    throw error;
  }
};

export const saveActivities = async (
  request: ActivityBulkMutationRequest,
): Promise<ActivityBulkMutationResult> => {
  const payload: ActivityBulkMutationRequest = {
    creates: request.creates ?? [],
    updates: request.updates ?? [],
    deleteIds: request.deleteIds ?? [],
  };
  try {
    return invokeTauri("save_activities", { request: payload });
  } catch (error) {
    logger.error("Error saving activities.");
    throw error;
  }
};

export const deleteActivity = async (activityId: string): Promise<Activity> => {
  try {
    return invokeTauri("delete_activity", { activityId });
  } catch (error) {
    logger.error("Error deleting activity.");
    throw error;
  }
};
