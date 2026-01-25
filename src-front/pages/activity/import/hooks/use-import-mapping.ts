import { useState, useCallback, useEffect } from "react";
import { ImportFormat, ActivityType, ImportMappingData } from "@/lib/types";
import { ACTIVITY_TYPE_PREFIX_LENGTH } from "@/lib/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccountImportMapping, saveAccountImportMapping, logger } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

/**
 * Common column name aliases for each ImportFormat field.
 * Used for smart auto-mapping of CSV columns.
 * Includes variations: lowercase, camelCase, snake_case, with spaces
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  [ImportFormat.DATE]: [
    "date",
    "trade date",
    "tradedate",
    "transaction date",
    "transactiondate",
    "settlement date",
    "settlementdate",
    "settledate",
    "activity date",
    "activitydate",
    "time",
    "datetime",
    "timestamp",
    "executed at",
    "executedat",
    "trade_date",
    "transaction_date",
  ],
  [ImportFormat.ACTIVITY_TYPE]: [
    "activitytype",
    "activity type",
    "activity_type",
    "type",
    "action",
    "transaction",
    "transaction type",
    "transactiontype",
    "transaction_type",
    "trans type",
    "transtype",
    "trans_type",
    "activity",
    "operation",
    "trade type",
    "tradetype",
  ],
  [ImportFormat.SYMBOL]: [
    "symbol",
    "ticker",
    "tickersymbol",
    "ticker symbol",
    "ticker_symbol",
    "security",
    "securitysymbol",
    "security symbol",
    "stock",
    "stocksymbol",
    "stock symbol",
    "asset",
    "assetid",
    "asset id",
    "asset_id",
    "instrument",
    "isin",
    "cusip",
    "security id",
    "securityid",
  ],
  [ImportFormat.QUANTITY]: [
    "quantity",
    "qty",
    "shares",
    "units",
    "no of shares",
    "numberofshares",
    "number of shares",
    "share quantity",
    "sharequantity",
    "num shares",
    "numshares",
    "volume",
  ],
  [ImportFormat.UNIT_PRICE]: [
    "unitprice",
    "unit price",
    "unit_price",
    "price",
    "shareprice",
    "share price",
    "share_price",
    "cost per share",
    "costpershare",
    "price per share",
    "pricepershare",
    "avg price",
    "avgprice",
    "average price",
    "averageprice",
    "execution price",
    "executionprice",
    "trade price",
    "tradeprice",
    "cost basis",
    "costbasis",
  ],
  [ImportFormat.AMOUNT]: [
    "amount",
    "total",
    "totalamount",
    "total amount",
    "total_amount",
    "value",
    "totalvalue",
    "total value",
    "total_value",
    "netamount",
    "net amount",
    "net_amount",
    "grossamount",
    "gross amount",
    "gross_amount",
    "marketvalue",
    "market value",
    "market_value",
    "netvalue",
    "net value",
    "proceeds",
    "cost",
  ],
  [ImportFormat.CURRENCY]: [
    "currency",
    "currencycode",
    "currency code",
    "currency_code",
    "ccy",
    "curr",
    "tradecurrency",
    "trade currency",
    "trade_currency",
  ],
  [ImportFormat.FEE]: [
    "fee",
    "fees",
    "commission",
    "commissions",
    "tradingfee",
    "trading fee",
    "trading_fee",
    "transactionfee",
    "transaction fee",
    "transaction_fee",
    "brokerage",
    "brokeragefee",
    "brokerage fee",
    "brokerage_fee",
    "charges",
  ],
  [ImportFormat.ACCOUNT]: [
    "account",
    "accountid",
    "account id",
    "account_id",
    "accountname",
    "account name",
    "account_name",
    "portfolio",
    "portfolioid",
    "portfolio id",
    "accountnumber",
    "account number",
    "account_number",
    "acct",
  ],
  [ImportFormat.COMMENT]: [
    "comment",
    "comments",
    "note",
    "notes",
    "description",
    "memo",
    "remarks",
    "details",
  ],
  [ImportFormat.FX_RATE]: [
    "fxrate",
    "fx rate",
    "fx_rate",
    "exchangerate",
    "exchange rate",
    "exchange_rate",
    "forex rate",
    "forexrate",
    "conversion rate",
    "conversionrate",
  ],
  [ImportFormat.SUBTYPE]: [
    "subtype",
    "sub type",
    "sub_type",
    "variation",
    "subcategory",
    "sub category",
  ],
};

/**
 * Normalize a header string for comparison.
 * Removes special characters, converts to lowercase, and trims whitespace.
 */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[_\-\.]/g, " ") // Replace underscores, hyphens, dots with spaces
    .replace(/\s+/g, " "); // Collapse multiple spaces
}

/**
 * Initialize column mapping by matching CSV headers to ImportFormat fields.
 * Uses smart matching with common aliases and variations.
 */
export function initializeColumnMapping(
  headerRow: string[],
): Partial<Record<ImportFormat, string>> {
  const initialMapping: Partial<Record<ImportFormat, string>> = {};
  const usedHeaders = new Set<string>();

  // For each ImportFormat field, try to find a matching header
  for (const field of Object.values(ImportFormat)) {
    const aliases = COLUMN_ALIASES[field] ?? [field];

    // Find the first header that matches any alias
    const matchingHeader = headerRow.find((header) => {
      if (usedHeaders.has(header)) return false;

      const normalizedHeader = normalizeHeader(header);

      return aliases.some((alias) => {
        const normalizedAlias = normalizeHeader(alias);
        // Exact match only - avoid false positives from partial matches
        // e.g., "id" should not match "assetid"
        return normalizedHeader === normalizedAlias;
      });
    });

    if (matchingHeader) {
      initialMapping[field as ImportFormat] = matchingHeader;
      usedHeaders.add(matchingHeader);
    }
  }

  return initialMapping;
}

const initialMapping: ImportMappingData = {
  accountId: "",
  name: "",
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

  // Handle saving the mapping (with optional parseConfig from context)
  const saveMapping = useCallback(
    (parseConfig?: Record<string, unknown>) => {
      if (accountId) {
        saveMappingMutation.mutate({
          ...mapping,
          accountId,
          ...(parseConfig && { parseConfig }),
        });
      }
    },
    [mapping, accountId, saveMappingMutation],
  );

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
