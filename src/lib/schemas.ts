import * as z from 'zod';

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

export const newActivitySchema = z.object({
  id: z.string().uuid().optional(),
  accountId: z.string().min(1, { message: 'Account ID is required' }),
  activityDate: z.date(),
  currency: z.string().min(1, { message: 'Currency is required' }),
  fee: z.coerce
    .number({
      required_error: 'Please enter a valid fee.',
      invalid_type_error: 'Fee must be a positive number.',
    })
    .min(0, { message: 'Fee must be a positive number.' }),

  isDraft: z.boolean(),
  quantity: z.coerce
    .number({
      required_error: 'Please enter a valid quantity.',
      invalid_type_error: 'Quantity must be a positive number.',
    })
    .min(0, { message: 'Quantity must be a positive number.' }),
  assetId: z.string().min(1, { message: 'Asset ID is required' }),
  activityType: z.enum([
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
  ]),
  unitPrice: z.coerce
    .number({
      required_error: 'Please enter a valid price.',
      invalid_type_error: 'Price must be a positive number.',
    })
    .min(0, { message: 'Price must be a positive number.' }),
  comment: z.string().optional(),
});
