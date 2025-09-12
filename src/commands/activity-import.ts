import { ActivityImport, ImportMappingData } from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb } from "@/adapters";
import { logger } from "@/adapters";

export const importActivities = async ({
  activities,
}: {
  activities: ActivityImport[];
}): Promise<ActivityImport[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("import_activities", {
          accountId: activities[0].accountId,
          activities: activities,
        });
      case RUN_ENV.WEB:
        return invokeWeb("import_activities", {
          accountId: activities[0].accountId,
          activities,
        });
      default:
        throw new Error(`Unsupported`);
    }
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
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("check_activities_import", {
          accountId: account_id,
          activities: activities,
        });
      case RUN_ENV.WEB:
        return invokeWeb("check_activities_import", {
          accountId: account_id,
          activities,
        });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error checking activities import.");
    throw error;
  }
};

export const getAccountImportMapping = async (accountId: string): Promise<ImportMappingData> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_account_import_mapping", { accountId });
      case RUN_ENV.WEB:
        return invokeWeb("get_account_import_mapping", { accountId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching mapping.");
    throw error;
  }
};

export const saveAccountImportMapping = async (
  mapping: ImportMappingData,
): Promise<ImportMappingData> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("save_account_import_mapping", {
          mapping,
        });
      case RUN_ENV.WEB:
        return invokeWeb("save_account_import_mapping", { mapping });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error saving mapping.");
    throw error;
  }
};
