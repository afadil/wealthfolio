import * as z from 'zod';
import {
  ActivityType,
  activityTypeSchema,
  DataSource,
  dataSourceSchema,
  accountTypeSchema,
} from './constants';

export const importMappingSchema = z.object({
  accountId: z.string(),
  fieldMappings: z.record(z.string(), z.string()),
  activityMappings: z.record(z.string(), z.array(z.string())),
  symbolMappings: z.record(z.string(), z.string()),
});

export const newAccountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .min(2, {
      message: 'Name must be at least 2 characters.',
    })
    .max(50, {
      message: 'Name must not be longer than 50 characters.',
    }),
  group: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  accountType: accountTypeSchema,
  currency: z.string({ required_error: 'Please select a currency.' }),
});

export const newGoalSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string(),
  description: z.string().optional(),
  targetAmount: z.coerce
    .number({
      required_error: 'Please enter a valid target amount.',
      invalid_type_error: 'Target amount must be a positive number.',
    })
    .min(0, { message: 'Target amount must be a positive number.' }),
  yearlyContribution: z.number().optional(),
  deadline: z.date().optional(),
  isAchieved: z.boolean().optional(),
});

const baseActivitySchema = z.object({
  id: z.string().uuid().optional(),
  accountId: z.string().min(1, { message: 'Please select an account.' }),
  activityDate: z.union([z.date(), z.string().datetime()]).default(new Date()),
  currency: z.string().optional(),
  comment: z.string().optional().nullable(),
  isDraft: z.boolean().optional().default(false),
});

const feeActivitySchema = baseActivitySchema.extend({
  activityType: z.literal(ActivityType.FEE),
  assetId: z.string().optional(),
  fee: z.coerce
    .number({
      required_error: 'Fee is required.',
      invalid_type_error: 'Fee must be a positive number.',
    })
    .min(0, { message: 'Fee must be a non-negative number.' }),
});

const cashActivitySchema = baseActivitySchema.extend({
  activityType: z.enum([ActivityType.DEPOSIT, ActivityType.WITHDRAWAL, ActivityType.INTEREST]),
  assetId: z.string().optional(),
  quantity: z.number().default(1),
  unitPrice: z.coerce.number().min(0),
  fee: z.coerce
    .number({
      invalid_type_error: 'Fee must be a positive number.',
    })
    .min(0, { message: 'Fee must be a non-negative number.' })
    .default(0)
    .optional(),
});

const dividendActivitySchema = baseActivitySchema.extend({
  activityType: z.literal(ActivityType.DIVIDEND),
  assetId: z.string().min(1, { message: 'Please select a security' }),
  quantity: z.number().default(1),
  unitPrice: z.coerce.number().min(0),
  fee: z.coerce
    .number({
      invalid_type_error: 'Fee must be a positive number.',
    })
    .min(0, { message: 'Fee must be a non-negative number.' })
    .default(0)
    .optional(),
});

const splitActivitySchema = baseActivitySchema.extend({
  activityType: z.literal('SPLIT'),
  assetId: z.string().min(1, { message: 'Please select a security' }),
  unitPrice: z.coerce.number().positive('Split ratio must be greater than 0'),
  quantity: z.number().default(1),
  fee: z.coerce
    .number({
      invalid_type_error: 'Fee must be a positive number.',
    })
    .min(0, { message: 'Fee must be a non-negative number.' })
    .default(0)
    .optional(),
});

const transferInActivitySchema = baseActivitySchema.extend({
  activityType: z.literal('TRANSFER_IN'),
  assetId: z.string().min(1, { message: 'Please select a security' }),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  fee: z.coerce
    .number({
      invalid_type_error: 'Fee must be a positive number.',
    })
    .min(0, { message: 'Fee must be a non-negative number.' })
    .default(0)
    .optional(),
});

const transferOutActivitySchema = baseActivitySchema.extend({
  activityType: z.literal('TRANSFER_OUT'),
  assetId: z.string().min(1, { message: 'Please select a security' }),
  quantity: z.coerce.number().positive(),
  fee: z.coerce
    .number({
      invalid_type_error: 'Fee must be a positive number.',
    })
    .min(0, { message: 'Fee must be a non-negative number.' })
    .default(0)
    .optional(),
});

const tradeActivitySchema = baseActivitySchema.extend({
  activityType: z.enum([ActivityType.BUY, ActivityType.SELL]),
  assetId: z.string().min(1, { message: 'Please select a security' }),
  quantity: z.coerce
    .number({
      required_error: 'Please enter a valid quantity.',
      invalid_type_error: 'Quantity must be a number.',
    })
    .positive(),
  unitPrice: z.coerce.number().min(0),
  fee: z.coerce
    .number({
      required_error: 'Please enter a valid fee.',
      invalid_type_error: 'Fee must be a positive number.',
    })
    .min(0, { message: 'Fee must be a non-negative number.' })
    .default(0),
  assetDataSource: dataSourceSchema.default(DataSource.YAHOO),
});

export const newActivitySchema = z.discriminatedUnion('activityType', [
  cashActivitySchema,
  feeActivitySchema,
  dividendActivitySchema,
  splitActivitySchema,
  transferInActivitySchema,
  transferOutActivitySchema,
  tradeActivitySchema,
]);

export type ActivityFormValues = z.infer<typeof newActivitySchema>;

export const importActivitySchema = z.object({
  id: z.string().uuid().optional(),
  accountId: z.string().min(1, { message: 'Please select an account.' }),
  currency: z.string().optional(),
  activityType: activityTypeSchema,
  date: z.union([z.date(), z.string().datetime()]).optional(),
  symbol: z.string().min(1, { message: 'Symbol is required' }),
  amount: z.coerce
    .number({
      required_error: 'Should be a valid amount.',
      invalid_type_error: 'Amount must be a number.',
    })
    .optional(),
  quantity: z.coerce
    .number({
      required_error: 'Please enter a valid quantity.',
      invalid_type_error: 'Quantity must be a number.',
    })
    .min(0, { message: 'Quantity must be a non-negative number.' }),
  unitPrice: z.coerce
    .number({
      required_error: 'Please enter a valid price.',
      invalid_type_error: 'Price must be a non-negative number.',
    })
    .min(0, { message: 'Price must be a non-negative number.' }),
  fee: z.coerce
    .number({
      required_error: 'Please enter a valid fee.',
      invalid_type_error: 'Fee must be a positive number.',
    })
    .min(0, { message: 'Fee must be a non-negative number.' }),
  accountName: z.string().optional(),
  symbolName: z.string().optional(),
  error: z.string().optional(),
  isValid: z.boolean().default(false),
  lineNumber: z.number().optional(),
  isDraft: z.boolean(),
  comment: z.string().optional(),
});

export const newContributionLimitSchema = z.object({
  id: z.string().optional(),
  groupName: z.string().min(1, 'Group name is required'),
  contributionYear: z.number().int().min(1900, 'Invalid year'),
  limitAmount: z.coerce
    .number({
      required_error: 'Please enter a valid limit amount.',
      invalid_type_error: 'Limit amount must be a positive number.',
    })
    .min(0, { message: 'Price must be a non-negative number.' }),
  accountIds: z.string().nullable().optional(),
});
