import * as z from 'zod';
import { ImportFormat, ActivityType } from './types';

export const importFormSchema = z.object({
  accountId: z.string().min(1, 'Please select an account'),
  mapping: z.object({
    columns: z.record(z.nativeEnum(ImportFormat), z.string()),
    activityTypes: z.record(z.nativeEnum(ActivityType), z.array(z.string())),
  }),
});

export type ImportFormSchema = z.infer<typeof importFormSchema>;

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
  accountType: z.enum(['SECURITIES', 'CASH', 'CRYPTOCURRENCY']),
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
  currency: z.string().optional(),
  fee: z.coerce
    .number({
      required_error: 'Please enter a valid fee.',
      invalid_type_error: 'Fee must be a positive number.',
    })
    .min(0, { message: 'Fee must be a non-negative number.' }),
  isDraft: z.boolean(),
  quantity: z.coerce
    .number({
      required_error: 'Please enter a valid quantity.',
      invalid_type_error: 'Quantity must be a number.',
    })
    .min(0, { message: 'Quantity must be a non-negative number.' }),

  activityType: z.enum(
    [
      'BUY',
      'SELL',
      'DIVIDEND',
      'INTEREST',
      'DEPOSIT',
      'WITHDRAWAL',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'CONVERSION_IN',
      'CONVERSION_OUT',
      'FEE',
      'TAX',
      'SPLIT',
    ],
    {
      errorMap: () => {
        return { message: 'Please select an activity type.' };
      },
    },
  ),
  unitPrice: z.coerce
    .number({
      required_error: 'Please enter a valid price.',
      invalid_type_error: 'Price must be a non-negative number.',
    })
    .min(0, { message: 'Price must be a non-negative number.' }),
  comment: z.string().optional(),
});

export const newActivitySchema = baseActivitySchema.extend({
  assetId: z.string().min(1, { message: 'Asset ID is required' }),
  activityDate: z.union([z.date(), z.string().datetime()]).optional(),
});

export const importActivitySchema = baseActivitySchema.extend({
  date: z.union([z.date(), z.string().datetime()]).optional(),
  symbol: z.string().min(1, { message: 'Symbol is required' }),
  amount: z.coerce
    .number({
      required_error: 'Should be a valid amount.',
      invalid_type_error: 'Amount must be a number.',
    })
    .optional(),
  accountName: z.string().optional(),
  symbolName: z.string().optional(),
  error: z.string().optional(),
  isDraft: z.boolean().default(true),
  isValid: z.boolean().default(false),
  lineNumber: z.number().optional(),
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
