import { ExportedFileFormat } from '@/lib/types';

export function formatData(data: any, format: ExportedFileFormat): string {
  if (!data || data.length === 0) return '';
  if (format === 'CSV') {
    return convertToCSV(data);
  } else if (format === 'JSON') {
    return JSON.stringify(data, null, 2);
  }
  return '';
}

function convertToCSV(data: any) {
  if (!data || data.length === 0) return '';
  let headers = Object.keys(data[0]);
  // Check if 'assetID' is present and replace it with 'symbol'
  const assetIDIndex = headers.indexOf('assetId');
  if (assetIDIndex !== -1) {
    headers[assetIDIndex] = 'symbol';
  }
  const array = [headers].concat(data);
  return array
    .map((row) => {
      return Object.values(row)
        .map((value) => {
          return typeof value === 'string' ? JSON.stringify(value) : value;
        })
        .toString();
    })
    .join('\n');
}
