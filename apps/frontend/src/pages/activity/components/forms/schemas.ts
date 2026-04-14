import { ActivityType, QuoteMode } from "@/lib/constants";
import i18n from "@/i18n/i18n";
import { z } from "zod";

// Asset metadata schema for custom assets
export const assetMetadataSchema = z
  .object({
    name: z.string().optional(),
    kind: z.string().optional(),
    exchangeMic: z.string().optional(),
  })
  .optional();

export function createBaseActivitySchema() {
  return z.object({
    id: z.string().optional(),
    accountId: z.string().min(1, { message: i18n.t("activity.validation.account_required") }),
    activityDate: z.union([z.date(), z.string().datetime()]).default(new Date()),
    currency: z.string().min(1, { message: i18n.t("activity.validation.currency_required") }),
    comment: z.string().optional().nullable(),
    subtype: z.string().optional().nullable(),
    fxRate: z.coerce
      .number()
      .positive({ message: i18n.t("activity.validation.fx_rate_positive") })
      .optional()
      .nullable(),
    exchangeMic: z.string().optional(),
    assetMetadata: assetMetadataSchema,
    symbolQuoteCcy: z.string().optional(),
    symbolInstrumentType: z.string().optional(),
  });
}

export function createTransferActivitySchema() {
  const baseActivitySchema = createBaseActivitySchema();
  return baseActivitySchema.extend({
    activityType: z.enum([ActivityType.TRANSFER_IN, ActivityType.TRANSFER_OUT]),
    transferMode: z.enum(["cash", "securities"]).default("cash"),
    isExternal: z.boolean().default(false),
    direction: z.enum(["in", "out"]).default("out"),
    toAccountId: z.string().optional(),
    amount: z.coerce.number().positive().optional().nullable(),
    fee: z.coerce.number().min(0).default(0).optional(),
    assetId: z.string().optional().nullable(),
    quantity: z.coerce.number().positive().optional().nullable(),
    unitPrice: z.coerce.number().positive().optional().nullable(),
    quoteMode: z.enum([QuoteMode.MARKET, QuoteMode.MANUAL]).default(QuoteMode.MARKET),
    metadata: z
      .object({
        flow: z.object({
          is_external: z.boolean(),
        }),
      })
      .optional(),
  });
}

export function createBulkHoldingRowSchema() {
  return z
    .object({
      id: z.string(),
      ticker: z.string().min(1, { message: i18n.t("activity.validation.ticker_required") }),
      name: z.string().optional(),
      sharesOwned: z.coerce
        .number({
          required_error: i18n.t("activity.validation.shares_owned_required"),
          invalid_type_error: i18n.t("activity.validation.shares_must_be_number"),
        })
        .positive({ message: i18n.t("activity.validation.shares_greater_than_zero") }),
      averageCost: z.coerce
        .number({
          required_error: i18n.t("activity.validation.average_cost_required"),
          invalid_type_error: i18n.t("activity.validation.average_cost_must_be_number"),
        })
        .positive({ message: i18n.t("activity.validation.average_cost_greater_than_zero") }),
      totalValue: z.number().optional(),
      assetId: z.string().optional(),
      quoteMode: z.enum([QuoteMode.MARKET, QuoteMode.MANUAL]).optional(),
      exchangeMic: z.string().optional(),
      symbolQuoteCcy: z.string().optional(),
      symbolInstrumentType: z.string().optional(),
      assetKind: z.string().optional(),
    })
    .superRefine((row, ctx) => {
      if ((row.quoteMode ?? QuoteMode.MARKET) === QuoteMode.MARKET && !row.symbolQuoteCcy?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ticker"],
          message: i18n.t("activity.validation.bulk_symbol_quote_currency_hint"),
        });
      }
    });
}

export function createBulkHoldingsFormSchema() {
  const baseActivitySchema = createBaseActivitySchema();
  const bulkHoldingRowSchema = createBulkHoldingRowSchema();
  return baseActivitySchema.extend({
    holdings: z.array(bulkHoldingRowSchema).min(1, { message: i18n.t("activity.validation.bulk_holdings_min_one") }),
  });
}

