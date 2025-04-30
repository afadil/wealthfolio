import React from 'react';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountValuation, PerformanceMetrics } from '@/lib/types';
import { PrivacyAmount } from '@/components/privacy-amount';
import { PerformanceGrid } from '@/pages/account/performance-grid';
import { formatDate } from '@/lib/utils';

interface AccountMetricsProps {
  valuation?: AccountValuation | null;
  performance?: PerformanceMetrics | null;
  className?: string;
  isLoading?: boolean;
}

const AccountMetrics: React.FC<AccountMetricsProps> = ({
  valuation,
  performance,
  className,
  isLoading,
}) => {
  if (isLoading || !performance || !valuation)
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-7 w-1/4" />
        </CardHeader>
        <CardContent>
          <div className="mb-8 space-y-4 text-sm">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-1/4" /> <Skeleton className="h-4 w-1/3" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-1/4" /> <Skeleton className="h-4 w-1/3" />
            </div>
          </div>

          <PerformanceGrid isLoading={true} />
        </CardContent>
        <p className="invisible m-2 mt-0 text-right text-xs text-muted-foreground">loading...</p>
      </Card>
    );

  const displayCurrency = valuation?.accountCurrency || 'USD';

  const rows = [
    {
      label: 'Investments',
      value: (
        <PrivacyAmount value={valuation?.investmentMarketValue || 0} currency={displayCurrency} />
      ),
    },
    {
      label: 'Net Contribution',
      value: <PrivacyAmount value={valuation?.netContribution || 0} currency={displayCurrency} />,
    },
    {
      label: 'Cost Basis',
      value: <PrivacyAmount value={valuation?.costBasis || 0} currency={displayCurrency} />,
    },
  ];

  const formattedStartDate = formatDate(performance?.periodStartDate || '');
  const formattedEndDate = formatDate(performance?.periodEndDate || '');

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-bold">Cash Balance</CardTitle>
        <div className="text-lg font-extrabold">
          <PrivacyAmount value={valuation?.cashBalance || 0} currency={displayCurrency} />
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        <Separator className="mb-4" />
        <div className="space-y-4 text-sm">
          {rows.map(({ label, value }, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-medium`}>{value}</span>
            </div>
          ))}
        </div>

        <PerformanceGrid performance={performance} isLoading={isLoading} />
      </CardContent>
      <CardFooter className="flex justify-end pb-0">
        <p className="p-0 m-0 text-xs text-muted-foreground">from {formattedStartDate} to {formattedEndDate}</p>
      </CardFooter>
    </Card>
  );
};

export default AccountMetrics;
