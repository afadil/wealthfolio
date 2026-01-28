import * as z from "zod";
import { ActivityType, activityTypeSchema, accountTypeSchema } from "./constants";
import { tryParseDate } from "./utils";
import {
  isCashActivity,
  isIncomeActivity,
  isCashTransfer,
  isTradeActivity,
  isFeeActivity,
  isSplitActivity,
} from "./activity-utils";

/**
 * Configuration for CSV parsing (delimiter, date format, etc.)
 */
export const parseConfigSchema = z.object({
  /** Whether the CSV has a header row */
  hasHeaderRow: z.boolean().optional(),
  /** Index of the header row (0-based) */
  headerRowIndex: z.number().optional(),
  /** Column delimiter: ",", ";", "\t", or "auto" */
  delimiter: z.string().optional(),
  /** Quote character for fields */
  quoteChar: z.string().optional(),
  /** Number of rows to skip at the top (after header) */
  skipTopRows: z.number().optional(),
  /** Number of rows to skip at the bottom */
  skipBottomRows: z.number().optional(),
  /** Whether to skip empty rows */
  skipEmptyRows: z.boolean().optional(),
  /** Date format: "auto", "YYYY-MM-DD", "DD/MM/YYYY", etc. */
  dateFormat: z.string().optional(),
  /** Decimal separator: "auto", ".", or "," */
  decimalSeparator: z.string().optional(),
  /** Thousands separator: "auto", ",", ".", " ", or "none" */
  thousandsSeparator: z.string().optional(),
  /** Default currency to use when not specified in CSV */
  defaultCurrency: z.string().optional(),
});

export const importMappingSchema = z.object({
  accountId: z.string(),
  name: z.string().optional().default(""),
  fieldMappings: z.record(z.string(), z.string()).optional().default({}),
  activityMappings: z.record(z.string(), z.array(z.string())).optional().default({}),
  symbolMappings: z.record(z.string(), z.string()).optional().default({}),
  accountMappings: z.record(z.string(), z.string()).optional().default({}),
  /** CSV parsing configuration */
  parseConfig: parseConfigSchema.optional(),
});

export const trackingModeSchema = z.enum(["TRANSACTIONS", "HOLDINGS", "NOT_SET"]);

export const newAccountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .min(2, {
      message: "Name must be at least 2 characters.",
    })
    .max(50, {
      message: "Name must not be longer than 50 characters.",
    }),
  group: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  accountType: accountTypeSchema,
  currency: z.string({ required_error: "Please select a currency." }),
  trackingMode: trackingModeSchema.optional().default("TRANSACTIONS"),
  meta: z.string().optional(),
});

export const newGoalSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string(),
  description: z.string().optional(),
  targetAmount: z.coerce
    .number({
      required_error: "Please enter a valid target amount.",
      invalid_type_error: "Target amount must be a positive number.",
    })
    .min(0, { message: "Target amount must be a positive number." }),
  yearlyContribution: z.number().optional(),
  deadline: z.date().optional(),
  isAchieved: z.boolean().optional(),
});

