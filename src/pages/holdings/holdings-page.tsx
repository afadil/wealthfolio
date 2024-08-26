import { useMemo } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ClassesChart } from './components/classes-chart';
import { HoldingsTable } from './components/holdings-table';
import { PortfolioComposition } from './components/portfolio-composition';
import { SectorsChart } from './components/sectors-chart';
import { computeHoldings, getHistorical } from '@/commands/portfolio';
import { useQuery } from '@tanstack/react-query';
import { aggregateHoldingsBySymbol } from '@/lib/portfolio-helper';
import { FinancialHistory, Holding } from '@/lib/types';
import { HoldingCurrencyChart } from './components/currency-chart';
import { useSettingsContext } from '@/lib/settings-provider';
import { IncomeDashboard } from './components/income-dashboard';

export const HoldingsPage = () => {
  const { settings } = useSettingsContext();
  const { data, isLoading } = useQuery<Holding[], Error>({
    queryKey: ['holdings'],
    queryFn: computeHoldings,
  });

  const { data: historyData } = useQuery<FinancialHistory[], Error>({
    queryKey: ['portfolio_history'],
    queryFn: getHistorical,
  });

  const portfolio = historyData?.find((history) => history.account?.id === 'TOTAL');
  const todayValue = portfolio?.history[portfolio?.history.length - 1];

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
            <TabsTrigger value="dividends">Income</TabsTrigger>
          </TabsList>
          <TabsContent value="holdings" className="space-y-4">
            <HoldingsTable holdings={holdings || []} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="dividends" className="space-y-4">
            <IncomeDashboard />
          </TabsContent>
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-md font-medium">By Class</CardTitle>
                </CardHeader>
                <CardContent className="overflow-scroll p-0">
                  <ClassesChart assets={holdings || []} cash={todayValue?.availableCash || 0} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-md font-medium">By Currency</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <HoldingCurrencyChart
                    assets={holdings || []}
                    cash={todayValue?.availableCash || 0}
                    baseCurrency={settings?.baseCurrency || 'USD'}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-md font-medium">By Sector</CardTitle>
                </CardHeader>
                <CardContent className="w-full">
                  <SectorsChart assets={holdings || []} />
                </CardContent>
              </Card>
            </div>
            <Card className="">
              <CardHeader>
                <CardTitle className="text-md font-medium">Holding</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                <PortfolioComposition assets={holdings || []} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ApplicationShell>
  );
};

export default HoldingsPage;
