import { useState, useCallback } from 'react';
import { ImportFormat, ActivityType, ImportMappingData } from '@/lib/types';
import { ACTIVITY_TYPE_PREFIX_LENGTH } from '@/lib/types';

const initialMapping: ImportMappingData = {
  accountId: '',
  fieldMappings: {},
  activityMappings: {},
  symbolMappings: {},
};

export function useImportMapping(defaultMapping?: ImportMappingData) {
  const [mapping, setMapping] = useState<ImportMappingData>(defaultMapping ?? initialMapping);

  const updateMapping = useCallback((updates: Partial<ImportMappingData>) => {
    setMapping((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleColumnMapping = useCallback((field: ImportFormat, value: string) => {
    setMapping((prev) => ({
      ...prev,
      fieldMappings: { ...prev.fieldMappings, [field]: value.trim() },
    }));
  }, []);

  const handleActivityTypeMapping = useCallback(
    (csvActivity: string, activityType: ActivityType) => {
      const trimmedCsvType = csvActivity.trim().toUpperCase();
      const compareValue = trimmedCsvType.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH);

      setMapping((prev) => {
        const updatedMappings = { ...prev.activityMappings };

        // Remove existing mappings for this CSV type
        Object.keys(updatedMappings).forEach((key) => {
          updatedMappings[key] = (updatedMappings[key] ?? []).filter(
            (type: string) => type.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH) !== compareValue,
          );
        });

        // Add new mapping
        if (!updatedMappings[activityType]) {
          updatedMappings[activityType] = [];
        }
        updatedMappings[activityType]?.push(compareValue);

        return {
          ...prev,
          activityMappings: updatedMappings,
        };
      });
    },
    [],
  );

  const handleSymbolMapping = useCallback((csvSymbol: string, newSymbol: string) => {
    setMapping((prev) => ({
      ...prev,
      symbolMappings: {
        ...prev.symbolMappings,
        [csvSymbol]: newSymbol.trim(),
      },
    }));
  }, []);

  return {
    mapping,
    updateMapping,
    handleColumnMapping,
    handleActivityTypeMapping,
    handleSymbolMapping,
  };
}
