import { getRunEnv, invokeTauri, invokeWeb, logger, RUN_ENV } from "@/adapters";
import {
  Activity,
  ActivityBulkMutationRequest,
  ActivityBulkMutationResult,
  ActivityCreate,
  ActivityDetails,
  ActivitySearchResponse,
  ActivityUpdate,
  MonthMetricsResponse,
  SpendingTrendsResponse,
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
  accountType?: string[];
  amountMin?: number;
  amountMax?: number;
  recurrence?: string[];
  hasRecurrence?: boolean;
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

  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("search_activities", {
          page,
          pageSize,
          accountIdFilter,
          activityTypeFilter,
          accountTypeFilter: filters?.accountType,
          assetIdKeyword,
          amountMinFilter: filters?.amountMin,
          amountMaxFilter: filters?.amountMax,
          recurrenceFilter: filters?.recurrence,
          hasRecurrenceFilter: filters?.hasRecurrence,
          sort: sortOption,
        });
      case RUN_ENV.WEB:
        return invokeWeb("search_activities", {
          page,
          pageSize,
          accountIdFilter: filters?.accountIds,
          activityTypeFilter: filters?.activityTypes,
          accountTypeFilter: filters?.accountType,
          assetIdKeyword,
          amountMinFilter: filters?.amountMin,
          amountMaxFilter: filters?.amountMax,
          recurrenceFilter: filters?.recurrence,
          hasRecurrenceFilter: filters?.hasRecurrence,
          sort: sortOption,
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

export const getTopSpendingTransactions = async (
  month: string,
  limit: number,
): Promise<ActivityDetails[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_top_spending_transactions", { month, limit });
      case RUN_ENV.WEB:
        return invokeWeb("get_top_spending_transactions", { month, limit });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching top spending transactions.");
    throw error;
  }
};

export const getSpendingTrends = async (
  month: string,
  categoryIds?: string[],
  subcategoryIds?: string[],
  includeEventIds?: string[],
  includeAllEvents?: boolean,
): Promise<SpendingTrendsResponse> => {
  try {
    const request = {
      month,
      categoryIds,
      subcategoryIds,
      includeEventIds,
      includeAllEvents: includeAllEvents ?? false,
    };
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_spending_trends", request);
      case RUN_ENV.WEB:
        return invokeWeb("get_spending_trends", request);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching spending trends.");
    throw error;
  }
};

export const getMonthMetrics = async (month: string): Promise<MonthMetricsResponse> => {
  try {
    const request = { month };
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_month_metrics", request);
      case RUN_ENV.WEB:
        return invokeWeb("get_month_metrics", request);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching month metrics.");
    throw error;
  }
};
