import { useMemo } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Icons } from '@/components/icons';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';

import { ClassesChart } from './components/classes-chart';
import { HoldingsTable } from './components/holdings-table';
import { PortfolioComposition } from './components/composition-chart';
import { SectorsChart } from './components/sectors-chart';
import { computeHoldings } from '@/commands/portfolio';
import { useQuery } from '@tanstack/react-query';
import { Holding, HoldingType } from '@/lib/types';
import { HoldingCurrencyChart } from './components/currency-chart';
import { useSettingsContext } from '@/lib/settings-provider';
import { QueryKeys } from '@/lib/query-keys';
import { useLocation } from 'react-router-dom';
import { CountryChart } from './components/country-chart';

const PORTFOLIO_ACCOUNT_ID = 'PORTFOLIO';

export const HoldingsPage = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const defaultTab = queryParams.get('tab') || 'overview';

  const { settings } = useSettingsContext();
  const { data, isLoading } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS],
    queryFn: computeHoldings,
  });

  const holdings = useMemo(() => {
    return data?.filter((holding) => holding.account?.id === PORTFOLIO_ACCOUNT_ID) || [];
  }, [data]);

  const nonCashHoldings = useMemo(() => {
    return holdings.filter((holding) => holding.holdingType !== HoldingType.CASH);
  }, [holdings]);

  return (
    <ApplicationShell className="p-6">
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <ApplicationHeader heading="Holdings">
          <div className="flex items-center space-x-2">
            <TabsList className="flex space-x-1 rounded-full bg-secondary p-1">
              <TabsTrigger
                className="h-8 rounded-full px-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90"
                value="overview"
              >
                Analytics
              </TabsTrigger>
              <TabsTrigger
                className="h-8 rounded-full px-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90"
                value="holdings"
              >
                Positions
              </TabsTrigger>
            </TabsList>
          </div>
        </ApplicationHeader>

        <TabsContent value="holdings" className="space-y-4">
          <HoldingsTable holdings={holdings} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-12 gap-4">
            <Card className="col-span-12 lg:col-span-4">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">By Class</CardTitle>
                <Icons.DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {holdings && holdings.length > 0 ? (
                  <ClassesChart holdings={holdings} />
                ) : (
                  <EmptyPlaceholder
                    icon={<Icons.PieChart className="h-10 w-10" />}
                    title="No class data"
                    description="There is no class data available for your holdings."
                  />
                )}
              </CardContent>
            </Card>
            <Card className="col-span-12 lg:col-span-4">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">By Currency</CardTitle>
                <Icons.WalletCards className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-0">
                {holdings && holdings.length > 0 ? (
                  <HoldingCurrencyChart
                    holdings={holdings}
                    baseCurrency={settings?.baseCurrency || 'USD'}
                  />
                ) : (
                  <EmptyPlaceholder
                    icon={<Icons.WalletCards className="h-10 w-10" />}
                    title="No currency data"
                    description="There is no currency data available for your holdings."
                  />
                )}
              </CardContent>
            </Card>
            <Card className="col-span-12 lg:col-span-4">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">By Country</CardTitle>
                <Icons.Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="w-full">
                {holdings && holdings.length > 0 ? (
                  <CountryChart holdings={nonCashHoldings} />
                ) : (
                  <EmptyPlaceholder
                    icon={<Icons.Globe className="h-10 w-10" />}
                    title="No country data"
                    description="There is no country data available for your holdings."
                  />
                )}
              </CardContent>
            </Card>

            {/* Second row: Composition and Sector */}
            <div className="col-span-12 lg:col-span-8">
              {holdings && holdings.length > 0 ? (
                <PortfolioComposition assets={nonCashHoldings} />
              ) : (
                <EmptyPlaceholder
                  icon={<Icons.BarChart className="h-10 w-10" />}
                  title="No holdings data"
                  description="There is no holdings data available for your portfolio."
                />
              )}
            </div>
            <Card className="col-span-12 lg:col-span-4">
              <CardHeader>
                <CardTitle className="text-md font-medium">By Sector</CardTitle>
              </CardHeader>
              <CardContent className="w-full">
                {holdings && holdings.length > 0 ? (
                  <SectorsChart assets={nonCashHoldings} />
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
        </TabsContent>
      </Tabs>
    </ApplicationShell>
  );
};

export default HoldingsPage;
