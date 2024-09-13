import { getRunEnv, openCsvFileDialogTauri, RUN_ENV } from '@/adapters';

// openCsvFileDialog
export const openCsvFileDialog = async (): Promise<null | string | string[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return openCsvFileDialogTauri();
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error open csv file', error);
    throw error;
  }
};
