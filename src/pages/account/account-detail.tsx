import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercent } from '@/lib/utils';
import { PortfolioHistory } from '@/lib/types';
import { PrivacyAmount } from '@/components/privacy-amount';
import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';

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
    { label: 'Investments', value: <PrivacyAmount value={marketValue} currency={currency} /> },
    { label: 'Book Cost', value: <PrivacyAmount value={bookCost} currency={currency} /> },
    { label: 'Net Deposit', value: <PrivacyAmount value={netDeposit} currency={currency} /> },
    { label: '% of my portfolio', value: formatPercent(allocationPercentage || 0) },
    {
      label: "Today's return",
      value: (
        <span className="flex items-center space-x-2">
          <GainPercent
            value={dayGainPercentage}
            animated={true}
            variant="badge"
            className="py-0.5 text-xs font-light"
          />
          <GainAmount value={dayGainValue} currency={currency} displayCurrency={false} />
        </span>
      ),
    },
    {
      label: 'Total return',
      value: (
        <span className="flex items-center space-x-2">
          <GainPercent
            value={totalGainPercentage}
            animated={true}
            variant="badge"
            className="py-0.5 text-xs font-light"
          />
          <GainAmount value={totalGainValue} currency={currency} displayCurrency={false} />
        </span>
      ),
    },
  ];

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle className="text-lg font-bold">Cash Balance</CardTitle>
        <div className="text-lg font-extrabold">
          <PrivacyAmount value={availableCash} currency={currency} />
        </div>
      </CardHeader>

      <CardContent>
        <Separator className="my-4" />
        <div className="space-y-4 text-sm">
          {rows.map(({ label, value }, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-medium`}>{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountDetail;
