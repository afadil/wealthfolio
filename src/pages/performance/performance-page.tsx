import { useState, useMemo } from 'react';
import { subMonths } from 'date-fns';
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
import { useCalculatePerformance } from './hooks/use-performance-data';
import { BenchmarkSymbolSelector } from '@/components/benchmark-symbol-selector';
import { AccountSelector } from '@/components/account-selector';
import { AlertFeedback } from '@/components/alert-feedback';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PerformanceData } from '@/lib/types';
import { formatPercent } from '@/lib/utils';
import { GainPercent } from '@/components/gain-percent';

type ComparisonItem = {
  id: string;
  type: 'account' | 'symbol';
  name: string;
};

const PORTFOLIO_TOTAL: ComparisonItem = {
  id: 'TOTAL',
  type: 'account',
  name: 'All Portfolio',
};

function PerformanceContent({
  performanceData,
  isLoading,
  hasErrors,
  errorMessages,
}: {
  performanceData: (PerformanceData | null)[] | undefined;
  isLoading: boolean;
  hasErrors: boolean;
  errorMessages: string[];
}) {
  return (
    <div className="relative flex h-full w-full flex-col">
      {performanceData && performanceData.length > 0 && (
        <div className="min-h-0 w-full flex-1">
          <PerformanceChart
            data={performanceData.filter((item): item is PerformanceData => item !== null)}
          />
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
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="animate-subtle-pulse absolute inset-0 border-2 border-transparent">
            <div className="animate-progress-border absolute left-0 top-0 h-[2px] bg-primary"></div>
          </div>
          <div className="absolute bottom-4 right-4">
            <div className="rounded-md border bg-background/80 px-3 py-1.5 shadow-sm backdrop-blur-sm">
              <p className="flex items-center text-xs font-medium text-muted-foreground">
                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary"></span>
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 12),
    to: new Date(),
  });

  const { data: accounts, isLoading: isLoadingAccounts } = useAccounts();

  // Helper function to sort comparison items (accounts first, then symbols)
  const sortComparisonItems = (items: ComparisonItem[]): ComparisonItem[] => {
    return [...items].sort((a, b) => {
      // Sort by type first (accounts before symbols)
      if (a.type !== b.type) {
        return a.type === 'account' ? -1 : 1;
      }
      // If same type, maintain original order
      return 0;
    });
  };

  // Use the custom hook for parallel data fetching with effective date calculation
  const {
    data: performanceData,
    isLoading: isLoadingPerformance,
    hasErrors,
    errorMessages,
    displayDateRange
  } = useCalculatePerformance({
    selectedItems,
    dateRange
  });

  // Calculate selected item data
  const selectedItemData = useMemo(() => {
    if (!performanceData?.length) return null;

    // If no item is selected, use the first one
    const targetId = selectedItemId || performanceData[0]?.id;
    const found = performanceData.find((item) => item?.id === targetId);

    if (!found) return null;

    return {
      id: found.id,
      name: found.name,
      totalReturn: Number(found.totalReturn) * 100,
      annualizedReturn: Number(found.annualizedReturn) * 100,
      volatility: Number(found.volatility) * 100,
      maxDrawdown: Number(found.maxDrawdown) * 100,
    };
  }, [selectedItemId, performanceData]);

  const handleAccountSelect = (account: { id: string; name: string }) => {
    setSelectedItems((prev) => {
      const exists = prev.some((item) => item.id === account.id);
      if (exists) {
        return sortComparisonItems(prev.filter((item) => item.id !== account.id));
      }

      // Create a proper ComparisonItem
      const newItem: ComparisonItem = {
        id: account.id,
        type: 'account',
        name: account.name,
      };

      return sortComparisonItems([...prev, newItem]);
    });
  };

  const handleSymbolSelect = (symbol: { id: string; name: string }) => {
    setSelectedItems((prev) => {
      const exists = prev.some((item) => item.id === symbol.id);
      if (exists) return sortComparisonItems(prev);

      const newSymbol: ComparisonItem = {
        id: symbol.id,
        type: 'symbol',
        name: symbol.name,
      };

      return sortComparisonItems([...prev, newSymbol]);
    });
  };

  const handleBadgeSelect = (item: ComparisonItem) => {
    setSelectedItemId(selectedItemId === item.id ? null : item.id);
  };

  const handleBadgeDelete = (e: React.MouseEvent, item: ComparisonItem) => {
    e.stopPropagation();
    if (item.type === 'account') {
      handleAccountSelect({ id: item.id, name: item.name });
    } else {
      setSelectedItems((prev) => sortComparisonItems(prev.filter((i) => i.id !== item.id)));
    }
    if (selectedItemId === item.id) {
      setSelectedItemId(null);
    }
  };

  const accountOptions = accounts
    ? [PORTFOLIO_TOTAL, ...accounts.filter((account) => account.isActive)]
    : [PORTFOLIO_TOTAL];
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
                className={`group border flex items-center gap-1 rounded-md px-3 py-1 text-sm transition-colors hover:shadow-sm ${
                  selectedItemId === item.id ? 'ring-2 ring-primary ring-offset-2' : ''
                }`}
                onClick={() => handleBadgeSelect(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBadgeSelect(item);
                  }
                }}
                aria-pressed={selectedItemId === item.id}
                aria-label={`Select ${item.name}`}
              >
                {item.type === 'account' ? (
                  <Wallet className="mr-1 h-3.5 w-3.5 text-secondary" aria-hidden="true" />
                ) : (
                  <LineChart className="mr-1 h-3.5 w-3.5 text-secondary" aria-hidden="true" />
                )}
                <span className="font-medium">{item.name}</span>
                <button
                  type="button"
                  onClick={(e) => handleBadgeDelete(e, item)}
                  className="ml-1 flex items-center justify-center rounded-full bg-muted/30 p-0.5 transition-all duration-300 hover:scale-125 focus:outline-none focus:ring-2 focus:ring-primary group-hover:bg-muted/80"
                  aria-label={`Remove ${item.name}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
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
          <CardHeader className="pb-1">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Performance</CardTitle>
                  <CardDescription>
                    {displayDateRange}
                  </CardDescription>
                </div>
                {performanceData && performanceData.length > 0 && (
                  <div className="grid grid-cols-2 gap-6 rounded-lg bg-muted/40 p-2 backdrop-blur-sm md:grid-cols-4">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-light text-muted-foreground">
                          Total Return
                        </span>
                      </div>
                      <div className="flex items-baseline">
                        <span
                          className={`text-lg ${
                            selectedItemData && selectedItemData.totalReturn >= 0
                              ? 'text-success'
                              : 'text-destructive'
                          }`}
                        >
                          <GainPercent value={selectedItemData?.totalReturn || 0} animated={true} />
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-light text-muted-foreground">
                          Annualized Return
                        </span>
                      </div>
                      <div className="flex items-baseline">
                        <span
                          className={`text-lg ${
                            selectedItemData && selectedItemData.annualizedReturn >= 0
                              ? 'text-success'
                              : 'text-destructive'
                          }`}
                        >
                          <GainPercent value={selectedItemData?.annualizedReturn || 0} animated={true} />
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-light text-muted-foreground">Volatility</span>
                      </div>
                      <div className="flex items-baseline">
                        <span className="text-lg text-foreground">
                          {formatPercent(selectedItemData?.volatility)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-light text-muted-foreground">
                          Max Drawdown
                        </span>
                      </div>
                      <div className="flex items-baseline">
                        <span className="text-lg text-destructive">
                          {formatPercent(selectedItemData?.maxDrawdown)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-6">
            <PerformanceContent
              performanceData={performanceData}
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
            <div className="flex h-full w-full items-center justify-center">
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
