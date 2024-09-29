import { useMemo } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Icons } from '@/components/icons';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';

import { ClassesChart } from './components/classes-chart';
import { HoldingsTable } from './components/holdings-table';
import { PortfolioComposition } from './components/portfolio-composition';
import { SectorsChart } from './components/sectors-chart';
import { computeHoldings } from '@/commands/portfolio';
import { useQuery } from '@tanstack/react-query';
import { Holding } from '@/lib/types';
import { HoldingCurrencyChart } from './components/currency-chart';
import { useSettingsContext } from '@/lib/settings-provider';
import { QueryKeys } from '@/lib/query-keys';
import { PortfolioHistory } from '@/lib/types';
import { getAccountHistory } from '@/commands/portfolio';
import { useLocation } from 'react-router-dom';

export const HoldingsPage = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const defaultTab = queryParams.get('tab') || 'overview';

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
    return data?.filter((holding) => holding.account?.id === 'TOTAL') || [];
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
        <Tabs defaultValue={defaultTab} className="space-y-4">
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
                    <EmptyPlaceholder
                      icon={<Icons.PieChart className="h-10 w-10" />}
                      title="No class data"
                      description="There is no class data available for your holdings."
                    />
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
                      holdings={holdings}
                      cash={todayValue?.availableCash || 0}
                      baseCurrency={settings?.baseCurrency || 'USD'}
                    />
                  ) : (
                    <EmptyPlaceholder
                      icon={<Icons.DollarSign className="h-10 w-10" />}
                      title="No currency data"
                      description="There is no currency data available for your holdings."
                    />
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
                    <EmptyPlaceholder
                      icon={<Icons.PieChart className="h-10 w-10" />}
                      title="No sector data"
                      description="There is no sector data available for your holdings."
                    />
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
                  <EmptyPlaceholder
                    icon={<Icons.BarChart className="h-10 w-10" />}
                    title="No holdings data"
                    description="There is no holdings data available for your portfolio."
                  />
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
