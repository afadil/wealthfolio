// Web-specific activity commands
import type { ParseConfig, ParsedCsvResult } from "@/lib/types";
import { API_PREFIX, logger } from "./core";
import { getAuthToken } from "@/lib/auth-token";

/**
 * Parse a CSV file with the given configuration.
 * Web implementation: POSTs multipart form data to /api/v1/activities/import/parse.
 */
export const parseCsv = async (file: File, config: ParseConfig): Promise<ParsedCsvResult> => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("config", JSON.stringify(config));

    const headers: HeadersInit = {};
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_PREFIX}/activities/import/parse`, {
      method: "POST",
      headers,
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