export function createTradeActivitySchema() {
  const baseActivitySchema = createBaseActivitySchema();
  return baseActivitySchema.extend({
    activityType: z.enum([ActivityType.BUY, ActivityType.SELL]),
    assetId: z.string().default(""),
    quantity: z.coerce
      .number({
        required_error: i18n.t("activity.validation.enter_valid_quantity"),
        invalid_type_error: i18n.t("activity.validation.quantity_must_be_number"),
      })
      .positive(),
    unitPrice: z.coerce
      .number({
        required_error: i18n.t("activity.validation.enter_valid_unit_price"),
        invalid_type_error: i18n.t("activity.validation.unit_price_must_be_number"),
      })
      .positive(),
    fee: z.coerce
      .number({
        required_error: i18n.t("activity.validation.enter_valid_fee"),
        invalid_type_error: i18n.t("activity.validation.fee_positive_invalid_type"),
      })
      .min(0, { message: i18n.t("activity.validation.fee_non_negative") })
      .default(0),
    quoteMode: z.enum([QuoteMode.MARKET, QuoteMode.MANUAL]).default(QuoteMode.MARKET),
    assetType: z.enum(["stock", "option", "bond"]).default("stock"),
    assetKind: z.string().optional(),
    underlyingSymbol: z.string().optional(),
    strikePrice: z.coerce.number().positive().optional(),
    expirationDate: z.string().optional(),
    optionType: z.enum(["CALL", "PUT"]).optional(),
    contractMultiplier: z.coerce.number().positive().default(100).optional(),
  });
}

export function createCashActivitySchema() {
  const baseActivitySchema = createBaseActivitySchema();
  return baseActivitySchema.extend({
    activityType: z.enum([ActivityType.DEPOSIT, ActivityType.WITHDRAWAL]),
    assetId: z.string().optional(),
    amount: z.coerce
      .number({
        required_error: i18n.t("activity.validation.enter_valid_amount"),
        invalid_type_error: i18n.t("activity.validation.amount_positive_invalid_type"),
      })
      .positive(),
    fee: z.coerce
      .number({
        invalid_type_error: i18n.t("activity.validation.fee_invalid_type_income"),
      })
      .min(0, { message: i18n.t("activity.validation.fee_non_negative") })
      .default(0)
      .optional(),
    quoteMode: z.enum([QuoteMode.MARKET, QuoteMode.MANUAL]).default(QuoteMode.MANUAL),
  });
}

export function createIncomeActivitySchema() {
  const baseActivitySchema = createBaseActivitySchema();
  return baseActivitySchema.extend({
    activityType: z.enum([ActivityType.DIVIDEND, ActivityType.INTEREST]),
    assetId: z.string().min(1, { message: i18n.t("activity.validation.select_security_short") }).optional(),
    quantity: z.coerce.number().default(0),
    unitPrice: z.coerce.number().positive().optional(),
    amount: z.coerce
      .number({
        required_error: i18n.t("activity.validation.enter_valid_amount"),
        invalid_type_error: i18n.t("activity.validation.amount_positive_invalid_type"),
      })
      .positive(),
    fee: z.coerce
      .number({
        invalid_type_error: i18n.t("activity.validation.fee_invalid_type_income"),
      })
      .min(0, { message: i18n.t("activity.validation.fee_non_negative") })
      .default(0)
      .optional(),
  });
}

export function createOtherActivitySchema() {
  const baseActivitySchema = createBaseActivitySchema();
  return baseActivitySchema.extend({
    activityType: z.enum([ActivityType.SPLIT, ActivityType.TAX, ActivityType.FEE]),
    assetId: z.string().min(1, { message: i18n.t("activity.validation.select_security_short") }).optional(),
    amount: z.coerce.number().min(0).optional(),
    quantity: z.coerce.number().nonnegative().optional(),
    fee: z.coerce
      .number({
        invalid_type_error: i18n.t("activity.validation.fee_invalid_type_income"),
      })
      .min(0, { message: i18n.t("activity.validation.fee_non_negative") })
      .default(0)
      .optional(),
  });
}

export function createNewActivitySchema() {
  return z
    .discriminatedUnion("activityType", [
      createTradeActivitySchema(),
      createCashActivitySchema(),
      createIncomeActivitySchema(),
      createOtherActivitySchema(),
      createTransferActivitySchema(),
    ])
    .and(
      z.object({
        showCurrencySelect: z.boolean().optional(),
      }),
    );
}

export type NewActivityFormValues = z.infer<ReturnType<typeof createNewActivitySchema>>;
