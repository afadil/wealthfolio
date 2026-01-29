import { AccountSelector } from "@/components/account-selector";
import TickerSearchInput from "@/components/ticker-search";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { IMPORT_REQUIRED_FIELDS } from "@/lib/constants";
import {
  Account,
  ActivityType,
  CsvRowData,
  ImportFormat,
  ImportMappingData,
  ImportRequiredField,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Badge,
  SearchableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import { useState } from "react";

const SKIP_FIELD_VALUE = "__skip__";

export function MappingHeaderCell({
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
  const isMapped = typeof mappedHeader === "string" && headers.includes(mappedHeader);
  const isEditing = editingHeader === field || !isMapped;
  const isRequired = IMPORT_REQUIRED_FIELDS.includes(field as ImportRequiredField);

  return (
    <div>
      <div className="flex items-center gap-2 pt-2 pb-0">
        <span className="font-bold">
          {field}
          {isRequired && !isMapped && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">*</span>
          )}
        </span>
      </div>
      {isEditing ? (
        <Select
          onValueChange={(val) => {
            handleColumnMapping(field, val === SKIP_FIELD_VALUE ? "" : val);
            setEditingHeader(null);
          }}
          value={mappedHeader || SKIP_FIELD_VALUE}
          onOpenChange={(open) => !open && setEditingHeader(null)}
        >
          <SelectTrigger className="text-muted-foreground h-8 w-full py-2 font-normal">
            <SelectValue placeholder={isRequired ? "Select column" : "Optional"} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px] overflow-y-auto">
            {!isRequired && (
              <>
                <SelectItem value={SKIP_FIELD_VALUE}>
                  {field === ImportFormat.CURRENCY
                    ? "Account Currency"
                    : field === ImportFormat.ACCOUNT
                      ? "Default Account"
                      : "Ignore"}
                </SelectItem>
                <SelectSeparator />
              </>
            )}
            {headers.map((header) => (
              <SelectItem key={header || "-"} value={header || "-"}>
                {header || "-"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground h-8 py-0 pl-0 font-normal"
          onClick={() => setEditingHeader(field)}
        >
          {mappedHeader || (isRequired ? "Select column" : "Ignore")}
        </Button>
      )}
    </div>
  );
}

// Smart defaults for activity type mapping
const ACTIVITY_TYPE_SMART_DEFAULTS: Record<string, ActivityType> = {
  BUY: ActivityType.BUY,
  PURCHASE: ActivityType.BUY,
  BOUGHT: ActivityType.BUY,
  SELL: ActivityType.SELL,
  SOLD: ActivityType.SELL,
  DIVIDEND: ActivityType.DIVIDEND,
  DIV: ActivityType.DIVIDEND,
  DEPOSIT: ActivityType.DEPOSIT,
  WITHDRAWAL: ActivityType.WITHDRAWAL,
  WITHDRAW: ActivityType.WITHDRAWAL,
  FEE: ActivityType.FEE,
  TAX: ActivityType.TAX,
  TRANSFER_IN: ActivityType.TRANSFER_IN,
  TRANSFER: ActivityType.TRANSFER_IN,
  TRANSFER_OUT: ActivityType.TRANSFER_OUT,
  INTEREST: ActivityType.INTEREST,
  INT: ActivityType.INTEREST,
  SPLIT: ActivityType.SPLIT,
  CREDIT: ActivityType.CREDIT,
  ADJUSTMENT: ActivityType.ADJUSTMENT,
};

function findAppTypeForCsvType(
  csvType: string,
  mappings: Record<string, string[]>,
): ActivityType | null {
  const normalizedCsvType = csvType.trim().toUpperCase();

  // Check explicit mappings first
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

  // Check smart defaults - exact match
  if (ACTIVITY_TYPE_SMART_DEFAULTS[normalizedCsvType]) {
    return ACTIVITY_TYPE_SMART_DEFAULTS[normalizedCsvType];
  }

  // Check smart defaults - partial match
  for (const [key, value] of Object.entries(ACTIVITY_TYPE_SMART_DEFAULTS)) {
    if (normalizedCsvType.startsWith(key) || normalizedCsvType.includes(key)) {
      return value;
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
      <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div title={trimmedCsvType} className="max-w-[180px] truncate font-medium">
          {displayValue}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-muted-foreground">→</span>
          <Badge variant="secondary" className="text-xs transition-colors">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => {
                handleActivityTypeMapping(trimmedCsvType, "" as ActivityType);
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
    <div className="flex w-full items-center gap-2">
      <Badge
        variant="destructive"
        title={trimmedCsvType}
        className="shrink-0 text-xs whitespace-nowrap"
      >
        {displayValue}
      </Badge>
      <SearchableSelect
        options={Object.values(ActivityType).map((type) => ({
          value: type,
          label: type,
        }))}
        value=""
        onValueChange={(newType) =>
          handleActivityTypeMapping(trimmedCsvType, newType as ActivityType)
        }
        placeholder="Map to..."
        className="h-8 w-[140px]"
      />
    </div>
  );
}
interface AccountIdDisplayCellProps {
  csvAccountId: string;
  mappedAccountId: string | undefined;
  isInvalid: boolean;
  handleAccountIdMapping: (csvAccountId: string, accountId: string) => void;
}

function AccountIdDisplayCell({
  csvAccountId,
  mappedAccountId,
  isInvalid,
  handleAccountIdMapping,
}: AccountIdDisplayCellProps) {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  if (!csvAccountId || csvAccountId.trim() === "") {
    return null;
  }

  if (mappedAccountId) {
    return (
      <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center">
        <span className="text-muted-foreground max-w-[120px] truncate" title={csvAccountId}>
          {csvAccountId}
        </span>
        <Badge variant="secondary" className="text-xs transition-colors">
          <Button
            type="button"
            variant="ghost"
            className="h-auto p-0 py-0 text-xs"
            onClick={() => handleAccountIdMapping(csvAccountId, "")}
          >
            {mappedAccountId}
          </Button>
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center">
      <span
        className={cn(
          "max-w-[120px] truncate",
          isInvalid ? "text-destructive" : "text-muted-foreground",
        )}
        title={csvAccountId}
      >
        {csvAccountId}
      </span>
      <div className="w-full sm:w-auto sm:min-w-[180px]">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={(account) => {
            setSelectedAccount(account);
            handleAccountIdMapping(csvAccountId, account.id);
          }}
          variant="dropdown"
          buttonText="Select Account"
        />
      </div>
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
  if ((!csvSymbol || csvSymbol.trim() === "") && !isInvalid) {
    return null;
  }

  // Show edit button if symbol is mapped or valid
  if (mappedSymbol || !isInvalid) {
    return (
      <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center">
        <span
          className={cn(
            "max-w-[120px] truncate",
            mappedSymbol
              ? "text-muted-foreground"
              : isInvalid
                ? "text-destructive"
                : "text-muted-foreground",
          )}
          title={csvSymbol}
        >
          {csvSymbol || "-"}
        </span>
        <Badge variant="secondary" className="text-xs transition-colors">
          <Button
            type="button"
            variant="ghost"
            className="h-auto p-0 py-0 text-xs"
            onClick={() => {
              handleSymbolMapping(csvSymbol, "");
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
    <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center">
      <span className="text-destructive max-w-[120px] truncate" title={csvSymbol || "Empty symbol"}>
        {csvSymbol || "-"}
      </span>
      <div className="w-full sm:w-auto sm:min-w-[180px]">
        <TickerSearchInput
          defaultValue={mappedSymbol || ""}
          onSelectResult={(newSymbol, _searchResult) => handleSymbolMapping(csvSymbol, newSymbol)}
        />
      </div>
    </div>
  );
}

export function MappingCell({
  field,
  row,
  mapping,
  accounts,
  getMappedValue,
  handleActivityTypeMapping,
  handleSymbolMapping,
  handleAccountIdMapping,
  invalidSymbols,
  invalidAccounts,
}: {
  field: ImportFormat;
  row: CsvRowData;
  mapping: ImportMappingData;
  accounts: Account[];
  getMappedValue: (row: CsvRowData, field: ImportFormat) => string;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
  handleSymbolMapping: (csvSymbol: string, newSymbol: string) => void;
  handleAccountIdMapping?: (csvAccountId: string, accountId: string) => void;
  invalidSymbols: string[];
  invalidAccounts: string[];
}) {
  // Get the field's value from the row
  const value = getMappedValue(row, field);

  // Nothing to display if value is empty and not a special field
  if (!value || value.trim() === "") {
    // For symbol field, if it's invalid (e.g. empty but required), we might still want to render SymbolDisplayCell
    if (field === ImportFormat.SYMBOL && invalidSymbols.includes(value || "")) {
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
    const isInvalid = invalidSymbols.includes(value || ""); // handle empty string case for invalidSymbols check
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

  if (field === ImportFormat.ACCOUNT) {
    const isInvalid = invalidAccounts.includes(value || "");
    const mappedAccountId = mapping.accountMappings?.[value];
    const account = accounts.find((acc) => acc.id === mappedAccountId);
    return (
      <AccountIdDisplayCell
        csvAccountId={value}
        mappedAccountId={account?.name}
        isInvalid={isInvalid}
        handleAccountIdMapping={handleAccountIdMapping!}
      />
    );
  }

  // Default renderer for other fields
  return <span className="text-muted-foreground text-xs">{value}</span>;
}
