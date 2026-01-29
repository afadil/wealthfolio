import { useMemo, useState, useCallback, useEffect } from "react";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  useImportContext,
  setDraftActivities,
  setDuplicates,
  updateDraft,
  bulkSkipDrafts,
  bulkUnskipDrafts,
  bulkSetCurrency,
  bulkSetAccount,
  type DraftActivity,
  type DraftActivityStatus,
} from "../context";
import { ImportReviewGrid, type ImportReviewFilter } from "../components/import-review-grid";
import { ImportAlert } from "../components/import-alert";
import {
  ActivityType,
  ImportFormat,
  ACTIVITY_SUBTYPES,
  SUBTYPES_BY_ACTIVITY_TYPE,
} from "@/lib/constants";
import { checkActivitiesImport, checkExistingDuplicates, logger } from "@/adapters";
import type { ActivityImport } from "@/lib/types";
import { computeIdempotencyKeys, type IdempotencyKeyInput } from "../utils/idempotency";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FilterStats {
  all: number;
  errors: number;
  warnings: number;
  duplicates: number;
  skipped: number;
  valid: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a numeric value from a string, handling various formats
 */
function parseNumericValue(
  value: string | undefined,
  decimalSeparator: string,
  thousandsSeparator: string,
): number | undefined {
  if (!value || value.trim() === "") return undefined;

  let normalized = value.trim();

  // Handle auto-detection or explicit separators
  if (thousandsSeparator !== "none" && thousandsSeparator !== "auto") {
    normalized = normalized.replace(new RegExp(`\\${thousandsSeparator}`, "g"), "");
  }

  if (decimalSeparator === "," || (decimalSeparator === "auto" && normalized.includes(","))) {
    // Check if comma is likely a decimal separator
    const commaMatch = /,(\d{1,2})$/.exec(normalized);
    if (commaMatch) {
      normalized = normalized.replace(",", ".");
    }
  }

  // Remove any remaining non-numeric characters except decimal point and minus
  normalized = normalized.replace(/[^\d.-]/g, "");

  const result = parseFloat(normalized);
  return isNaN(result) ? undefined : result;
}

/**
 * Parse a date value, handling various formats
 */
function parseDateValue(value: string | undefined, dateFormat: string): string {
  if (!value || value.trim() === "") return "";

  const trimmed = value.trim();

  // Try to parse and normalize to YYYY-MM-DD
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split("T")[0];
  }

  // Handle specific formats if auto-detect fails
  if (dateFormat === "DD/MM/YYYY" || dateFormat === "DD-MM-YYYY") {
    const parts = trimmed.split(/[/-]/);
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  if (dateFormat === "MM/DD/YYYY" || dateFormat === "MM-DD-YYYY") {
    const parts = trimmed.split(/[/-]/);
    if (parts.length === 3) {
      const [month, day, year] = parts;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  // Return as-is if we can't parse it
  return trimmed;
}

/**
 * Map a CSV activity type value to a Wealthfolio activity type
 */
function mapActivityType(
  csvValue: string | undefined,
  activityMappings: Record<string, string[]>,
): string | undefined {
  if (!csvValue) return undefined;

  const normalized = csvValue.trim().toUpperCase();

  for (const [activityType, csvValues] of Object.entries(activityMappings)) {
    if (
      csvValues?.some(
        (v) =>
          normalized === v.trim().toUpperCase() || normalized.startsWith(v.trim().toUpperCase()),
      )
    ) {
      return activityType;
    }
  }

  // Return the original value if no mapping found
  return csvValue.trim();
}

/**
 * Map a CSV symbol to a resolved symbol
 */
function mapSymbol(
  csvSymbol: string | undefined,
  symbolMappings: Record<string, string>,
): string | undefined {
  if (!csvSymbol) return undefined;

  const trimmed = csvSymbol.trim();
  return symbolMappings[trimmed] || trimmed;
}

/**
 * Validate a draft activity and return errors/warnings
 */
function validateDraft(draft: Partial<DraftActivity>): {
  status: DraftActivityStatus;
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
} {
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};

  // Required field validation
  if (!draft.activityDate) {
    errors.activityDate = ["Date is required"];
  }

  if (!draft.activityType) {
    errors.activityType = ["Activity type is required"];
  }

  if (!draft.currency) {
    errors.currency = ["Currency is required"];
  }

  if (!draft.accountId) {
    errors.accountId = ["Account is required"];
  }

  // Activity-type specific validation
  const activityType = draft.activityType?.toUpperCase();
  const subtype = draft.subtype?.toUpperCase();

  // Validate subtype is allowed for this activity type
  if (subtype && activityType) {
    const allowedSubtypes = SUBTYPES_BY_ACTIVITY_TYPE[activityType] || [];
    if (allowedSubtypes.length > 0 && !allowedSubtypes.includes(subtype)) {
      warnings.subtype = [`'${subtype}' is not a recognized subtype for ${activityType}`];
    }
  }

  // Trade activities (BUY/SELL)
  if (activityType === ActivityType.BUY || activityType === ActivityType.SELL) {
    if (!draft.symbol) {
      errors.symbol = ["Symbol is required for trade activities"];
    }
    if (draft.quantity === undefined || draft.quantity <= 0) {
      errors.quantity = ["Quantity must be greater than 0"];
    }
    if (draft.unitPrice === undefined || draft.unitPrice <= 0) {
      errors.unitPrice = ["Unit price must be greater than 0"];
    }
  }

  // DIVIDEND validation
  if (activityType === ActivityType.DIVIDEND) {
    if (!draft.symbol) {
      errors.symbol = ["Symbol is required for dividend activities"];
    }

    if (subtype === ACTIVITY_SUBTYPES.DRIP) {
      // DRIP: cash dividend → reinvested as BUY of same ticker
      // Needs: quantity (shares received), unit price (reinvest price)
      // Amount is optional (dividend cash amount)
      if (draft.quantity === undefined || draft.quantity <= 0) {
        errors.quantity = ["Quantity is required for DRIP (shares received)"];
      }
      if (draft.unitPrice === undefined || draft.unitPrice <= 0) {
        errors.unitPrice = ["Unit price is required for DRIP (reinvestment price)"];
      }
    } else if (subtype === ACTIVITY_SUBTYPES.DIVIDEND_IN_KIND) {
      // DIVIDEND_IN_KIND: dividend paid in asset (not cash)
      // Needs: symbol (received asset), quantity, unit price (FMV), amount (value)
      if (draft.quantity === undefined || draft.quantity <= 0) {
        errors.quantity = ["Quantity is required for dividend in kind (shares received)"];
      }
      if (draft.unitPrice === undefined || draft.unitPrice <= 0) {
        errors.unitPrice = ["Unit price is required for dividend in kind (FMV at receipt)"];
      }
      if (draft.amount === undefined || draft.amount === 0) {
        errors.amount = ["Amount is required for dividend in kind (value of shares)"];
      }
    } else {
      // Regular cash dividend - amount is required
      if (draft.amount === undefined || draft.amount === 0) {
        errors.amount = ["Amount is required for dividend activities"];
      }
    }
  }

  // INTEREST validation
  if (activityType === ActivityType.INTEREST) {
    // STAKING_REWARD - needs quantity (tokens received) and may have unit price
    if (subtype === ACTIVITY_SUBTYPES.STAKING_REWARD) {
      if (!draft.symbol) {
        errors.symbol = ["Symbol is required for staking rewards"];
      }
      if (draft.quantity === undefined || draft.quantity <= 0) {
        errors.quantity = ["Quantity is required for staking rewards (tokens received)"];
      }
      // Amount is optional for staking - can be calculated from quantity * price
      if (draft.amount === undefined && (draft.unitPrice === undefined || draft.unitPrice <= 0)) {
        warnings.amount = ["Either amount or unit price is recommended for staking rewards"];
      }
    } else {
      // Regular interest - amount is required
      if (draft.amount === undefined || draft.amount === 0) {
        errors.amount = ["Amount is required for interest activities"];
      }
    }
  }

  // DEPOSIT/WITHDRAWAL - amount is required
  if (activityType === ActivityType.DEPOSIT || activityType === ActivityType.WITHDRAWAL) {
    if (draft.amount === undefined || draft.amount === 0) {
      errors.amount = ["Amount is required for deposit/withdrawal activities"];
    }
  }

  // FEE validation - either fee or amount required
  if (activityType === ActivityType.FEE) {
    const hasFee = draft.fee !== undefined && draft.fee > 0;
    const hasAmount = draft.amount !== undefined && draft.amount > 0;
    if (!hasFee && !hasAmount) {
      errors.fee = ["Either fee or amount is required for fee activities"];
    }
  }

  // TAX validation - amount is required
  if (activityType === ActivityType.TAX) {
    const hasFee = draft.fee !== undefined && draft.fee > 0;
    const hasAmount = draft.amount !== undefined && draft.amount > 0;
    if (!hasFee && !hasAmount) {
      errors.amount = ["Amount or fee is required for tax activities"];
    }
  }

  // TRANSFER_IN/TRANSFER_OUT - amount or quantity required
  if (activityType === ActivityType.TRANSFER_IN || activityType === ActivityType.TRANSFER_OUT) {
    const hasAmount = draft.amount !== undefined && draft.amount > 0;
    const hasQuantity = draft.quantity !== undefined && draft.quantity > 0;
    if (!hasAmount && !hasQuantity) {
      errors.amount = ["Amount or quantity is required for transfer activities"];
    }
  }

  // SPLIT validation
  if (activityType === ActivityType.SPLIT) {
    if (!draft.symbol) {
      errors.symbol = ["Symbol is required for split activities"];
    }
    if (draft.quantity === undefined) {
      errors.quantity = ["Quantity (split ratio) is required for split activities"];
    }
  }

  // CREDIT validation
  if (activityType === ActivityType.CREDIT) {
    if (draft.amount === undefined || draft.amount === 0) {
      errors.amount = ["Amount is required for credit activities"];
    }
  }

  // Determine status
  const hasErrors = Object.keys(errors).length > 0;
  const hasWarnings = Object.keys(warnings).length > 0;

  let status: DraftActivityStatus = "valid";
  if (hasErrors) {
    status = "error";
  } else if (hasWarnings) {
    status = "warning";
  }

  return { status, errors, warnings };
}

/**
 * Create DraftActivity objects from parsed CSV data and mapping
 */
function createDraftActivities(
  parsedRows: string[][],
  headers: string[],
  mapping: {
    fieldMappings: Record<string, string>;
    activityMappings: Record<string, string[]>;
    symbolMappings: Record<string, string>;
    accountMappings: Record<string, string>;
  },
  parseConfig: {
    dateFormat: string;
    decimalSeparator: string;
    thousandsSeparator: string;
    defaultCurrency: string;
  },
  defaultAccountId: string,
): DraftActivity[] {
  const { fieldMappings, activityMappings, symbolMappings, accountMappings } = mapping;
  const { dateFormat, decimalSeparator, thousandsSeparator, defaultCurrency } = parseConfig;

  // Create header index lookup
  const headerIndex: Record<string, number> = {};
  headers.forEach((header, idx) => {
    headerIndex[header] = idx;
  });

  // Get column indices for each mapped field
  const getColumnValue = (row: string[], field: ImportFormat): string | undefined => {
    const csvHeader = fieldMappings[field];
    if (!csvHeader) return undefined;
    const idx = headerIndex[csvHeader];
    if (idx === undefined) return undefined;
    return row[idx];
  };

  return parsedRows.map((row, rowIndex): DraftActivity => {
    // Extract raw values from CSV
    const rawDate = getColumnValue(row, ImportFormat.DATE);
    const rawType = getColumnValue(row, ImportFormat.ACTIVITY_TYPE);
    const rawSymbol = getColumnValue(row, ImportFormat.SYMBOL);
    const rawQuantity = getColumnValue(row, ImportFormat.QUANTITY);
    const rawUnitPrice = getColumnValue(row, ImportFormat.UNIT_PRICE);
    const rawAmount = getColumnValue(row, ImportFormat.AMOUNT);
    const rawCurrency = getColumnValue(row, ImportFormat.CURRENCY);
    const rawFee = getColumnValue(row, ImportFormat.FEE);
    const rawComment = getColumnValue(row, ImportFormat.COMMENT);
    const rawAccount = getColumnValue(row, ImportFormat.ACCOUNT);
    const rawFxRate = getColumnValue(row, ImportFormat.FX_RATE);
    const rawSubtype = getColumnValue(row, ImportFormat.SUBTYPE);

    // Parse and normalize values
    const activityDate = parseDateValue(rawDate, dateFormat);
    const activityType = mapActivityType(rawType, activityMappings);
    const symbol = mapSymbol(rawSymbol, symbolMappings);
    const quantity = parseNumericValue(rawQuantity, decimalSeparator, thousandsSeparator);
    const unitPrice = parseNumericValue(rawUnitPrice, decimalSeparator, thousandsSeparator);
    const amount = parseNumericValue(rawAmount, decimalSeparator, thousandsSeparator);
    const currency = rawCurrency?.trim() || defaultCurrency;
    const fee = parseNumericValue(rawFee, decimalSeparator, thousandsSeparator);
    const comment = rawComment?.trim();
    const fxRate = parseNumericValue(rawFxRate, decimalSeparator, thousandsSeparator);
    const subtype = rawSubtype?.trim().toUpperCase() || undefined;

    // Resolve account ID: use CSV account mapping, or fall back to default
    let accountId = defaultAccountId;
    if (rawAccount?.trim()) {
      const mappedAccount = accountMappings[rawAccount.trim()];
      if (mappedAccount) {
        accountId = mappedAccount;
      } else if (rawAccount.trim()) {
        // Use raw account value if no mapping exists (might be an account ID already)
        accountId = rawAccount.trim();
      }
    }

    // Create draft object
    const draft: Partial<DraftActivity> = {
      rowIndex,
      rawRow: row,
      activityDate,
      activityType,
      symbol,
      quantity,
      unitPrice,
      amount,
      currency,
      fee,
      fxRate,
      subtype,
      accountId,
      comment,
      isEdited: false,
    };

    // Validate and get status
    const validation = validateDraft(draft);

    return {
      ...draft,
      status: validation.status,
      errors: validation.errors,
      warnings: validation.warnings,
    } as DraftActivity;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Stats Component
// ─────────────────────────────────────────────────────────────────────────────

interface FilterStatsProps {
  stats: FilterStats;
  currentFilter: ImportReviewFilter;
  onFilterChange: (filter: ImportReviewFilter) => void;
}

function FilterStatsBar({ stats, currentFilter, onFilterChange }: FilterStatsProps) {
  // Define filter configs - only show colored variants when count > 0
  const filters: {
    id: ImportReviewFilter;
    label: string;
    count: number;
    colorVariant: "default" | "destructive" | "secondary" | "outline";
  }[] = [
    { id: "all", label: "All", count: stats.all, colorVariant: "secondary" },
    { id: "errors", label: "Errors", count: stats.errors, colorVariant: "destructive" },
    { id: "warnings", label: "Warnings", count: stats.warnings, colorVariant: "secondary" },
    { id: "duplicates", label: "Duplicates", count: stats.duplicates, colorVariant: "secondary" },
    { id: "skipped", label: "Skipped", count: stats.skipped, colorVariant: "secondary" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => {
        // Use colored variant only when count > 0, otherwise use outline
        const variant =
          currentFilter === filter.id
            ? "default"
            : filter.count > 0
              ? filter.colorVariant
              : "outline";

        return (
          <Badge
            key={filter.id}
            variant={variant}
            className={`cursor-pointer transition-all ${
              currentFilter === filter.id ? "" : "opacity-70 hover:opacity-100"
            }`}
            onClick={() => onFilterChange(filter.id)}
          >
            {filter.label}: {filter.count}
          </Badge>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReviewStep() {
  const { state, dispatch } = useImportContext();
  const { parsedRows, headers, mapping, parseConfig, accountId, draftActivities } = state;

  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [filter, setFilter] = useState<ImportReviewFilter>("all");
  const [isValidating, setIsValidating] = useState(false);

  // Create draft activities and validate with backend when entering this step
  useEffect(() => {
    if (draftActivities.length === 0 && parsedRows.length > 0 && mapping) {
      const drafts = createDraftActivities(
        parsedRows,
        headers,
        {
          fieldMappings: mapping.fieldMappings,
          activityMappings: mapping.activityMappings,
          symbolMappings: mapping.symbolMappings,
          accountMappings: mapping.accountMappings || {},
        },
        {
          dateFormat: parseConfig.dateFormat,
          decimalSeparator: parseConfig.decimalSeparator,
          thousandsSeparator: parseConfig.thousandsSeparator,
          defaultCurrency: parseConfig.defaultCurrency,
        },
        accountId,
      );

      logger.debug(`Created ${drafts.length} draft activities with frontend validation`);

      // Log validation state for debugging
      const errorCount = drafts.filter((d) => d.status === "error").length;
      const validCount = drafts.filter((d) => d.status === "valid").length;
      logger.debug(`Frontend validation: ${validCount} valid, ${errorCount} errors`);
      if (errorCount > 0) {
        const firstError = drafts.find((d) => d.status === "error");
        logger.debug(`First error draft errors: ${JSON.stringify(firstError?.errors)}`);
      }

      // Run backend validation (dry run) to check symbols, currencies, etc.
      const validateWithBackend = async () => {
        setIsValidating(true);
        try {
          // Check if we have an account selected
          if (!accountId) {
            logger.warn(
              "No account selected - skipping backend validation. Frontend validation only.",
            );
            dispatch(setDraftActivities(drafts));
            return;
          }

          // Filter activities that have minimum required data for backend validation
          // Use state's accountId for all activities (not draft.accountId)
          const activitiesToValidate = drafts
            .filter((d) => d.status !== "skipped" && d.activityType)
            .map(
              (draft) =>
                ({
                  accountId: accountId, // Use the selected account from state
                  activityType: draft.activityType as ActivityImport["activityType"],
                  date: draft.activityDate || "",
                  symbol:
                    draft.symbol || "$CASH-" + (draft.currency || parseConfig.defaultCurrency),
                  quantity: draft.quantity ?? 0,
                  unitPrice: draft.unitPrice ?? 0,
                  amount: draft.amount ?? 0,
                  currency: draft.currency || parseConfig.defaultCurrency,
                  fee: draft.fee ?? 0,
                  isDraft: true,
                  isValid: draft.status === "valid" || draft.status === "warning",
                  lineNumber: draft.rowIndex + 1,
                  comment: draft.comment,
                }) satisfies Partial<ActivityImport>,
            ) as ActivityImport[];

          logger.info(
            `Backend validation: sending ${activitiesToValidate.length} activities to check_activities_import (dryRun=true)`,
          );

          if (activitiesToValidate.length > 0) {
            // Call backend with dryRun=true for read-only validation
            const validated = await checkActivitiesImport({
              accountId,
              activities: activitiesToValidate,
              dryRun: true,
            });

            logger.info(`Backend validation returned ${validated.length} results`);

            // Merge backend validation results back into drafts
            const updatedDrafts = drafts.map((draft) => {
              const backendResult = validated.find((v) => v.lineNumber === draft.rowIndex + 1);
              if (backendResult) {
                // Ensure errors are properly structured
                const backendErrors: Record<string, string[]> = {};
                if (backendResult.errors) {
                  for (const [key, value] of Object.entries(backendResult.errors)) {
                    backendErrors[key] = Array.isArray(value) ? value : [String(value)];
                  }
                }

                // Check isValid from backend
                if (!backendResult.isValid && Object.keys(backendErrors).length === 0) {
                  // Backend marked as invalid but no specific errors - add generic error
                  backendErrors.general = ["Validation failed"];
                }

                const mergedErrors = { ...draft.errors, ...backendErrors };
                const hasErrors = Object.keys(mergedErrors).length > 0;
                const hasWarnings = Object.keys(draft.warnings || {}).length > 0;

                // Update draft with backend results
                return {
                  ...draft,
                  accountId: accountId, // Ensure accountId is set from state
                  errors: mergedErrors,
                  symbolName: backendResult.symbolName,
                  exchangeMic: backendResult.exchangeMic,
                  status: hasErrors ? "error" : hasWarnings ? "warning" : "valid",
                } as DraftActivity;
              }
              // No backend result for this draft - keep frontend validation but update accountId
              return { ...draft, accountId: accountId } as DraftActivity;
            });

            // Check for duplicates after backend validation
            const draftsWithDuplicates = await checkForDuplicates(
              updatedDrafts,
              accountId,
              parseConfig.defaultCurrency,
              dispatch,
            );
            dispatch(setDraftActivities(draftsWithDuplicates));
          } else {
            logger.warn("No activities to validate with backend");
            // Still check for duplicates even without backend validation
            const draftsWithDuplicates = await checkForDuplicates(
              drafts,
              accountId,
              parseConfig.defaultCurrency,
              dispatch,
            );
            dispatch(setDraftActivities(draftsWithDuplicates));
          }
        } catch (error) {
          logger.error(`Backend validation failed: ${error}`);
          // Still set drafts with frontend validation even if backend validation fails
          dispatch(setDraftActivities(drafts));
        } finally {
          setIsValidating(false);
        }
      };

      validateWithBackend();
    }
  }, [parsedRows, headers, mapping, parseConfig, accountId, draftActivities.length, dispatch]);

  /**
   * Check for existing duplicates in the database
   */
  async function checkForDuplicates(
    drafts: DraftActivity[],
    accountId: string,
    defaultCurrency: string,
    dispatch: ReturnType<typeof useImportContext>["dispatch"],
  ): Promise<DraftActivity[]> {
    if (!accountId) {
      logger.warn("No account selected - skipping duplicate check");
      return drafts;
    }

    try {
      // Build idempotency key inputs from drafts
      const keyInputs: IdempotencyKeyInput[] = drafts
        .filter((d) => d.status !== "skipped" && d.activityType)
        .map((draft) => ({
          accountId: accountId,
          activityType: draft.activityType,
          activityDate: draft.activityDate,
          assetId: draft.symbol || undefined,
          quantity: draft.quantity,
          unitPrice: draft.unitPrice,
          amount: draft.amount,
          currency: draft.currency || defaultCurrency,
          description: draft.comment,
        }));

      if (keyInputs.length === 0) {
        return drafts;
      }

      // Compute idempotency keys
      logger.info(`Computing idempotency keys for ${keyInputs.length} activities`);
      const keyMap = await computeIdempotencyKeys(keyInputs);

      // Extract keys as array
      const idempotencyKeys = Array.from(keyMap.values());

      // Check for existing duplicates in the database
      logger.info(`Checking ${idempotencyKeys.length} keys for duplicates`);
      const duplicates = await checkExistingDuplicates(idempotencyKeys);
      const duplicateCount = Object.keys(duplicates).length;
      logger.info(`Found ${duplicateCount} duplicate activities`);

      // Store duplicates in context
      if (duplicateCount > 0) {
        dispatch(setDuplicates(duplicates));
      }

      // Build reverse map: rowIndex -> idempotencyKey
      const rowToKey = new Map<number, string>();
      let keyIndex = 0;
      for (const draft of drafts) {
        if (draft.status !== "skipped" && draft.activityType) {
          const key = keyMap.get(keyIndex);
          if (key) {
            rowToKey.set(draft.rowIndex, key);
          }
          keyIndex++;
        }
      }

      // Mark drafts as duplicates
      return drafts.map((draft) => {
        const key = rowToKey.get(draft.rowIndex);
        if (key && duplicates[key]) {
          return {
            ...draft,
            status: "duplicate" as DraftActivityStatus,
            duplicateOfId: duplicates[key],
          };
        }
        return draft;
      });
    } catch (error) {
      logger.error(`Duplicate check failed: ${error}`);
      return drafts;
    }
  }

  // Calculate filter stats
  const filterStats = useMemo<FilterStats>(() => {
    const stats: FilterStats = {
      all: draftActivities.length,
      errors: 0,
      warnings: 0,
      duplicates: 0,
      skipped: 0,
      valid: 0,
    };

    for (const draft of draftActivities) {
      switch (draft.status) {
        case "error":
          stats.errors++;
          break;
        case "warning":
          stats.warnings++;
          break;
        case "duplicate":
          stats.duplicates++;
          break;
        case "skipped":
          stats.skipped++;
          break;
        case "valid":
          stats.valid++;
          break;
      }
    }

    return stats;
  }, [draftActivities]);

  // Handlers
  const handleDraftUpdate = useCallback(
    (rowIndex: number, updates: Partial<DraftActivity>) => {
      // Find the current draft and merge with updates
      const currentDraft = draftActivities.find((d) => d.rowIndex === rowIndex);
      if (currentDraft) {
        const mergedDraft = { ...currentDraft, ...updates };
        // Re-validate the merged draft
        const validation = validateDraft(mergedDraft);
        // Don't override status if it was skipped or duplicate (unless they changed activity type)
        const shouldRevalidateStatus =
          currentDraft.status !== "skipped" && currentDraft.status !== "duplicate";
        dispatch(
          updateDraft(rowIndex, {
            ...updates,
            ...(shouldRevalidateStatus
              ? {
                  status: validation.status,
                  errors: validation.errors,
                  warnings: validation.warnings,
                }
              : {}),
          }),
        );
      } else {
        dispatch(updateDraft(rowIndex, updates));
      }
    },
    [dispatch, draftActivities],
  );

  const handleBulkSkip = useCallback(
    (rowIndexes: number[]) => {
      dispatch(bulkSkipDrafts(rowIndexes, "Skipped by user"));
      setSelectedRows([]);
    },
    [dispatch],
  );

  const handleBulkUnskip = useCallback(
    (rowIndexes: number[]) => {
      dispatch(bulkUnskipDrafts(rowIndexes));
      setSelectedRows([]);
    },
    [dispatch],
  );

  const handleBulkSetCurrency = useCallback(
    (rowIndexes: number[], currency: string) => {
      dispatch(bulkSetCurrency(rowIndexes, currency));
    },
    [dispatch],
  );

  const handleBulkSetAccount = useCallback(
    (rowIndexes: number[], newAccountId: string) => {
      dispatch(bulkSetAccount(rowIndexes, newAccountId));
    },
    [dispatch],
  );

  // Show loading state while drafts are being created or validated
  if ((draftActivities.length === 0 && parsedRows.length > 0) || isValidating) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Icons.Spinner className="text-primary h-8 w-8 animate-spin" />
        <p className="text-muted-foreground mt-4">
          {isValidating ? "Validating activities..." : "Processing activities..."}
        </p>
      </div>
    );
  }

  // Show error if no data
  if (parsedRows.length === 0) {
    return (
      <ImportAlert
        variant="destructive"
        title="No Data"
        description="No CSV data available. Please go back and upload a file."
      />
    );
  }

  // Show error if no mapping
  if (!mapping || Object.keys(mapping.fieldMappings).length === 0) {
    return (
      <ImportAlert
        variant="warning"
        title="Missing Mapping"
        description="Column mappings are not configured. Please go back and configure the mapping."
      />
    );
  }

  const validCount = filterStats.valid + filterStats.warnings;
  const hasErrors = filterStats.errors > 0;
  const hasWarnings = filterStats.warnings > 0;
  const hasIssues = hasErrors || hasWarnings;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary alert */}
      {hasIssues ? (
        <ImportAlert
          variant={hasErrors ? "destructive" : "warning"}
          title={`${validCount} of ${filterStats.all} activities ready to import`}
          description={`${filterStats.errors} errors, ${filterStats.warnings} warnings. Review and fix issues below, or skip problematic rows.`}
        />
      ) : (
        <ImportAlert
          variant="success"
          title={`All ${filterStats.all} activities are valid`}
          description="Your data is ready for import. You can still review and make adjustments if needed."
        />
      )}

      {/* Stats and filter */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold">Review Activities</h2>
          <FilterStatsBar stats={filterStats} currentFilter={filter} onFilterChange={setFilter} />
        </div>
        <ImportReviewGrid
          drafts={draftActivities}
          onDraftUpdate={handleDraftUpdate}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          filter={filter}
          onBulkSkip={handleBulkSkip}
          onBulkUnskip={handleBulkUnskip}
          onBulkSetCurrency={handleBulkSetCurrency}
          onBulkSetAccount={handleBulkSetAccount}
        />
      </div>
    </div>
  );
}

export default ReviewStep;
