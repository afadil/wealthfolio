import { Button } from "@wealthfolio/ui/components/ui/button";
import { CsvMappingEditor } from "../components/mapping-editor";
import { ImportFormat, ActivityType, ImportMappingData, CsvRowData, Account } from "@/lib/types";
import { useMemo } from "react";
import { validateTickerSymbol } from "../utils/validation-utils";
import { useImportMapping } from "../hooks/use-import-mapping";
import { IMPORT_REQUIRED_FIELDS } from "@/lib/constants";
import { ImportAlert } from "../components/import-alert";
import { Icons } from "@wealthfolio/ui/components/ui/icons";

interface MappingStepProps {
  headers: string[];
  data: CsvRowData[];
  accounts: Account[];
  accountId?: string;
  onNext: (mapping: ImportMappingData) => void;
  onBack: () => void;
}

export const MappingStep = ({
  headers,
  data,
  accounts,
  accountId,
  onNext,
  onBack,
}: MappingStepProps) => {
  const {
    mapping,
    handleColumnMapping,
    handleActivityTypeMapping,
    handleSymbolMapping,
    handleAccountIdMapping,
    saveMapping,
    saveMappingMutation,
  } = useImportMapping({
    headers,
    accountId,
    defaultMapping: {
      accountId: accountId || "",
      name: "",
      fieldMappings: {},
      activityMappings: {},
      symbolMappings: {},
      accountMappings: {},
    },
    onSaveSuccess: (savedMapping) => {
      onNext(savedMapping);
    },
  });

  if (!data) {
    return (
      <ImportAlert
        variant="destructive"
        title="No CSV data available"
        description="Please go back and upload a valid file."
        icon={Icons.AlertCircle}
      />
    );
  }

  // Check if all required fields are mapped
  const requiredFieldsMapped = IMPORT_REQUIRED_FIELDS.every(
    (field) => mapping.fieldMappings[field] && headers.includes(mapping.fieldMappings[field]),
  );

  // Count how many fields are mapped
  const mappedFieldsCount = Object.entries(mapping.fieldMappings).filter(
    ([_, headerName]) => headerName && headers.includes(headerName),
  ).length;
  const totalFields = Object.values(ImportFormat).length;

  // For direct CsvRowData access
  const getMappedValue = (row: CsvRowData, field: ImportFormat): string => {
    const headerName = mapping.fieldMappings[field] || "";
    if (!headerName) return "";
    return row[headerName] || "";
  };

  // Symbols validation
  const distinctSymbols = useMemo(() => {
    return Array.from(new Set(data.map((row) => getMappedValue(row, ImportFormat.SYMBOL)))).filter(
      Boolean,
    );
  }, [data, mapping.fieldMappings]);

  const invalidSymbols = useMemo(() => {
    return distinctSymbols.filter((symbol) => !validateTickerSymbol(symbol));
  }, [distinctSymbols]);

  // Account ID mappings
  const distinctAccountIds = useMemo(() => {
    if (!mapping.fieldMappings[ImportFormat.ACCOUNT]) return [];
    return Array.from(new Set(data.map((row) => getMappedValue(row, ImportFormat.ACCOUNT)))).filter(
      Boolean,
    );
  }, [data, mapping.fieldMappings]);

  // Activity type mappings
  const { distinctActivityTypes } = useMemo(() => {
    const activityTypeMap = new Map<string, { row: CsvRowData; count: number }>();

    data.forEach((row) => {
      const csvType = getMappedValue(row, ImportFormat.ACTIVITY_TYPE);
      if (!csvType) return;

      // Normalize the csvType when storing
      const normalizedCsvType = csvType.trim();

      if (!activityTypeMap.has(normalizedCsvType)) {
        activityTypeMap.set(normalizedCsvType, {
          row,
          count: 1,
        });
      } else {
        const current = activityTypeMap.get(normalizedCsvType)!;
        activityTypeMap.set(normalizedCsvType, {
          ...current,
          count: current.count + 1,
        });
      }
    });

    return {
      distinctActivityTypes: Array.from(activityTypeMap.entries()).map(([type, data]) => ({
        csvType: type,
        row: data.row,
        count: data.count,
        appType: findAppTypeForCsvType(type, mapping.activityMappings),
      })),
    };
  }, [data, mapping.activityMappings, mapping.fieldMappings]);

  function findAppTypeForCsvType(
    csvType: string,
    mappings: Partial<Record<ActivityType, string[]>>,
  ): ActivityType | null {
    const normalizedCsvType = csvType.trim().toUpperCase();

    for (const [appType, csvTypes] of Object.entries(mappings)) {
      if (
        csvTypes?.some((mappedType) => {
          const normalizedMappedType = mappedType.trim().toUpperCase();
          return normalizedCsvType.startsWith(normalizedMappedType);
        })
      ) {
        return appType as ActivityType;
      }
    }
    return null;
  }

  // Count unmapped activities
  const activitiesToMapCount = useMemo(() => {
    return distinctActivityTypes.filter((activity) => !activity.appType).length;
  }, [distinctActivityTypes]);

  //  Count unmapped accounts
  const accountsToMapCount = useMemo(() => {
    if (!mapping.fieldMappings[ImportFormat.ACCOUNT]) return 0;

    const unmappedIds = new Set<string>();
    data.forEach((row) => {
      const accountId = getMappedValue(row, ImportFormat.ACCOUNT);
      if (accountId && !mapping.accountMappings?.[accountId.trim()]) {
        unmappedIds.add(accountId.trim());
      }
    });
    return unmappedIds.size;
  }, [data, mapping.fieldMappings, mapping.accountMappings, getMappedValue]);

  // Symbol mappings
  const symbolsToMapCount = useMemo(() => {
    const symbolsNeedingMapping = invalidSymbols.filter((symbol) => {
      // Check if any key in symbolMappings matches this symbol (case-insensitive)
      const normalizedSymbol = symbol.trim();
      return !Object.keys(mapping.symbolMappings).some(
        (mappedSymbol) => mappedSymbol.trim() === normalizedSymbol,
      );
    }).length;
    return symbolsNeedingMapping;
  }, [invalidSymbols, mapping.symbolMappings]);

  // Check if all mappings are complete
  const allMappingsComplete =
    requiredFieldsMapped &&
    activitiesToMapCount === 0 &&
    symbolsToMapCount === 0 &&
    (accountsToMapCount === 0 || !mapping.fieldMappings[ImportFormat.ACCOUNT]);

  const handleNextClick = () => {
    saveMapping();
  };

  return (
    <div className="m-0 flex h-full flex-col p-0">
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Fields mapping status */}
        <ImportAlert
          variant={requiredFieldsMapped ? "success" : "destructive"}
          size="sm"
          title="Fields"
          description={`${mappedFieldsCount} of ${totalFields} mapped`}
          icon={Icons.ListChecks}
          className="mb-0"
          rightIcon={requiredFieldsMapped ? Icons.CheckCircle : Icons.AlertCircle}
        />

        {/* Activities mapping status */}
        <ImportAlert
          variant={activitiesToMapCount === 0 ? "success" : "destructive"}
          size="sm"
          title="Activities"
          description={`${distinctActivityTypes.length - activitiesToMapCount} of ${distinctActivityTypes.length} mapped`}
          icon={Icons.Activity}
          className="mb-0"
          rightIcon={activitiesToMapCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
        />

        {/* Symbols mapping status */}
        <ImportAlert
          variant={symbolsToMapCount === 0 ? "success" : "destructive"}
          size="sm"
          title="Symbols"
          description={`${distinctSymbols.length - symbolsToMapCount} of ${distinctSymbols.length} mapped`}
          icon={Icons.Tag}
          className="mb-0"
          rightIcon={symbolsToMapCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
        />

        {/* Account ID mapping status */}
        {mapping.fieldMappings[ImportFormat.ACCOUNT] && (
          <ImportAlert
            variant={accountsToMapCount === 0 ? "success" : "destructive"}
            size="sm"
            title="Accounts"
            description={
              distinctAccountIds.length > 0
                ? `${distinctAccountIds.length - accountsToMapCount} of ${distinctAccountIds.length} mapped`
                : "No unmapped account IDs found"
            }
            icon={Icons.Wallet}
            className="mb-0"
            rightIcon={accountsToMapCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
          />
        )}
      </div>

      <CsvMappingEditor
        mapping={mapping}
        headers={headers}
        data={data}
        accounts={accounts}
        handleColumnMapping={handleColumnMapping}
        handleActivityTypeMapping={handleActivityTypeMapping}
        handleSymbolMapping={handleSymbolMapping}
        handleAccountIdMapping={handleAccountIdMapping}
        getMappedValue={getMappedValue}
        mappedFieldsCount={mappedFieldsCount}
        totalFields={totalFields}
        requiredFieldsMapped={requiredFieldsMapped}
        distinctAccountIds={distinctAccountIds}
      />

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <Icons.ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={handleNextClick}
          disabled={!allMappingsComplete || saveMappingMutation.isPending}
          className="min-w-[120px]"
        >
          {saveMappingMutation.isPending ? "Saving..." : "Next"}
          <Icons.ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
