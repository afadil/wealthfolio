import { useState } from 'react';
import { subMonths } from 'date-fns';
import { PerformanceChart } from '@/components/performance-chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, BarChart } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateRangeSelector } from '@/components/date-range-selector';
import { useAccounts } from '@/pages/account/useAccounts';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRange } from 'react-day-picker';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';
import { ReturnMethod, usePerformanceData } from './hooks/usePerformanceData';

const PORTFOLIO_TOTAL = {
  id: 'TOTAL',
  name: 'All Portfolio',
};

export default function PerformancePage() {
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 12),
    to: new Date(),
  });
  const [returnMethod, setReturnMethod] = useState<ReturnMethod>('TWR');

  console.log('PerformancePage', returnMethod);

  const { data: accounts, isLoading: isLoadingAccounts } = useAccounts();
  const { data: performanceData, isLoading: isLoadingPerformance } = usePerformanceData({
    selectedAccounts,
    dateRange,
    returnMethod,
  });

  const handleAccountToggle = (accountId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId],
    );
  };

  const accountOptions = accounts ? [PORTFOLIO_TOTAL, ...accounts] : [PORTFOLIO_TOTAL];

  if (isLoadingAccounts) {
    return <PerformanceDashboardSkeleton />;
  }

  return (
    <ApplicationShell className="p-6">
      <ApplicationHeader heading="Performance Comparison">
        <div className="flex items-center space-x-2">
          <DateRangeSelector value={dateRange} onChange={setDateRange} />
          <Select value={selectedAccounts[0]} onValueChange={(value) => handleAccountToggle(value)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select accounts" />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((account) => (
                <SelectItem
                  key={account.id}
                  value={account.id}
                  className={account.id === 'TOTAL' ? 'font-medium' : ''}
                >
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ApplicationHeader>

      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {selectedAccounts.map((accountId) => (
            <Button
              key={accountId}
              variant="secondary"
              size="sm"
              onClick={() => handleAccountToggle(accountId)}
            >
              {accountId === 'TOTAL'
                ? PORTFOLIO_TOTAL.name
                : accounts?.find((a) => a.id === accountId)?.name}
              <X className="ml-2 h-4 w-4" />
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Cumulative Returns</CardTitle>
                <CardDescription>Compare account performance over time</CardDescription>
              </div>
              <ReturnMethodSelector
                selectedMethod={returnMethod}
                onMethodSelect={setReturnMethod}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingPerformance ? (
              <Skeleton className="h-[400px] w-full" />
            ) : performanceData && performanceData.length > 0 ? (
              <PerformanceChart data={performanceData} />
            ) : (
              <EmptyPlaceholder
                className="mx-auto flex h-[400px] max-w-[420px] items-center justify-center"
                icon={<BarChart className="h-10 w-10" />}
                title="No performance data"
                description="Select accounts to compare their performance over time."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ApplicationShell>
  );
}

function PerformanceDashboardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 space-y-6 px-4 py-6 md:px-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[150px]" />
            <Skeleton className="h-4 w-[100px]" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

const ReturnMethodSelector: React.FC<{
  selectedMethod: ReturnMethod;
  onMethodSelect: (method: ReturnMethod) => void;
}> = ({ selectedMethod, onMethodSelect }) => (
  <div className="flex justify-end">
    <div className="flex space-x-1 rounded-full bg-secondary p-1">
      <Button
        size="sm"
        className="h-8 rounded-full px-2 text-xs"
        variant={selectedMethod === 'TWR' ? 'default' : 'ghost'}
        onClick={() => onMethodSelect('TWR')}
      >
        Time-Weighted
      </Button>
      <Button
        size="sm"
        className="h-8 rounded-full px-2 text-xs"
        variant={selectedMethod === 'MWR' ? 'default' : 'ghost'}
        onClick={() => onMethodSelect('MWR')}
      >
        Money-Weighted
      </Button>
    </div>
  </div>
);
