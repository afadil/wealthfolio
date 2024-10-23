import { ImportFormat, ActivityType } from '@/lib/types';

export function validateCsvStructure(headerRow: string[]): boolean {
  return headerRow.length >= 3 && !headerRow.some((header) => header.trim() === '');
}

export function initializeColumnMapping(
  headerRow: string[],
): Partial<Record<ImportFormat, string>> {
  const initialMapping: Partial<Record<ImportFormat, string>> = {};
  Object.values(ImportFormat).forEach((field) => {
    const matchingHeader = headerRow.find(
      (header) => header.toLowerCase().trim() === field.toLowerCase(),
    );
    if (matchingHeader) {
      initialMapping[field] = matchingHeader;
    }
  });
  return initialMapping;
}

export function isImportMapComplete(
  headers: string[],
  mapping: {
    columns: Partial<Record<ImportFormat, string>>;
    activityTypes: Partial<Record<ActivityType, string[]>>;
  },
  csvData: string[][],
  getMappedValue: (row: string[], field: ImportFormat) => string,
): boolean {
  // Define required fields
  const requiredFields = [
    ImportFormat.Date,
    ImportFormat.ActivityType,
    ImportFormat.Symbol,
    ImportFormat.Quantity,
    ImportFormat.UnitPrice,
  ];

  // Updated to safely check for undefined values
  const columnsComplete = requiredFields.every(
    (field) => mapping.columns[field] && headers.includes(mapping.columns[field]!),
  );

  const uniqueCsvTypes = new Set(
    csvData
      .slice(1)
      .map((row) => getMappedValue(row, ImportFormat.ActivityType).trim().toUpperCase()),
  );

  const activityTypesComplete = Array.from(uniqueCsvTypes).every((csvType) => {
    return Object.values(mapping.activityTypes).some((mappedTypes) =>
      mappedTypes?.some((mappedType) => {
        const normalizedCsvType = csvType.trim().toUpperCase();
        const normalizedMappedType = mappedType.trim().toUpperCase();
        return normalizedCsvType.startsWith(normalizedMappedType);
      }),
    );
  });

  return columnsComplete && activityTypesComplete;
}
