import { CustomPieChart } from '@/components/custom-pie-chart';
import { Account } from '@/lib/types';
import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';
import { useQuery } from '@tanstack/react-query';
import { getAccounts } from '@/commands/account';
import { useAccountsSimplePerformance } from '@/hooks/use-accounts-simple-performance';
import { QueryKeys } from '@/lib/query-keys';

interface AccountAllocationChartProps {
  isLoading?: boolean;
  onAccountSectionClick?: (groupOrAccountName: string, accountIdsInGroup: string[]) => void;
}

export function AccountAllocationChart({ isLoading: isLoadingProp, onAccountSectionClick }: AccountAllocationChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const { data: accounts, isLoading: isLoadingAccounts } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  const {
    data: performanceData,
    isLoading: isLoadingPerformance,
  } = useAccountsSimplePerformance(accounts);

  const data = useMemo(() => {
    if (!accounts || !performanceData) return [];

    const groupedData = new Map<string, number>();

    performanceData.forEach((perf) => {
      const account = accounts.find(acc => acc.id === perf.accountId);
      if (!account) return;

      const valueAcct = Number(perf.totalValue) || 0;
      if (valueAcct <= 0) return;

      // Convert to base currency if fxRateToBase is available
      const fxRate = Number(perf.fxRateToBase) || 1; // Default to 1 if null/undefined/0
      const valueBase = valueAcct * fxRate;

      const groupName = account.group || account.name; // Use group name if available, otherwise account name
      const currentTotal = groupedData.get(groupName) || 0;
      groupedData.set(groupName, currentTotal + valueBase);
    });

    return Array.from(groupedData.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [accounts, performanceData]);

  const isLoading = isLoadingProp || isLoadingAccounts || isLoadingPerformance;

  if (isLoading) {
    return (
      <Card className="overflow-hidden backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-[180px]" />
            <Skeleton className="h-5 w-[80px]" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex h-[250px] items-center justify-center">
            <Skeleton className="h-[200px] w-[200px] rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  const handleInternalSectionClick = (sectionData: { name: string; value: number }) => {
    if (onAccountSectionClick && accounts) {
      const groupOrAccountName = sectionData.name;
      const accountIdsInGroup = accounts
        .filter(acc => (acc.group || acc.name) === groupOrAccountName)
        .map(acc => acc.id);
      
      if (accountIdsInGroup.length > 0) {
        onAccountSectionClick(groupOrAccountName, accountIdsInGroup);
      }
    }
    const clickedIndex = data.findIndex(d => d.name === sectionData.name);
    if (clickedIndex !== -1) {
        setActiveIndex(clickedIndex);
    }
  };

  return (
    <Card className="overflow-hidden backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Account Allocation
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length > 0 ? (
          <CustomPieChart
            data={data}
            activeIndex={activeIndex}
            onPieEnter={onPieEnter}
            onSectionClick={handleInternalSectionClick}
            startAngle={180}
            endAngle={0}
          />
        ) : (
          <EmptyPlaceholder description="No account valuation data available." />
        )}
      </CardContent>
    </Card>
  );
} 