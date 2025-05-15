import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ImportFormat, ActivityType, ImportMappingData, CsvRowData, ImportRequiredField } from '@/lib/types';
import { ACTIVITY_TYPE_PREFIX_LENGTH } from '@/lib/types';
import TickerSearchInput from '@/components/ticker-search';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IMPORT_REQUIRED_FIELDS } from '@/lib/constants';
import { SearchableSelect } from '@/components/searchable-select';

const SKIP_FIELD_VALUE = '__skip__';

export function renderHeaderCell({
  field,
  mapping,
  headers,
  handleColumnMapping,
}: {
  field: ImportFormat;
  mapping: ImportMappingData;
  headers: string[];
  handleColumnMapping: (field: ImportFormat, value: string) => void;
}) {
  const [editingHeader, setEditingHeader] = useState<ImportFormat | null>(null);
  const mappedHeader = mapping.fieldMappings[field];
  const isMapped = typeof mappedHeader === 'string' && headers.includes(mappedHeader);
  const isEditing = editingHeader === field || !isMapped;
  const isRequired = IMPORT_REQUIRED_FIELDS.includes(field as ImportRequiredField);

  return (
    <div>
      <div className="flex items-center gap-2 pb-0 pt-2">
        <span className="font-bold">
          {field}
          {isRequired && !isMapped && <span className="text-amber-600 dark:text-amber-400 ml-1">*</span>}
        </span>
      </div>
      {isEditing ? (
        <Select
          onValueChange={(val) => {
            handleColumnMapping(field, val === SKIP_FIELD_VALUE ? '' : val);
            setEditingHeader(null);
          }}
          value={mappedHeader || SKIP_FIELD_VALUE}
          onOpenChange={(open) => !open && setEditingHeader(null)}
        >
          <SelectTrigger className="h-8 w-full py-2 font-normal text-muted-foreground">
            <SelectValue placeholder={isRequired ? 'Select column' : 'Optional'} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px] overflow-y-auto">
            {!isRequired && (
              <>
                <SelectItem value={SKIP_FIELD_VALUE}>
                  {field === ImportFormat.CURRENCY ? 'Account Currency' : 'Ignore'}
                </SelectItem>
                <SelectSeparator />
              </>
            )}
            {headers.map((header) => (
              <SelectItem key={header || '-'} value={header || '-'}>
                {header || '-'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="h-8 py-0 pl-0 font-normal text-muted-foreground"
          onClick={() => setEditingHeader(field)}
        >
          {mappedHeader || (isRequired ? 'Select column' : 'Ignore')}
        </Button>
      )}
    </div>
  );
}

function findAppTypeForCsvType(
  csvType: string,
  mappings: Record<string, string[]>,
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

interface ActivityTypeDisplayCellProps {
  csvType: string;
  appType: ActivityType | null;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
}
function ActivityTypeDisplayCell({
  csvType,
  appType,
  handleActivityTypeMapping,
}: ActivityTypeDisplayCellProps) {
  const trimmedCsvType = csvType.trim().toUpperCase();
  const displayValue =
    trimmedCsvType.length > 27 ? `${trimmedCsvType.substring(0, 27)}...` : trimmedCsvType;

  if (appType) {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 w-full">
        <div title={trimmedCsvType} className="font-medium truncate max-w-[180px]">
          {displayValue}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-muted-foreground">→</span>
          <Badge variant="secondary" className="transition-colors text-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="p-0 h-auto text-xs"
              onClick={() => {
                handleActivityTypeMapping(trimmedCsvType, '' as ActivityType);
              }}
            >
              {appType}
            </Button>
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center">
      <div className="max-w-[180px] truncate">
        {displayValue.length > ACTIVITY_TYPE_PREFIX_LENGTH ? (
          <span className="text-destructive" title={trimmedCsvType}>
            {displayValue}
          </span>
        ) : (
          <Badge variant="destructive" title={trimmedCsvType} className="whitespace-nowrap">
            {displayValue}
          </Badge>
        )}
      </div>
      <SearchableSelect
        options={Object.values(ActivityType).map((type) => ({
          value: type,
          label: type,
        }))}
        onValueChange={(newType) =>
          handleActivityTypeMapping(trimmedCsvType, newType as ActivityType)
        }
        placeholder="Map to..."
        value=""
      />
    </div>
  );
}

interface SymbolDisplayCellProps {
  csvSymbol: string;
  mappedSymbol: string | undefined;
  isInvalid: boolean;
  handleSymbolMapping: (csvSymbol: string, newSymbol: string) => void;
}
function SymbolDisplayCell({
  csvSymbol,
  mappedSymbol,
  isInvalid,
  handleSymbolMapping,
}: SymbolDisplayCellProps) {
  // Don't show anything if the symbol is empty/doesn't exist AND it's not invalid
  // We still want to show invalid empty symbols so they can be mapped
  if ((!csvSymbol || csvSymbol.trim() === '') && !isInvalid) {
    return null;
  }

  // Show edit button if symbol is mapped or valid
  if (mappedSymbol || !isInvalid) {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
        <span
          className={cn(
            "truncate max-w-[120px]",
            mappedSymbol ? "text-muted-foreground" : (isInvalid ? "text-destructive" : "text-muted-foreground")
          )}
          title={csvSymbol}
        >
          {csvSymbol || "-"}
        </span>
        <Badge variant="secondary" className="transition-colors text-xs">
          <Button
            type="button"
            variant="ghost"
            className="py-0 p-0 h-auto text-xs"
            onClick={() => {
              handleSymbolMapping(csvSymbol, '');
            }}
          >
            {mappedSymbol || csvSymbol || "-"}
          </Button>
        </Badge>
      </div>
    );
  }

  // Show search input only for invalid symbols without mapping
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
      <span
        className="text-destructive truncate max-w-[120px]"
        title={csvSymbol || "Empty symbol"}
      >
        {csvSymbol || "-"}
      </span>
      <div className="w-full sm:w-auto sm:min-w-[180px]">
        <TickerSearchInput
          defaultValue={mappedSymbol || ''}
          onSelectResult={(newSymbol) => handleSymbolMapping(csvSymbol, newSymbol)}
        />
      </div>
    </div>
  );
}

export function renderCell({
  field,
  row,
  mapping,
  getMappedValue,
  handleActivityTypeMapping,
  handleSymbolMapping,
  invalidSymbols,
}: {
  field: ImportFormat;
  row: CsvRowData;
  mapping: ImportMappingData;
  getMappedValue: (row: CsvRowData, field: ImportFormat) => string;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
  handleSymbolMapping: (csvSymbol: string, newSymbol: string) => void;
  invalidSymbols: string[];
}) {
  // Get the field's value from the row
  const value = getMappedValue(row, field);

  // Nothing to display if value is empty and not a special field
  if (!value || value.trim() === '') {
    // For symbol field, if it's invalid (e.g. empty but required), we might still want to render SymbolDisplayCell
    if (field === ImportFormat.SYMBOL && invalidSymbols.includes(value || '')) {
        // Fall through to SymbolDisplayCell rendering
    } else {
      return <span className="text-muted-foreground text-xs">-</span>;
    }
  }

  // Special fields with custom renderers
  if (field === ImportFormat.ACTIVITY_TYPE) {
    const appType = findAppTypeForCsvType(value, mapping.activityMappings);
    return (
      <ActivityTypeDisplayCell
        csvType={value}
        appType={appType}
        handleActivityTypeMapping={handleActivityTypeMapping}
      />
    );
  }

  if (field === ImportFormat.SYMBOL) {
    const isInvalid = invalidSymbols.includes(value || ''); // handle empty string case for invalidSymbols check
    const mappedSymbol = mapping.symbolMappings[value];
    return (
      <SymbolDisplayCell
        csvSymbol={value}
        mappedSymbol={mappedSymbol}
        isInvalid={isInvalid}
        handleSymbolMapping={handleSymbolMapping}
      />
    );
  }

  // Default renderer for other fields
  return <span className="text-muted-foreground text-xs">{value}</span>;
}
