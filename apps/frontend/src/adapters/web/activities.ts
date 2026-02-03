// Web-specific activity commands
import type { ParseConfig, ParsedCsvResult } from "@/lib/types";
import { logger } from "./core";

/**
 * Parse a CSV file with the given configuration.
 * Web implementation: POSTs multipart form data to /api/activities/import/parse.
 */
export const parseCsv = async (file: File, config: ParseConfig): Promise<ParsedCsvResult> => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("config", JSON.stringify(config));

    const response = await fetch("/api/activities/import/parse", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    logger.error("Error parsing CSV file:", err);
    throw err;
  }
};
