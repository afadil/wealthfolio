import { useState, useCallback } from 'react';
import { ImportFormat, ActivityType, ImportFormSchema } from '@/lib/types';
import { ACTIVITY_TYPE_PREFIX_LENGTH } from '@/lib/types';

export function useImportMapping(form: any) {
  const [mapping, setMapping] = useState<ImportFormSchema['mapping']>({
    columns: {} as Record<ImportFormat, string>,
    activityTypes: {} as Partial<Record<ActivityType, string[]>>,
    symbolMappings: {} as Record<string, string>,
  });

  const handleColumnMapping = (field: ImportFormat, value: string) => {
    const trimmedValue = value.trim();
    form.setValue('mapping.columns', {
      ...form.getValues('mapping.columns'),
      [field]: trimmedValue,
    } as Record<ImportFormat, string>);
    setMapping((prev) => ({ ...prev, columns: { ...prev.columns, [field]: trimmedValue } }));
  };

  const handleActivityTypeMapping = useCallback(
    (csvActivity: string, activityType: ActivityType) => {
      const trimmedCsvType = csvActivity.trim().toUpperCase();
      const updatedActivityTypes = {
        ...form.getValues('mapping.activityTypes'),
      };

      // Initialize arrays
      Object.keys(updatedActivityTypes).forEach((key) => {
        if (!Array.isArray(updatedActivityTypes[key as ActivityType])) {
          updatedActivityTypes[key as ActivityType] = [];
        }
      });

      // Remove existing mappings
      Object.keys(updatedActivityTypes).forEach((key) => {
        const compareValue = trimmedCsvType.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH);
        updatedActivityTypes[key as ActivityType] = updatedActivityTypes[
          key as ActivityType
        ]?.filter((type: string) => {
          const mappedValue = type.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH);
          return mappedValue !== compareValue;
        });
      });

      // Add new mapping
      if (!updatedActivityTypes[activityType]) {
        updatedActivityTypes[activityType] = [];
      }
      const valueToStore = trimmedCsvType.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH);
      updatedActivityTypes[activityType]?.push(valueToStore);

      form.setValue('mapping.activityTypes', updatedActivityTypes);
      setMapping((prev) => ({
        ...prev,
        activityTypes: updatedActivityTypes,
      }));
    },
    [form],
  );

  const handleSymbolMapping = useCallback(
    (csvSymbol: string, newSymbol: string) => {
      const trimmedNewSymbol = newSymbol.trim();
      const updatedSymbolMappings = {
        ...form.getValues('mapping.symbolMappings'),
        [csvSymbol]: trimmedNewSymbol,
      };

      form.setValue('mapping.symbolMappings', updatedSymbolMappings);
      setMapping((prev) => ({
        ...prev,
        symbolMappings: updatedSymbolMappings,
      }));
    },
    [form],
  );

  return {
    mapping,
    setMapping,
    handleColumnMapping,
    handleActivityTypeMapping,
    handleSymbolMapping,
  };
}