export const importActivitySchema = z
  .object({
    id: z.string().uuid().optional(),
    accountId: z.string().min(1, { message: "Please select an account." }),
    currency: z.string().optional(),
    activityType: activityTypeSchema,
    date: z
      .union([
        z.date(),
        z.string().refine((val) => tryParseDate(val) !== null, {
          message: "Invalid date format",
        }),
      ])
      .optional(),
    symbol: z
      .string()
      .min(1, { message: "Symbol is required" })
      .refine((val) => /^(\$CASH-[A-Z]{3}|[A-Z0-9]{1,10}([.-][A-Z0-9]+){0,2})$/.test(val.trim()), {
        message: "Invalid symbol format",
      }),
    amount: z.coerce
      .number({
        required_error: "Should be a valid amount.",
        invalid_type_error: "Amount must be a number.",
      })
      .optional(),
    quantity: z.coerce
      .number({
        required_error: "Please enter a valid quantity.",
        invalid_type_error: "Quantity must be a number.",
      })
      .min(0, { message: "Quantity must be a non-negative number." })
      .optional(),
    unitPrice: z.coerce
      .number({
        required_error: "Please enter a valid price.",
        invalid_type_error: "Price must be a non-negative number.",
      })
      .min(0, { message: "Price must be a non-negative number." })
      .optional(),
    fee: z.coerce
      .number({
        required_error: "Please enter a valid fee.",
        invalid_type_error: "Fee must be a positive number.",
      })
      .min(0, { message: "Fee must be a non-negative number." })
      .optional(),
    accountName: z.string().optional(),
    symbolName: z.string().optional(),
    /** Resolved exchange MIC for the symbol (populated during validation) */
    exchangeMic: z.string().optional(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
    isValid: z.boolean().default(false),
    lineNumber: z.number().optional(),
    isDraft: z.boolean(),
    comment: z.string().optional(),
    fxRate: z.coerce.number().positive().optional(),
    subtype: z.string().optional(),
  })
  .refine(
    (data) => {
      // For cash activities, income activities or cash transfers, either amount or both quantity and unit price must be provided
      // Exclude FEE activities as they have their own validation rule
      const isCashOrIncomeActivity =
        (isCashActivity(data.activityType as string) && data.activityType !== ActivityType.FEE) ||
        isIncomeActivity(data.activityType as string) ||
        (data.symbol && isCashTransfer(data.activityType as string, data.symbol));

      if (isCashOrIncomeActivity) {
        const hasAmount = data.amount !== undefined && data.amount !== 0;
        const hasQuantity = data.quantity !== undefined && data.quantity !== 0;
        const hasUnitPrice = data.unitPrice !== undefined && data.unitPrice !== 0;

        // For cash activities, at least one of: amount, quantity, or unit price must be specified
        return hasAmount || hasQuantity || hasUnitPrice;
      }

      return true;
    },
    {
      message: "Cash activities require at least one of: amount, quantity, or unit price",
      path: ["amount"],
    },
  )
  .refine(
    (data) => {
      // Fee activity validations
      if (data.activityType === ActivityType.FEE) {
        const hasFee = data.fee !== undefined && data.fee !== 0;
        const hasAmount = data.amount !== undefined && data.amount !== 0;

        // For fee activities, at least one of: fee or amount must be specified
        return hasFee || hasAmount;
      }
      return true;
    },
    {
      message: "Fee activities require either fee or amount",
      path: ["fee"],
    },
  )
  .refine(
    (data) => {
      // Trade activity unit price validations
      if (isTradeActivity(data.activityType as string)) {
        return data.unitPrice !== undefined && data.unitPrice > 0;
      }
      return true;
    },
    {
      message: "Unit price must be positive for buy/sell activities",
      path: ["unitPrice"],
    },
  )
  .refine(
    (data) => {
      // Non-cash, non-trade activities need positive quantity
      const isNonCashNonTradeActivity =
        !isCashActivity(data.activityType as string) &&
        !isIncomeActivity(data.activityType as string) &&
        !(data.symbol && isCashTransfer(data.activityType as string, data.symbol)) &&
        !isTradeActivity(data.activityType as string) &&
        !isFeeActivity(data.activityType as string) &&
        !isSplitActivity(data.activityType as string);

      if (isNonCashNonTradeActivity) {
        return data.quantity !== undefined && data.quantity > 0;
      }
      return true;
    },
    {
      message: "Quantity must be positive for non-cash activities",
      path: ["quantity"],
    },
  );

export const newContributionLimitSchema = z.object({
  id: z.string().optional(),
  groupName: z.string().min(1, "Group name is required"),
  contributionYear: z.number().int().min(1900, "Invalid year"),
  limitAmount: z.coerce
    .number({
      required_error: "Please enter a valid limit amount.",
      invalid_type_error: "Limit amount must be a positive number.",
    })
    .min(0, { message: "Price must be a non-negative number." }),
  accountIds: z.string().nullable().optional(),
  startDate: z.union([z.date(), z.string().datetime(), z.null()]).optional(),
  endDate: z.union([z.date(), z.string().datetime(), z.null()]).optional(),
});
