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
  const headers = Object.keys(data[0]);
  // Check if 'assetID' is present and replace it with 'symbol'
  const assetIDIndex = headers.indexOf("assetId");
  if (assetIDIndex !== -1) {
    headers[assetIDIndex] = "symbol";
  }
  const dataRows = data.map((row) => Object.values(row).map(String));
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
