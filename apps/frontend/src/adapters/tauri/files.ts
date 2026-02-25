// File Dialogs
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

const isIOS = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const shareFileOnIOS = async (content: Uint8Array, fileName: string): Promise<boolean> => {
  try {
    const { shareBinary } = await import("tauri-plugin-mobile-share");

    const extensionIndex = fileName.lastIndexOf(".");
    const hasExtension = extensionIndex > 0 && extensionIndex < fileName.length - 1;
    const name = hasExtension ? fileName.slice(0, extensionIndex) : fileName;
    const ext = hasExtension ? fileName.slice(extensionIndex + 1) : "db";

    await shareBinary(toBase64(content), { name, ext });
    return true;
  } catch {
    return false;
  }
};

export const openCsvFileDialog = async (): Promise<null | string | string[]> => {
  return open({ filters: [{ name: "CSV", extensions: ["csv"] }] });
};

export const openFolderDialog = async (): Promise<string | null> => {
  return open({ directory: true });
};

export const openDatabaseFileDialog = async (): Promise<string | null> => {
  const result = (await open()) as string | string[] | null;
  if (Array.isArray(result)) {
    return result[0] ?? null;
  }
  return typeof result === "string" ? result : null;
};

export const openFileSaveDialog = async (
  fileContent: string | Blob | Uint8Array,
  fileName: string,
): Promise<boolean> => {
  let contentToSave: Uint8Array;
  if (typeof fileContent === "string") {
    contentToSave = new TextEncoder().encode(fileContent);
  } else if (fileContent instanceof Blob) {
    const arrayBuffer = await fileContent.arrayBuffer();
    contentToSave = new Uint8Array(arrayBuffer);
  } else {
    contentToSave = fileContent;
  }

  if (isIOS()) {
    return await shareFileOnIOS(contentToSave, fileName);
  }

  const filePath = await save({
    defaultPath: fileName,
    filters: [
      {
        name: fileName,
        extensions: [fileName.split(".").pop() ?? ""],
      },
    ],
  });

  if (filePath === null) {
    return false;
  }

  const candidatePaths = [filePath];
  if (filePath.startsWith("file://")) {
    candidatePaths.push(decodeURI(filePath.replace("file://", "")));
  } else {
    candidatePaths.push(`file://${filePath}`);
  }

  let lastError: unknown;
  for (const candidatePath of candidatePaths) {
    try {
      await writeFile(candidatePath, contentToSave);
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

// ============================================================================
// Shell & Browser
// ============================================================================

export const openUrlInBrowser = async (url: string): Promise<void> => {
  const { open: openShell } = await import("@tauri-apps/plugin-shell");
  await openShell(url);
};
