import { ActivityImport, ImportMappingData, NewActivity } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';
import { error as logError } from '@tauri-apps/plugin-log';
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
        return invokeTauri('check_activities_import', {
          accountId: account_id,
          activities: activities,
        });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error checking activities import.');
    throw error;
  }
};

export const createActivities = async (activities: NewActivity[]): Promise<number> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('create_activities', { activities });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error importing activities.');
    throw error;
  }
};

export const getAccountImportMapping = async (accountId: string): Promise<ImportMappingData> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_account_import_mapping', { accountId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error fetching mapping.');
    throw error;
  }
};

export const saveAccountImportMapping = async (
  mapping: ImportMappingData,
): Promise<ImportMappingData> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('save_account_import_mapping', {
          mapping,
        });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error saving mapping.');
    throw error;
  }
};
