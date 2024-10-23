import { ActivityImport, NewActivity } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';

export const checkActivitiesImport = async ({
  account_id,
  activities,
}: {
  account_id: string;
  activities: NewActivity[];
}): Promise<ActivityImport[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('check_activities_import', {
          accountId: account_id,
          activities: activities,
        });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error checking activities import:', error);
    throw error;
  }
};

export const createActivities = async (activities: NewActivity[]): Promise<number> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        console.log('create_activities', activities);
        return invokeTauri('create_activities', { activities });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error importing activities:', error);
    throw error;
  }
};

export const getAccountImportMapping = async (accountId: string) => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        // Return fake data for testing purposes
        if (accountId === '1') {
          return {
            columns: {
              date: 'date',
              symbol: 'symbolId',
              quantity: 'shares',
              activityType: 'type',
              unitPrice: 'unitPrice',
              currency: 'currency',
              fee: 'fee',
            },
            activityTypes: {
              BUY: ['Buy', 'BOUGHT', 'Purchase'],
              SELL: ['SELLT', 'Sell', 'SOLD'],
              DIVIDEND: ['TXPDDV', 'Dividend'],
              INTEREST: ['Interest'],
              DEPOSIT: ['Deposit'],
              WITHDRAWAL: ['Withdrawal'],
              TRANSFER_IN: ['Transfer_In'],
              TRANSFER_OUT: ['Transfer_Out'],
              SPLIT: ['Split'],
              CONVERSION_IN: ['Conversion_In'],
              CONVERSION_OUT: ['Conversion_Out'],
              FEE: ['Fee'],
              TAX: ['Tax'],
            },
          };
        }
        if (accountId === 'bec01413-742a-4e12-805d-d35e0a03da4e') {
          return {
            columns: {
              date: 'Run Date',
              symbol: 'SECURITY DESCRIPTION',
              quantity: 'Quantity',
              activityType: 'TYPE',
              unitPrice: 'Price ($)',
              currency: 'Commission ($)',
              fee: 'Fees ($)',
            },
            activityTypes: {
              BUY: [],
              SELL: [],
              DIVIDEND: ['TXPDDV', 'Dividend'],
              INTEREST: [],
              DEPOSIT: ['Deposit'],
              WITHDRAWAL: ['Withdrawal'],
              TRANSFER_IN: ['Transfer_In'],
              TRANSFER_OUT: ['Transfer_Out'],
              SPLIT: ['Split'],
              CONVERSION_IN: ['Conversion_In'],
              CONVERSION_OUT: ['Conversion_Out'],
              FEE: ['Fee'],
              TAX: ['Tax'],
            },
          };
        }

        if (accountId === '3') {
          return {
            columns: {
              date: 'date',
              symbol: 'symbol',
              quantity: 'quantity',
              activityType: 'activityType',
              unitPrice: 'unitPrice',
              currency: 'currency',
              fee: 'fee',
            },
            activityTypes: {
              BUY: ['Buy', 'BOUGHT', 'Purchase'],
              SELL: ['SELLT', 'Sell', 'SOLD'],
              DIVIDEND: ['TXPDDV', 'Dividend'],
              INTEREST: ['Interest'],
              DEPOSIT: ['Deposit'],
              WITHDRAWAL: ['Withdrawal'],
              TRANSFER_IN: ['Transfer_In'],
              TRANSFER_OUT: ['Transfer_Out'],
              SPLIT: ['Split'],
              CONVERSION_IN: ['Conversion_In'],
              CONVERSION_OUT: ['Conversion_Out'],
              FEE: ['Fee'],
              TAX: ['Tax'],
            },
          };
        }

        // Return a default mapping
        return {
          columns: {
            date: 'date',
            symbol: 'symbol',
            quantity: 'quantity',
            activityType: 'activityType',
            unitPrice: 'unitPrice',
            currency: 'currency',
            fee: 'fee',
          },
          activityTypes: {
            BUY: ['BUY', 'BOUGHT', 'Purchase'],
            SELL: ['SELL', 'SOLD'],
            DIVIDEND: ['DIVIDEND'],
            INTEREST: ['INTEREST'],
            DEPOSIT: ['DEPOSIT'],
            WITHDRAWAL: ['WITHDRAWAL'],
            TRANSFER_IN: ['TRANSFER_IN'],
            TRANSFER_OUT: ['TRANSFER_OUT'],
            SPLIT: ['SPLIT'],
            CONVERSION_IN: ['CONVERSION_IN'],
            CONVERSION_OUT: ['CONVERSION_OUT'],
            FEE: ['FEE'],
            TAX: ['TAX'],
          },
        };
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error fetching mapping:', error);
    throw error;
  }
};

export const saveAccountImportMapping = async (data: { accountId: string; mapping: any }) => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        console.log('save_account_import_mapping', data);
        return true;
      // return invokeTauri('save_account_import_mapping', data);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error saving mapping:', error);
    throw error;
  }
};
