import { z } from "zod";
import { ActivityType, DataSource } from "@/lib/constants";

export const baseActivitySchema = z.object({
  id: z.string().uuid().optional(),
  accountId: z.string().min(1, { message: "Please select an account." }),
  activityDate: z.union([z.date(), z.string().datetime()]).default(new Date()),
  currency: z.string().optional(),
  comment: z.string().optional().nullable(),
  isDraft: z.boolean().optional().default(false),
});

export const holdingsActivitySchema = baseActivitySchema.extend({
  activityType: z.enum([ActivityType.ADD_HOLDING, ActivityType.REMOVE_HOLDING]),
  assetId: z.string().min(1, { message: "Please select a security" }),
  quantity: z.coerce
    .number({
      required_error: "Please enter a valid quantity.",
      invalid_type_error: "Quantity must be a number.",
    })
    .positive(),
  unitPrice: z.coerce
    .number({
      required_error: "Please enter a valid average cost.",
      invalid_type_error: "Average cost must be a number.",
    })
    .positive(),
  assetDataSource: z.enum([DataSource.YAHOO, DataSource.MANUAL]).default(DataSource.YAHOO),
});

export const bulkHoldingRowSchema = z.object({
  id: z.string(),
  ticker: z.string().min(1, { message: "Ticker is required" }),
  name: z.string().optional(),
  sharesOwned: z.coerce
    .number({
      required_error: "Shares owned is required.",
      invalid_type_error: "Shares must be a number.",
    })
    .positive({ message: "Shares must be greater than 0" }),
  averageCost: z.coerce
    .number({
      required_error: "Average cost is required.",
      invalid_type_error: "Average cost must be a number.",
    })
    .positive({ message: "Average cost must be greater than 0" }),
  totalValue: z.number().optional(),
  assetId: z.string().optional(),
});

export const bulkHoldingsFormSchema = baseActivitySchema.extend({
  holdings: z.array(bulkHoldingRowSchema).min(1, { message: "At least one holding is required" }),
});

export const tradeActivitySchema = baseActivitySchema.extend({
  activityType: z.enum([ActivityType.BUY, ActivityType.SELL]),
  assetId: z.string().min(1, { message: "Please select a security" }),
  quantity: z.coerce
    .number({
      required_error: "Please enter a valid quantity.",
      invalid_type_error: "Quantity must be a number.",
    })
    .positive(),
  unitPrice: z.coerce
    .number({
      required_error: "Please enter a valid unit price.",
      invalid_type_error: "Unit price must be a number.",
    })
    .positive(),
  fee: z.coerce
    .number({
      required_error: "Please enter a valid fee.",
      invalid_type_error: "Fee must be a positive number.",
    })
    .min(0, { message: "Fee must be a non-negative number." })
    .default(0),
  assetDataSource: z.enum([DataSource.YAHOO, DataSource.MANUAL]).default(DataSource.YAHOO),
});

export const cashActivitySchema = baseActivitySchema.extend({
  activityType: z.enum([
    ActivityType.DEPOSIT,
    ActivityType.WITHDRAWAL,
    ActivityType.TRANSFER_IN,
    ActivityType.TRANSFER_OUT,
  ]),
  assetId: z.string().optional(),
  amount: z.coerce
    .number({
      required_error: "Please enter a valid amount.",
      invalid_type_error: "Amount must be a positive number.",
    })
    .positive(),
  fee: z.coerce
    .number({
      invalid_type_error: "Fee must be a positive number.",
    })
    .min(0, { message: "Fee must be a non-negative number." })
    .default(0)
    .optional(),
  assetDataSource: z.enum([DataSource.YAHOO, DataSource.MANUAL]).default(DataSource.MANUAL),
});

export const incomeActivitySchema = baseActivitySchema.extend({
  activityType: z.enum([ActivityType.DIVIDEND, ActivityType.INTEREST]),
  assetId: z.string().min(1, { message: "Please select a security" }).optional(),
  quantity: z.coerce.number().default(0),
  amount: z.coerce
    .number({
      required_error: "Please enter a valid amount.",
      invalid_type_error: "Amount must be a positive number.",
    })
    .positive(),
  fee: z.coerce
    .number({
      invalid_type_error: "Fee must be a positive number.",
    })
    .min(0, { message: "Fee must be a non-negative number." })
    .default(0)
    .optional(),
});

export const otherActivitySchema = baseActivitySchema.extend({
  activityType: z.enum([ActivityType.SPLIT, ActivityType.TAX, ActivityType.FEE]),
  assetId: z.string().min(1, { message: "Please select a security" }).optional(),
  amount: z.coerce.number().min(0).optional(),
  quantity: z.coerce.number().nonnegative().optional(),
  fee: z.coerce
    .number({
      invalid_type_error: "Fee must be a positive number.",
    })
    .min(0, { message: "Fee must be a non-negative number." })
    .default(0)
    .optional(),
});

export const newActivitySchema = z
  .discriminatedUnion("activityType", [
    tradeActivitySchema,
    cashActivitySchema,
    incomeActivitySchema,
    otherActivitySchema,
    holdingsActivitySchema,
  ])
  .and(
    z.object({
      showCurrencySelect: z.boolean().optional(),
    }),
  );

export type NewActivityFormValues = z.infer<typeof newActivitySchema>;
