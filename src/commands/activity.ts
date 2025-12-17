import { getRunEnv, invokeTauri, invokeWeb, logger, RUN_ENV } from "@/adapters";
import {
  Activity,
  ActivityBulkMutationRequest,
  ActivityBulkMutationResult,
  ActivityCreate,
  ActivityDetails,
  ActivitySearchResponse,
  ActivityUpdate,
} from "@/lib/types";

function normalizeStringArray(input?: string | string[]): string[] | undefined {
  if (!input) return undefined;

  if (Array.isArray(input)) {
    return input.length > 0 ? input : undefined;
  }

  return input.length > 0 ? [input] : undefined;
}

interface Filters {
  accountIds?: string | string[];
  activityTypes?: string | string[];
  symbol?: string;
  isDraft?: boolean;
}

interface Sort {
  id: string;
  desc?: boolean;
}

export const getActivities = async (accountId?: string): Promise<ActivityDetails[]> => {
  try {
    const response = await searchActivities(
      0,
      Number.MAX_SAFE_INTEGER,
      accountId ? { accountIds: [accountId] } : {},
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
  sort?: Sort,
): Promise<ActivitySearchResponse> => {
  const accountIdFilter = normalizeStringArray(filters?.accountIds);
  const activityTypeFilter = normalizeStringArray(filters?.activityTypes);
  const assetIdKeywordRaw = filters?.symbol ?? searchKeyword;
  const assetIdKeyword = assetIdKeywordRaw?.trim() ? assetIdKeywordRaw.trim() : undefined;
  const sortOption = sort?.id
    ? { id: sort.id, desc: sort.desc ?? false }
    : { id: "date", desc: true };
  const isDraftFilter = filters?.isDraft;

  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("search_activities", {
          page,
          pageSize,
          accountIdFilter,
          activityTypeFilter,
          assetIdKeyword,
          sort: sortOption,
          isDraftFilter,
        });
      case RUN_ENV.WEB:
        return invokeWeb("search_activities", {
          page,
          pageSize,
          accountIdFilter,
          activityTypeFilter,
          assetIdKeyword,
          sort: sortOption,
          isDraftFilter,
        });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching activities.");
    throw error;
  }
};

export const createActivity = async (activity: ActivityCreate): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("create_activity", { activity: activity });
      case RUN_ENV.WEB:
        return invokeWeb("create_activity", { activity });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error creating activity.");
    throw error;
  }
};

export const updateActivity = async (activity: ActivityUpdate): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_activity", { activity: activity });
      case RUN_ENV.WEB:
        return invokeWeb("update_activity", { activity });
      default:
        throw new Error(`Unsupported`);
    }
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
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("save_activities", { request: payload });
      case RUN_ENV.WEB:
        return invokeWeb("save_activities", { request: payload });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error saving activities.");
    throw error;
  }
};

export const deleteActivity = async (activityId: string): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("delete_activity", { activityId });
      case RUN_ENV.WEB:
        return invokeWeb("delete_activity", { activityId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error deleting activity.");
    throw error;
  }
};
