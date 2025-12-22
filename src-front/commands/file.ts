import {
  getRunEnv,
  openCsvFileDialogTauri,
  openFolderDialogTauri,
  openDatabaseFileDialogTauri,
  openFileSaveDialogTauri,
  RUN_ENV,
  logger,
} from "@/adapters";

// openCsvFileDialog
export const openCsvFileDialog = async (): Promise<null | string | string[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return openCsvFileDialogTauri();
      case RUN_ENV.WEB:
        throw new Error(`Unsupported in web`);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error open csv file.");
    throw error;
  }
};

// openFolderDialog
export const openFolderDialog = async (): Promise<string | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return openFolderDialogTauri();
      case RUN_ENV.WEB:
        throw new Error(`Unsupported in web`);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error opening folder dialog.");
    throw error;
  }
};

// openDatabaseFileDialog
export const openDatabaseFileDialog = async (): Promise<string | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return openDatabaseFileDialogTauri();
      case RUN_ENV.WEB:
        throw new Error(`Unsupported in web`);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error opening database file dialog.");
    throw error;
  }
};

const saveFileInBrowser = (fileContent: Uint8Array | Blob | string, fileName: string) => {
  if (typeof window === "undefined") {
    throw new Error("File download requires a window context");
  }

  let blob: Blob;
  if (fileContent instanceof Blob) {
    blob = fileContent;
  } else if (fileContent instanceof Uint8Array) {
    const buffer = new Uint8Array(fileContent); // ensure ArrayBuffer
    blob = new Blob([buffer], { type: "application/octet-stream" });
  } else {
    blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Function for downloading file content
export async function openFileSaveDialog(
  fileContent: Uint8Array | Blob | string,
  fileName: string,
) {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return openFileSaveDialogTauri(fileContent, fileName);
      case RUN_ENV.WEB:
        saveFileInBrowser(fileContent, fileName);
        return true;
      default:
        throw new Error(`Unsupported environment for file download`);
    }
  } catch (error) {
    logger.error("Error saving file.");
    throw error;
  }
}
