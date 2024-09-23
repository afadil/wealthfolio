import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAmount, formatPercent } from '@/lib/utils';
import { PortfolioHistory } from '@/lib/types';

interface AccountDetailProps {
  data?: PortfolioHistory;
  className?: string;
}

const AccountDetail: React.FC<AccountDetailProps> = ({ data, className }) => {
  if (!data)
    return (
      <Card className={className}>
        <Skeleton className="h-96" />
      </Card>
    );
  const {
    marketValue,
    bookCost,
    netDeposit,
    availableCash,
    totalGainValue,
    dayGainPercentage,
    dayGainValue,
    totalGainPercentage,
    allocationPercentage,
    currency,
  } = data;

  const rows = [
    { label: 'Investments', value: formatAmount(marketValue, currency) },
    { label: 'Book Cost', value: formatAmount(bookCost, currency) },
    { label: 'Net Deposit', value: formatAmount(netDeposit, currency) },
    { label: '% of my portfolio', value: formatPercent(allocationPercentage || 0) },
    {
      label: "Today's return",
      value: `${formatAmount(dayGainValue, currency)} (${formatPercent(dayGainPercentage)})`,
      color: dayGainValue < 0 ? 'text-red-400' : 'text-success',
    },
    {
      label: 'Total return',
      value: `${formatAmount(totalGainValue, currency)} (${formatPercent(totalGainPercentage)})`,
      color: totalGainPercentage < 0 ? 'text-red-400' : 'text-success',
    },
  ];

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle className="text-lg font-bold">Cash Balance</CardTitle>
        <div className="text-lg font-extrabold">{formatAmount(availableCash, currency)}</div>
      </CardHeader>

      <CardContent>
        <Separator className="my-4" />
        <div className="space-y-4 text-sm">
          {rows.map(({ label, value, color }, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="text-gray-600">{label}</span>
              <span className={`font-medium ${color || ''}`}>{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountDetail;
