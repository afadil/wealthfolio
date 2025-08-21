import {
  getRunEnv,
  openCsvFileDialogTauri,
  openFolderDialogTauri,
  openDatabaseFileDialogTauri,
  openFileSaveDialogTauri,
  RUN_ENV,
  logger,
} from '@/adapters';

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
    logger.error('Error open csv file.');
    throw error;
  }
};

// openFolderDialog
export const openFolderDialog = async (): Promise<string | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return openFolderDialogTauri();
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error opening folder dialog.');
    throw error;
  }
};

// openDatabaseFileDialog
export const openDatabaseFileDialog = async (): Promise<string | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return openDatabaseFileDialogTauri();
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error opening database file dialog.');
    throw error;
  }
};

// Function for downloading file content
export async function openFileSaveDialog(
  fileContent: Uint8Array | Blob | string,
  fileName: string,
) {
  switch (getRunEnv()) {
    case RUN_ENV.DESKTOP:
      return openFileSaveDialogTauri(fileContent, fileName);
    default:
      throw new Error(`Unsupported environment for file download`);
  }
}
