import { useMemo, useState } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ClassesChart } from './components/classes-chart';
import { HoldingsTable } from './components/holdings-table';
import { PortfolioComposition } from './components/composition-chart';
import { SectorsChart } from './components/sectors-chart';
import { getHoldings } from '@/commands/portfolio';
import { useQuery } from '@tanstack/react-query';
import { Account, Holding, HoldingType } from '@/lib/types';
import { useSettingsContext } from '@/lib/settings-provider';
import { QueryKeys } from '@/lib/query-keys';
import { useLocation } from 'react-router-dom';
import { CountryChart } from './components/country-chart';
import { CashHoldingsWidget } from './components/cash-holdings-widget';
import { AccountSelector } from '@/components/account-selector';
import { PORTFOLIO_ACCOUNT_ID } from '@/lib/constants';
import { HoldingCurrencyChart } from './components/currency-chart';

export const HoldingsPage = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const defaultTab = queryParams.get('tab') || 'overview';

  const [selectedAccount, setSelectedAccount] = useState<Account | null>({
    id: PORTFOLIO_ACCOUNT_ID,
    name: 'All Portfolio',
    accountType: 'PORTFOLIO' as any,
    balance: 0,
    currency: 'USD',
    isDefault: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Account);

  const { settings } = useSettingsContext();

  const { data: holdings, isLoading } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS, selectedAccount?.id || PORTFOLIO_ACCOUNT_ID],
    queryFn: () => getHoldings(selectedAccount?.id || PORTFOLIO_ACCOUNT_ID),
  });


  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
  };

  const { cashHoldings, nonCashHoldings } = useMemo(() => {
    const cash =
      holdings?.filter((holding) => holding.holdingType?.toLowerCase() === HoldingType.CASH) || [];
    const nonCash =
      holdings?.filter((holding) => holding.holdingType?.toLowerCase() !== HoldingType.CASH) || [];
    return { cashHoldings: cash, nonCashHoldings: nonCash };
  }, [holdings]);

  return (
    <ApplicationShell className="p-6">
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <div className="space-y-2">
          <ApplicationHeader heading="Holdings">
            <div className="flex items-center space-x-2">
              <AccountSelector
                selectedAccount={selectedAccount}
                setSelectedAccount={handleAccountSelect}
                variant="dropdown"
                includePortfolio={true}
              />
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
          <CashHoldingsWidget cashHoldings={cashHoldings || []} isLoading={isLoading} />
        </div>

        <TabsContent value="holdings" className="space-y-4">
          <HoldingsTable holdings={nonCashHoldings || []} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="overview" className="space-y-4">
          {/* Top row: Summary widgets */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <HoldingCurrencyChart
              holdings={holdings || []}
              baseCurrency={settings?.baseCurrency || 'USD'}
              isLoading={isLoading}
            />

            <ClassesChart holdings={holdings} isLoading={isLoading} />

            <CountryChart holdings={holdings} isLoading={isLoading} />
          </div>

          {/* Second row: Composition and Sector */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="col-span-1 md:col-span-2">
              <PortfolioComposition holdings={nonCashHoldings} isLoading={isLoading} />
            </div>

            {/* Sectors Chart - Now self-contained */}
            <div className="col-span-1">
              <SectorsChart holdings={holdings || []} isLoading={isLoading} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </ApplicationShell>
  );
};

export default HoldingsPage;
