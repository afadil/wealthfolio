import { useState } from 'react';
import { format, subMonths } from 'date-fns';
import { PerformanceChart } from '@/components/performance-chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, BarChart, Wallet, LineChart } from 'lucide-react';
import { DateRangeSelector } from '@/components/date-range-selector';
import { useAccounts } from '@/pages/account/useAccounts';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRange } from 'react-day-picker';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';
import { useCalculateCumulativeReturns } from './hooks/use-performance-data';
import { BenchmarkSymbolSelector } from '@/components/benchmark-symbol-selector';
import { AccountSelector } from '@/components/account-selector';
import { AlertFeedback } from '@/components/alert-feedback';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const PORTFOLIO_TOTAL: ComparisonItem = {
  id: 'TOTAL',
  type: 'account',
  name: 'All Portfolio',
};

type ComparisonItem = {
  id: string;
  type: 'account' | 'symbol';
  name: string;
};

function PerformanceContent({
  performanceData,
  isLoading,
  hasErrors,
  errorMessages,
}: {
  performanceData: any[] | undefined;
  isLoading: boolean;
  hasErrors: boolean;
  errorMessages: string[];
}) {
  return (
    <div className="relative flex flex-col h-full w-full">
      {performanceData && performanceData.length > 0 && (
        <div className="flex-1 min-h-0 w-full">
          <PerformanceChart data={performanceData} />
        </div>
      )}

      {!performanceData?.length && !isLoading && !hasErrors && (
        <EmptyPlaceholder
          className="mx-auto flex max-w-[420px] items-center justify-center"
          icon={<BarChart className="h-10 w-10" />}
          title="No performance data"
          description="Select accounts to compare their performance over time."
        />
      )}

      {/* Modern horizontal loader with improved UX */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="absolute inset-0 border-2 border-transparent animate-subtle-pulse">
            <div className="absolute top-0 left-0 h-[2px] bg-primary animate-progress-border"></div>
          </div>
          <div className="absolute bottom-4 right-4">
            <div className="bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border">
              <p className="text-xs font-medium text-muted-foreground flex items-center">
                <span className="inline-block h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                Calculating...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error display using AlertFeedback component */}
      {hasErrors && (
        <div className="w-full max-w-md">
          <AlertFeedback title="Error calculating performance data" variant="error">
            <div>
              {errorMessages.map((error, index) => (
                <p key={index} className="text-sm">
                  {error}
                </p>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={() => window.location.reload()}
                variant="default"
                className="bg-black text-white hover:bg-gray-800"
              >
                Retry
              </Button>
            </div>
          </AlertFeedback>
        </div>
      )}
    </div>
  );
}

export default function PerformancePage() {
  const [selectedItems, setSelectedItems] = useState<ComparisonItem[]>([PORTFOLIO_TOTAL]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 12),
    to: new Date(),
  });

  const { data: accounts, isLoading: isLoadingAccounts } = useAccounts();

  // Use the custom hook for parallel data fetching
  const {
    data: chartData,
    isLoading: isLoadingPerformance,
    hasErrors,
    errorMessages,
  } = useCalculateCumulativeReturns({
    selectedItems,
    startDate: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '',
    endDate: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '',
  });

  const handleAccountSelect = (account: { id: string; name: string }) => {
    setSelectedItems((prev) => {
      const exists = prev.some((item) => item.id === account.id);
      if (exists) {
        return prev.filter((item) => item.id !== account.id);
      }

      // Create a proper ComparisonItem
      const newItem: ComparisonItem = {
        id: account.id,
        type: 'account',
        name: account.name,
      };

      return [...prev, newItem];
    });
  };

  const handleSymbolSelect = (symbol: { id: string; name: string }) => {
    setSelectedItems((prev) => {
      const exists = prev.some((item) => item.id === symbol.id);
      if (exists) return prev;

      const newSymbol: ComparisonItem = {
        id: symbol.id,
        type: 'symbol',
        name: symbol.name,
      };

      return [...prev, newSymbol];
    });
  };

  const accountOptions = accounts ? [PORTFOLIO_TOTAL, ...accounts] : [PORTFOLIO_TOTAL];
  const selectedAccountIds = selectedItems
    .filter((item) => item.type === 'account')
    .map((item) => item.id);

  if (isLoadingAccounts) {
    return <PerformanceDashboardSkeleton />;
  }

  return (
    <ApplicationShell className="p-6">
      <ApplicationHeader heading="Portfolio Performance">
        <div className="flex items-center space-x-2">
          <DateRangeSelector value={dateRange} onChange={setDateRange} />
        </div>
      </ApplicationHeader>

      <div className="flex h-[calc(100vh-12rem)] flex-col space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {selectedItems.map((item) => (
            <Badge
              key={item.id}
              variant="default"
              className="group flex cursor-pointer items-center gap-1 rounded-md px-3 py-1 text-sm transition-colors hover:shadow-sm"
              onClick={() => {
                if (item.type === 'account') {
                  handleAccountSelect({ id: item.id, name: item.name });
                } else {
                  setSelectedItems((prev) => prev.filter((i) => i.id !== item.id));
                }
              }}
            >
              {item.type === 'account' ? (
                <Wallet className="mr-1 h-3.5 w-3.5 text-secondary" />
              ) : (
                <LineChart className="mr-1 h-3.5 w-3.5 text-secondary" />
              )}
              <span className="font-medium">{item.name}</span>
              <span className="ml-1 flex items-center justify-center rounded-full bg-muted/30 p-0.5 transition-all duration-300 group-hover:scale-125 group-hover:bg-muted/80">
                <X className="h-3 w-3" />
              </span>
            </Badge>
          ))}

          {selectedItems.length > 0 && <Separator orientation="vertical" className="mx-2 h-6" />}

          <AccountSelector
            accounts={accountOptions}
            selectedAccounts={selectedAccountIds}
            onSelect={handleAccountSelect}
          />
          <BenchmarkSymbolSelector onSelect={handleSymbolSelect} />
        </div>

        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Cumulative Returns</CardTitle>
                <CardDescription>
                  {dateRange?.from && dateRange?.to
                    ? `${format(dateRange.from, 'MMM d, yyyy')} - ${format(dateRange.to, 'MMM d, yyyy')}`
                    : 'Compare account performance over time'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-6">
            <PerformanceContent
              performanceData={chartData}
              isLoading={isLoadingPerformance}
              hasErrors={hasErrors}
              errorMessages={errorMessages}
            />
          </CardContent>
        </Card>
      </div>
    </ApplicationShell>
  );
}

function PerformanceDashboardSkeleton() {
  return (
    <ApplicationShell className="p-6">
      <ApplicationHeader heading="Portfolio Performance">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-10 w-[160px]" />
          <Skeleton className="h-10 w-[200px]" />
        </div>
      </ApplicationHeader>

      <div className="space-y-6">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-[100px]" />
          <Skeleton className="h-8 w-[120px]" />
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[180px]" />
            <Skeleton className="h-4 w-[240px]" />
          </CardHeader>
          <CardContent className="min-h-[400px]">
            <div className="h-full w-full flex items-center justify-center">
              <Skeleton className="h-[300px] w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    </ApplicationShell>
  );
}

const progressBarKeyframes = `
@keyframes progress-border {
  0% {
    width: 0%;
  }
  100% {
    width: 100%;
  }
}

@keyframes subtle-pulse {
  0% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.3;
  }
  100% {
    opacity: 0.5;
  }
}
`;

export const styles = {
  progressBarKeyframes,
};
