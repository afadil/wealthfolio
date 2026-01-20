import { useState, useCallback, useEffect } from "react";
import { ImportFormat, ActivityType, ImportMappingData } from "@/lib/types";
import { ACTIVITY_TYPE_PREFIX_LENGTH } from "@/lib/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccountImportMapping, saveAccountImportMapping, logger } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

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

const initialMapping: ImportMappingData = {
  accountId: "",
  fieldMappings: {},
  activityMappings: {},
  symbolMappings: {},
  accountMappings: {},
};

interface UseImportMappingProps {
  defaultMapping?: ImportMappingData;
  headers?: string[];
  fetchedMapping?: ImportMappingData | null;
  accountId?: string;
  onSaveSuccess?: (mapping: ImportMappingData) => void;
}

export function useImportMapping({
  defaultMapping,
  headers,
  fetchedMapping,
  accountId,
  onSaveSuccess,
}: UseImportMappingProps = {}) {
  const [mapping, setMapping] = useState<ImportMappingData>(defaultMapping ?? initialMapping);
  const [hasInitializedFromHeaders, setHasInitializedFromHeaders] = useState(false);
  const queryClient = useQueryClient();

  // Fetch import mapping query
  const { data: fetchedMappingData, isLoading: isMappingLoading } = useQuery({
    queryKey: [QueryKeys.IMPORT_MAPPING, accountId],
    queryFn: () => (accountId ? getAccountImportMapping(accountId) : null),
    enabled: !!accountId,
  });

  // Save mapping mutation
  const saveMappingMutation = useMutation({
    mutationFn: saveAccountImportMapping,
    onSuccess: (savedMapping) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.IMPORT_MAPPING, accountId] });
      if (onSaveSuccess) {
        onSaveSuccess(savedMapping);
      }
    },
    onError: (error) => {
      logger.error(`Error saving import mapping: ${error}`);
      toast({
        title: "Error saving mapping",
        description: "There was a problem saving your import mapping.",
        variant: "destructive",
      });
    },
  });

  // Handle saving the mapping
  const saveMapping = useCallback(() => {
    if (accountId) {
      saveMappingMutation.mutate({ ...mapping, accountId });
    }
  }, [mapping, accountId, saveMappingMutation]);

  useEffect(() => {
    if (fetchedMappingData) {
      setMapping((prev) => ({
        ...prev,
        ...fetchedMappingData,
        fieldMappings: { ...prev.fieldMappings, ...(fetchedMappingData.fieldMappings || {}) },
        activityMappings: {
          ...prev.activityMappings,
          ...(fetchedMappingData.activityMappings || {}),
        },
        symbolMappings: { ...prev.symbolMappings, ...(fetchedMappingData.symbolMappings || {}) },
        accountMappings: { ...prev.accountMappings, ...(fetchedMappingData.accountMappings || {}) },
      }));
      setHasInitializedFromHeaders(false);
    }
  }, [fetchedMappingData]);

  useEffect(() => {
    if (headers && headers.length > 0 && !hasInitializedFromHeaders && !fetchedMapping) {
      const initialFieldMapping = initializeColumnMapping(headers);
      setMapping((prev) => ({
        ...prev,
        fieldMappings: {
          ...initialFieldMapping,
          ...prev.fieldMappings,
        },
      }));
      setHasInitializedFromHeaders(true);
    }
    if (!headers || headers.length === 0) {
      setHasInitializedFromHeaders(false);
    }
  }, [headers, hasInitializedFromHeaders, fetchedMapping]);

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
        Object.keys(updatedMappings).forEach((key) => {
          updatedMappings[key] = (updatedMappings[key] ?? []).filter(
            (type) => type.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH) !== compareValue,
          );
        });
        if (!updatedMappings[activityType]) {
          updatedMappings[activityType] = [];
        }
        if (!updatedMappings[activityType]?.includes(compareValue)) {
          updatedMappings[activityType]?.push(compareValue);
        }
        return { ...prev, activityMappings: updatedMappings };
      });
    },
    [],
  );

  const handleSymbolMapping = useCallback((csvSymbol: string, newSymbol: string) => {
    setMapping((prev) => ({
      ...prev,
      symbolMappings: {
        ...prev.symbolMappings,
        [csvSymbol.trim()]: newSymbol.trim(),
      },
    }));
  }, []);

  const handleAccountIdMapping = useCallback((csvAccountId: string, accountId: string) => {
    setMapping((prev) => {
      const updatedMappings = { ...prev.accountMappings };

      if (accountId.trim() === "") {
        // Remove mapping if accountId is empty
        delete updatedMappings[csvAccountId.trim()];
      } else {
        // Add or update mapping
        updatedMappings[csvAccountId.trim()] = accountId.trim();
      }
      return {
        ...prev,
        accountMappings: updatedMappings,
      };
    });
  }, []);

  return {
    mapping,
    updateMapping,
    handleColumnMapping,
    handleActivityTypeMapping,
    handleSymbolMapping,
    handleAccountIdMapping,
    saveMapping,
    isMappingLoading,
    saveMappingMutation,
  };
}
