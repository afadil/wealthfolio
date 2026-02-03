// Web adapter - File Dialogs (web implementations)

/**
 * Open a file dialog for CSV files.
 * Web implementation - not fully supported, returns null.
 */
export const openCsvFileDialog = async (): Promise<null | string | string[]> => {
  // Web implementation would use file input - return null to indicate not supported
  return null;
};

/**
 * Open a folder selection dialog.
 * Not supported in web.
 */
export const openFolderDialog = async (): Promise<string | null> => {
  // Not supported in web
  return null;
};

/**
 * Open a file dialog for database files.
 * Not supported in web.
 */
export const openDatabaseFileDialog = async (): Promise<string | null> => {
  // Not supported in web
  return null;
};

/**
 * Open a file save dialog and save content.
 * Web implementation using download.
 */
export const openFileSaveDialog = async (
  fileContent: string | Blob | Uint8Array,
  fileName: string,
): Promise<boolean> => {
  // Web implementation using download
  try {
    let blob: Blob;
    if (typeof fileContent === "string") {
      blob = new Blob([fileContent], { type: "text/plain" });
    } else if (fileContent instanceof Blob) {
      blob = fileContent;
    } else {
      blob = new Blob([fileContent as BlobPart]);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
};

// ============================================================================
// Shell & Browser
// ============================================================================

/**
 * Open a URL in the browser.
 */
export const openUrlInBrowser = async (url: string): Promise<void> => {
  window.open(url, "_blank");
};
