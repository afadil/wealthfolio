import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercent } from '@/lib/utils';
import { SimplePerformanceMetrics } from '@/lib/types';
import { PrivacyAmount } from '@/components/privacy-amount';
import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';

interface AccountDetailProps {
  data?: SimplePerformanceMetrics;
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
    totalValue,
    baseCurrency,
    totalGainLossAmount,
    cumulativeReturnPercent,
    dayGainLossAmount,
    dayReturnPercentModDietz,
    portfolioWeight,
  } = data;

  const currency = baseCurrency || 'USD';

  const rows = [
    { label: 'Total Value', value: <PrivacyAmount value={totalValue || 0} currency={currency} /> },
    { label: '% of my portfolio', value: formatPercent(portfolioWeight || 0) },
    {
      label: "Today's return",
      value: (
        <span className="flex items-center space-x-2">
          <GainPercent
            value={dayReturnPercentModDietz || 0}
            animated={true}
            variant="badge"
            className="py-0.5 text-xs font-light"
          />
          <GainAmount value={dayGainLossAmount || 0} currency={currency} displayCurrency={false} />
        </span>
      ),
    },
    {
      label: 'Total return',
      value: (
        <span className="flex items-center space-x-2">
          <GainPercent
            value={cumulativeReturnPercent || 0}
            animated={true}
            variant="badge"
            className="py-0.5 text-xs font-light"
          />
          <GainAmount value={totalGainLossAmount || 0} currency={currency} displayCurrency={false} />
        </span>
      ),
    },
  ];

  return (
    <Card className={className}>
      <CardContent className="pt-4">
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
