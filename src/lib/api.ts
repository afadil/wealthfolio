import { ImportFormSchema } from './schemas';

export const fetchMappingByAccountId = async (
  accountId: string,
): Promise<ImportFormSchema['mapping']> => {
  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 500));

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
        BUY: 'Buy',
        SELL: 'SELLT',
        DIVIDEND: 'TXPDDV',
        INTEREST: 'Interest',
        DEPOSIT: 'Deposit',
        WITHDRAWAL: 'Withdrawal',
        TRANSFER_IN: 'Transfer_In',
        TRANSFER_OUT: 'Transfer_Out',
        SPLIT: 'Split',
        CONVERSION_IN: 'Conversion_In',
        CONVERSION_OUT: 'Conversion_Out',
        FEE: 'Fee',
        TAX: 'Tax',
      },
    };
  }
  if (accountId === '2') {
    return {
      columns: {
        date: 'date',
        symbol: 'symbolId',
        quantity: 'quantity',
        activityType: 'type',
        unitPrice: 'unitPrice',
        currency: 'currency',
        fee: 'fee',
      },
      activityTypes: {
        BUY: 'Purchase',
        SELL: 'Sale',
        DIVIDEND: 'Dividend',
        INTEREST: 'Interest',
        DEPOSIT: 'Deposit',
        WITHDRAWAL: 'Withdrawal',
        TRANSFER_IN: 'Transfer In',
        TRANSFER_OUT: 'Transfer Out',
        SPLIT: 'Split',
        CONVERSION_IN: 'Conversion In',
        CONVERSION_OUT: 'Conversion Out',
        FEE: 'Fee',
        TAX: 'Tax',
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
        BUY: 'Bought',
        SELL: 'Sold',
        DIVIDEND: 'Dividend Payment',
        INTEREST: 'Interest',
        DEPOSIT: 'Deposit',
        WITHDRAWAL: 'Withdrawal',
        TRANSFER_IN: 'Transfer In',
        TRANSFER_OUT: 'Transfer Out',
        SPLIT: 'Split',
        CONVERSION_IN: 'Conversion In',
        CONVERSION_OUT: 'Conversion Out',
        FEE: 'Fee',
        TAX: 'Tax',
      },
    };
  }

  // Return a default mapping
  return {
    columns: {
      date: 'date',
      symbol: 'Ticker',
      quantity: 'Shares',
      activityType: 'Type',
      unitPrice: 'Price',
      currency: 'currency',
      fee: 'fee',
    },
    activityTypes: {},
  };
};

export async function saveMappingForAccount(data: {
  accountId: string;
  mapping: ImportFormSchema['mapping'];
}) {
  const response = await fetch(`/api/accounts/${data.accountId}/mapping`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data.mapping),
  });

  if (!response.ok) {
    throw new Error('Failed to save mapping');
  }

  return response.json();
}
