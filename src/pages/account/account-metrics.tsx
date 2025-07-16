import React, { useState } from 'react';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountValuation, PerformanceMetrics } from '@/lib/types';
import { PrivacyAmount } from '@/components/privacy-amount';
import { PerformanceGrid } from '@/pages/account/performance-grid';
import { formatDate } from '@/lib/utils';
import { MoneyInput } from '@/components/ui/money-input';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBalanceUpdate } from './use-balance-update';

interface EditableBalanceProps {
  account: AccountValuation;
  initialBalance: number;
  currency: string;
}

const EditableBalance: React.FC<EditableBalanceProps> = ({ account, initialBalance, currency }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [balance, setBalance] = useState(initialBalance);
  const { updateBalance, isPending } = useBalanceUpdate(account);

  const handleSave = () => {
    updateBalance(balance);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <MoneyInput value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? (
            <Icons.Spinner className="h-4 w-4 animate-spin" />
          ) : (
            <Icons.Check className="h-4 w-4" />
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
          <Icons.Close className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-2 text-lg font-extrabold cursor-pointer"
            onClick={() => setIsEditing(true)}
          >
            <PrivacyAmount value={initialBalance} currency={currency} />
            <Icons.Pencil className="h-4 w-4 cursor-pointer text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Click to update the cash balance</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

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
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-7 w-24" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Separator className="mb-4" />
          <div className="space-y-4 text-sm">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>

          <PerformanceGrid isLoading={true} />
        </CardContent>
        <CardFooter className="flex justify-end pb-0">
          <Skeleton className="h-3 w-48" />
        </CardFooter>
      </Card>
    );

  const displayCurrency = valuation?.accountCurrency || valuation.baseCurrency;

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
        {valuation && (
          <EditableBalance
            account={valuation}
            initialBalance={valuation?.cashBalance || 0}
            currency={displayCurrency}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-6">
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
        <p className="m-0 p-0 text-xs text-muted-foreground">
          from {formattedStartDate} to {formattedEndDate}
        </p>
      </CardFooter>
    </Card>
  );
};

export default AccountMetrics;
