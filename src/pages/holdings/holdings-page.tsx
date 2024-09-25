import { useMemo } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Icons } from '@/components/icons';

import { ClassesChart } from './components/classes-chart';
import { HoldingsTable } from './components/holdings-table';
import { PortfolioComposition } from './components/portfolio-composition';
import { SectorsChart } from './components/sectors-chart';
import { computeHoldings } from '@/commands/portfolio';
import { useQuery } from '@tanstack/react-query';
import { aggregateHoldingsBySymbol } from '@/lib/portfolio-helper';
import { Holding } from '@/lib/types';
import { HoldingCurrencyChart } from './components/currency-chart';
import { useSettingsContext } from '@/lib/settings-provider';
import { QueryKeys } from '@/lib/query-keys';
import { PortfolioHistory } from '@/lib/types';
import { getAccountHistory } from '@/commands/portfolio';

export const HoldingsPage = () => {
  const { settings } = useSettingsContext();
  const { data, isLoading } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS],
    queryFn: computeHoldings,
  });

  const { data: portfolioHistory } = useQuery<PortfolioHistory[], Error>({
    queryKey: QueryKeys.accountHistory('TOTAL'),
    queryFn: () => getAccountHistory('TOTAL'),
  });

  const todayValue = portfolioHistory?.[portfolioHistory.length - 1];

  const holdings = useMemo(() => {
    return aggregateHoldingsBySymbol(data || []);
  }, [data]);

  return (
    <ApplicationShell className="p-6">
      <ApplicationHeader heading="Holdings">
        <div className="flex items-center space-x-2">
          {/* <Button size="sm">
            <Icons.PlusCircle className="mr-2 h-4 w-4" />
            Add Asset
          </Button> */}
        </div>
      </ApplicationHeader>
      <div className="">
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
          </TabsList>
          <TabsContent value="holdings" className="space-y-4">
            <HoldingsTable holdings={holdings || []} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-md font-medium">By Class</CardTitle>
                </CardHeader>
                <CardContent className="overflow-scroll p-0">
                  {holdings && holdings.length > 0 ? (
                    <ClassesChart assets={holdings} cash={todayValue?.availableCash || 0} />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6">
                      <Icons.PieChart className="h-12 w-12 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">No data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-md font-medium">By Currency</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {holdings && holdings.length > 0 ? (
                    <HoldingCurrencyChart
                      assets={holdings}
                      cash={todayValue?.availableCash || 0}
                      baseCurrency={settings?.baseCurrency || 'USD'}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6">
                      <Icons.DollarSign className="h-12 w-12 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        No currency data available
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-md font-medium">By Sector</CardTitle>
                </CardHeader>
                <CardContent className="w-full">
                  {holdings && holdings.length > 0 ? (
                    <SectorsChart assets={holdings} />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6">
                      <Icons.PieChart className="h-12 w-12 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">No sector data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            <Card className="">
              <CardHeader>
                <CardTitle className="text-md font-medium">Holding</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                {holdings && holdings.length > 0 ? (
                  <PortfolioComposition assets={holdings} />
                ) : (
                  <div className="flex flex-col items-center justify-center p-6">
                    <Icons.BarChart className="h-12 w-12 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">No holdings data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ApplicationShell>
  );
};

export default HoldingsPage;
