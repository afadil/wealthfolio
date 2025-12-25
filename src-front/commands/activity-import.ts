import { ActivityImport, ImportMappingData } from "@/lib/types";
import { invoke, logger } from "@/adapters";

export const importActivities = async ({
  activities,
}: {
  activities: ActivityImport[];
}): Promise<ActivityImport[]> => {
  try {
    return await invoke("import_activities", {
      accountId: activities[0].accountId,
      activities,
    });
  } catch (error) {
    logger.error("Error checking activities import.");
    throw error;
  }
};

export const checkActivitiesImport = async ({
  account_id,
  activities,
}: {
  account_id: string;
  activities: ActivityImport[];
}): Promise<ActivityImport[]> => {
  try {
    return await invoke("check_activities_import", {
      accountId: account_id,
      activities,
    });
  } catch (error) {
    logger.error("Error checking activities import.");
    throw error;
  }
};

export const getAccountImportMapping = async (accountId: string): Promise<ImportMappingData> => {
  try {
    return await invoke("get_account_import_mapping", { accountId });
  } catch (error) {
    logger.error("Error fetching mapping.");
    throw error;
  }
};

export const saveAccountImportMapping = async (
  mapping: ImportMappingData,
): Promise<ImportMappingData> => {
  try {
    return await invoke("save_account_import_mapping", { mapping });
  } catch (error) {
    logger.error("Error saving mapping.");
    throw error;
  }
};
