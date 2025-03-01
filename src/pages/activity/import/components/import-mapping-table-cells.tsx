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
import { ImportFormat, ActivityType, ImportMappingData } from '@/lib/types';
import { ACTIVITY_TYPE_PREFIX_LENGTH } from '@/lib/types';
import TickerSearchInput from '@/components/ticker-search';
import { useState } from 'react';

const SKIP_FIELD_VALUE = '__skip__';
const REQUIRED_FIELDS = [
  ImportFormat.DATE,
  ImportFormat.ACTIVITY_TYPE,
  ImportFormat.SYMBOL,
  ImportFormat.QUANTITY,
  ImportFormat.UNIT_PRICE,
] as const;

type RequiredField = typeof REQUIRED_FIELDS[number];

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
  const isRequired = REQUIRED_FIELDS.includes(field as RequiredField);

  return (
    <div>
      <div className="flex items-center gap-2 pb-0 pt-2">
        <span className="font-bold">{field}</span>
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
          <SelectTrigger className="h-8 w-full py-2 text-sm font-normal text-muted-foreground">
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

function renderActivityTypeCell({
  csvType,
  appType,
  handleActivityTypeMapping,
}: {
  csvType: string;
  appType: ActivityType | null;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
}) {
  const trimmedCsvType = csvType.trim().toUpperCase();
  const displayValue =
    trimmedCsvType.length > 27 ? `${trimmedCsvType.substring(0, 27)}...` : trimmedCsvType;

  if (appType) {
    return (
      <div className="flex items-center gap-3">
        <div title={trimmedCsvType} className="flex items-center text-sm font-medium">
          {displayValue}
        </div>
        <div className="flex items-center gap-3">
          →
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="font-medium text-muted-foreground"
            onClick={() => {
              // Pass empty string as ActivityType to trigger removal of mapping
              handleActivityTypeMapping(trimmedCsvType, '' as ActivityType);
            }}
          >
            {appType}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      {displayValue.length > ACTIVITY_TYPE_PREFIX_LENGTH ? (
        <span className="text-destructive" title={trimmedCsvType}>
          {displayValue}
        </span>
      ) : (
        <Badge variant="destructive" title={trimmedCsvType}>
          {displayValue}
        </Badge>
      )}
      <Select
        onValueChange={(newType) =>
          handleActivityTypeMapping(trimmedCsvType, newType as ActivityType)
        }
        value=""
      >
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder="..." />
        </SelectTrigger>
        <SelectContent>
          {Object.values(ActivityType).map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function renderSymbolCell({
  csvSymbol,
  mappedSymbol,
  isInvalid,
  handleSymbolMapping,
}: {
  csvSymbol: string;
  mappedSymbol: string | undefined;
  isInvalid: boolean;
  handleSymbolMapping: (csvSymbol: string, newSymbol: string) => void;
}) {
  // Show edit button if symbol is mapped or valid
  if (mappedSymbol || !isInvalid) {
    return (
      <div className="flex items-center space-x-2">
        <span className={isInvalid ? 'text-destructive' : undefined}>{csvSymbol}</span>
        <Button
          type="button"
          variant="ghost"
          className="h-8 py-0 font-normal text-muted-foreground"
          onClick={() => {
            handleSymbolMapping(csvSymbol, '');
          }}
        >
          {mappedSymbol || csvSymbol}
        </Button>
      </div>
    );
  }

  // Show search input only for invalid symbols without mapping
  return (
    <div className="flex items-center space-x-2">
      <span className="text-destructive">{csvSymbol}</span>
      <TickerSearchInput
        defaultValue={mappedSymbol || ''}
        onSelectResult={(newSymbol) => handleSymbolMapping(csvSymbol, newSymbol)}
      />
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
  row: string[];
  mapping: ImportMappingData;
  getMappedValue: (row: string[], field: ImportFormat) => string;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
  handleSymbolMapping: (csvSymbol: string, newSymbol: string) => void;
  invalidSymbols: string[];
}) {
  const value = getMappedValue(row, field);

  if (field === ImportFormat.SYMBOL && mapping.fieldMappings[ImportFormat.SYMBOL]) {
    return renderSymbolCell({
      csvSymbol: value,
      mappedSymbol: mapping.symbolMappings?.[value],
      isInvalid: invalidSymbols.includes(value),
      handleSymbolMapping,
    });
  }

  if (field === ImportFormat.ACTIVITY_TYPE) {
    return renderActivityTypeCell({
      csvType: value,
      appType: findAppTypeForCsvType(value, mapping.activityMappings),
      handleActivityTypeMapping,
    });
  }

  return value;
}
