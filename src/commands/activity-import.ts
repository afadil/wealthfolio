import { ActivityImport, ImportMappingData } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';
import { logger } from '@/adapters';

// Define the NewActivity type or import it if available elsewhere
type NewActivity = {
  id?: string;
  accountId: string;
  type: string;
  date: string;
  symbol?: string;
  description?: string;
  quantity?: number;
  price?: number;
  fees?: number;
  amount?: number;
};

export const importActivities = async ({
  activities,
}: {
  activities: ActivityImport[];
}): Promise<ActivityImport[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('import_activities', {
          accountId: activities[0].accountId,
          activities: activities,
        });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error checking activities import.');
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
        return invokeTauri('check_activities_import', {
          accountId: account_id,
          activities: activities,
        });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error checking activities import.');
    throw error;
  }
};

export const createActivities = async ({
  activities,
}: {
  activities: NewActivity[];
}): Promise<number> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('create_activities', { activities });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error importing activities.');
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
    logger.error('Error fetching mapping.');
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
    logger.error('Error saving mapping.');
    throw error;
  }
};
