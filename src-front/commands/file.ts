import {
  openCsvFileDialog as openCsvFileDialogAdapter,
  openFolderDialog as openFolderDialogAdapter,
  openDatabaseFileDialog as openDatabaseFileDialogAdapter,
  openFileSaveDialog as openFileSaveDialogAdapter,
  logger,
} from "@/adapters";

// openCsvFileDialog
export const openCsvFileDialog = async (): Promise<null | string | string[]> => {
  try {
    return await openCsvFileDialogAdapter();
  } catch (error) {
    logger.error("Error open csv file.");
    throw error;
  }
};

// openFolderDialog
export const openFolderDialog = async (): Promise<string | null> => {
  try {
    return await openFolderDialogAdapter();
  } catch (error) {
    logger.error("Error opening folder dialog.");
    throw error;
  }
};

// openDatabaseFileDialog
export const openDatabaseFileDialog = async (): Promise<string | null> => {
  try {
    return await openDatabaseFileDialogAdapter();
  } catch (error) {
    logger.error("Error opening database file dialog.");
    throw error;
  }
};

// Function for downloading file content
export async function openFileSaveDialog(
  fileContent: Uint8Array | Blob | string,
  fileName: string,
) {
  try {
    return await openFileSaveDialogAdapter(fileContent, fileName);
  } catch (error) {
    logger.error("Error saving file.");
    throw error;
  }
}
