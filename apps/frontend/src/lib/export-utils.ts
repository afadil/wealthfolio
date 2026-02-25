import { ExportedFileFormat } from "@/lib/types";

export function formatData(data: unknown[], format: ExportedFileFormat): string {
  if (!data || data.length === 0) return "";
  if (format === "CSV") {
    return convertToCSV(data as Record<string, unknown>[]);
  } else if (format === "JSON") {
    return JSON.stringify(data, null, 2);
  }
  return "";
}

export function convertToCSV<T extends Record<string, unknown>>(data: T[]): string {
  if (!data || data.length === 0) return "";
  const sourceKeys = Array.from(new Set(data.flatMap((row) => Object.keys(row))));
  const headers = sourceKeys.map((key) => (key === "assetId" ? "symbol" : key));

  const dataRows = data.map((row) =>
    sourceKeys.map((key) => {
      const value = row[key];
      if (value === null || value === undefined) {
        return "";
      }
      if (typeof value === "object") {
        return JSON.stringify(value);
      }
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      return String(value);
    }),
  );

  const array = [headers].concat(dataRows);
  return array
    .map((row) => {
      return row
        .map((value) => {
          return typeof value === "string" ? JSON.stringify(value) : value;
        })
        .toString();
    })
    .join("\n");
}
