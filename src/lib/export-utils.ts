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
  const array = [Object.keys(data[0])].concat(data);
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
