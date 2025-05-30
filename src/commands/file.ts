import {
  getRunEnv,
  openCsvFileDialogTauri,
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
