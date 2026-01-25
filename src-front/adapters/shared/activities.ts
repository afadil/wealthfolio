// Activity Commands
import type {
  Activity,
  ActivityBulkMutationRequest,
  ActivityBulkMutationResult,
  ActivityCreate,
  ActivityDetails,
  ActivitySearchResponse,
  ActivityUpdate,
  ActivityImport,
  ImportActivitiesResult,
  ImportMappingData,
} from "@/lib/types";

import { invoke, logger } from "./platform";

interface ActivityFilters {
  accountIds?: string | string[];
  activityTypes?: string | string[];
  symbol?: string;
  needsReview?: boolean;
}

interface ActivitySort {
  id: string;
  desc?: boolean;
}

function normalizeStringArray(input?: string | string[]): string[] | undefined {
  if (!input) return undefined;
  if (Array.isArray(input)) {
    return input.length > 0 ? input : undefined;
  }
  return input.length > 0 ? [input] : undefined;
}

export const getActivities = async (accountId?: string): Promise<ActivityDetails[]> => {
  try {
    const response = await searchActivities(
      0,
      Number.MAX_SAFE_INTEGER,
      accountId ? { accountIds: [accountId] } : {},
      "",
      { id: "date", desc: true },
    );
    return response.data;
  } catch (err) {
    logger.error("Error fetching all activities.");
    throw err;
  }
};

export const searchActivities = async (
  page: number,
  pageSize: number,
  filters: ActivityFilters,
  searchKeyword: string,
  sort?: ActivitySort,
): Promise<ActivitySearchResponse> => {
  const accountIdFilter = normalizeStringArray(filters?.accountIds);
  const activityTypeFilter = normalizeStringArray(filters?.activityTypes);
  const assetIdKeywordRaw = filters?.symbol ?? searchKeyword;
  const assetIdKeyword = assetIdKeywordRaw?.trim() ? assetIdKeywordRaw.trim() : undefined;
  const sortOption = sort?.id
    ? { id: sort.id, desc: sort.desc ?? false }
    : { id: "date", desc: true };
  const needsReviewFilter = filters?.needsReview;

  try {
    return await invoke<ActivitySearchResponse>("search_activities", {
      page,
      pageSize,
      accountIdFilter,
      activityTypeFilter,
      assetIdKeyword,
      sort: sortOption,
      needsReviewFilter,
    });
  } catch (err) {
    logger.error("Error fetching activities.");
    throw err;
  }
};

export const createActivity = async (activity: ActivityCreate): Promise<Activity> => {
  try {
    return await invoke<Activity>("create_activity", { activity });
  } catch (err) {
    logger.error("Error creating activity.");
    throw err;
  }
};

export const updateActivity = async (activity: ActivityUpdate): Promise<Activity> => {
  try {
    return await invoke<Activity>("update_activity", { activity });
  } catch (err) {
    logger.error("Error updating activity.");
    throw err;
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
    return await invoke<ActivityBulkMutationResult>("save_activities", { request: payload });
  } catch (err) {
    logger.error("Error saving activities.");
    throw err;
  }
};

export const deleteActivity = async (activityId: string): Promise<Activity> => {
  try {
    return await invoke<Activity>("delete_activity", { activityId });
  } catch (err) {
    logger.error("Error deleting activity.");
    throw err;
  }
};

// ============================================================================
// Activity Import Commands
// ============================================================================

/**
 * Import activities into the system.
 * Extracts accountId from the first activity for the backend call.
 * Returns ImportActivitiesResult with activities, import_run_id, and summary.
 */
export const importActivities = async ({
  activities,
}: {
  activities: ActivityImport[];
}): Promise<ImportActivitiesResult> => {
  try {
    return await invoke<ImportActivitiesResult>("import_activities", {
      accountId: activities[0].accountId,
      activities,
    });
  } catch (err) {
    logger.error("Error importing activities.");
    throw err;
  }
};

/**
 * Check activities before import (validation/preview).
 * @param accountId - The account ID to import activities into
 * @param activities - The activities to validate
 * @param dryRun - If true, performs read-only validation without creating assets or FX pairs
 */
export const checkActivitiesImport = async ({
  accountId,
  activities,
  dryRun,
}: {
  accountId: string;
  activities: ActivityImport[];
  dryRun?: boolean;
}): Promise<ActivityImport[]> => {
  try {
    return await invoke<ActivityImport[]>("check_activities_import", {
      accountId,
      activities,
      dryRun,
    });
  } catch (err) {
    logger.error("Error checking activities import.");
    throw err;
  }
};

/**
 * Get the import mapping configuration for an account.
 */
export const getAccountImportMapping = async (accountId: string): Promise<ImportMappingData> => {
  try {
    return await invoke<ImportMappingData>("get_account_import_mapping", { accountId });
  } catch (err) {
    logger.error("Error fetching mapping.");
    throw err;
  }
};

/**
 * Save the import mapping configuration for an account.
 */
export const saveAccountImportMapping = async (
  mapping: ImportMappingData,
): Promise<ImportMappingData> => {
  try {
    return await invoke<ImportMappingData>("save_account_import_mapping", { mapping });
  } catch (err) {
    logger.error("Error saving mapping.");
    throw err;
  }
};

/**
 * Check for existing duplicate activities based on idempotency keys.
 * Returns a map of {idempotency_key: existing_activity_id} for duplicates found.
 */
export const checkExistingDuplicates = async (
  idempotencyKeys: string[],
): Promise<Record<string, string>> => {
  try {
    return await invoke<Record<string, string>>("check_existing_duplicates", { idempotencyKeys });
  } catch (err) {
    logger.error("Error checking for duplicate activities.");
    throw err;
  }
};

