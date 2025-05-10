import { useMemo, useState } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { AmountDisplay } from '@/components/amount-display';

import { ClassesChart } from './components/classes-chart';
import { HoldingsTable } from './components/holdings-table';
import { PortfolioComposition } from './components/composition-chart';
import { SectorsChart } from './components/sectors-chart';
import { getHoldings } from '@/commands/portfolio';
import { useQuery } from '@tanstack/react-query';
import { Account, Holding, HoldingType, Instrument } from '@/lib/types';
import { useSettingsContext } from '@/lib/settings-provider';
import { QueryKeys } from '@/lib/query-keys';
import { useLocation } from 'react-router-dom';
import { CountryChart } from './components/country-chart';
import { CashHoldingsWidget } from './components/cash-holdings-widget';
import { AccountSelector } from '@/components/account-selector';
import { PORTFOLIO_ACCOUNT_ID } from '@/lib/constants';
import { HoldingCurrencyChart } from './components/currency-chart';
import { AccountAllocationChart } from './components/account-allocation-chart';
import { Badge } from '@/components/ui/badge';

// Define a type for the filter criteria
type SheetFilterType = 'class' | 'sector' | 'country' | 'currency' | 'account' | 'composition';

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

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetFilterType, setSheetFilterType] = useState<SheetFilterType | null>(null);
  const [sheetFilterName, setSheetFilterName] = useState<string | null>(null);
  const [sheetCompositionFilter, setSheetCompositionFilter] = useState<Instrument['id'] | null>(null);
  const [sheetAccountIdsFilter, setSheetAccountIdsFilter] = useState<string[] | null>(null);

  const handleChartSectionClick = (
    type: SheetFilterType,
    name: string,
    title?: string,
    compositionId?: Instrument['id'],
    accountIdsForFilter?: string[]
  ) => {
    setSheetFilterType(type);
    setSheetFilterName(name);
    setSheetTitle(title || `Details for ${name}`);
    if (type === 'composition' && compositionId) {
      setSheetCompositionFilter(compositionId);
    } else {
      setSheetCompositionFilter(null);
    }
    if (type === 'account' && accountIdsForFilter) {
      setSheetAccountIdsFilter(accountIdsForFilter);
    } else {
      setSheetAccountIdsFilter(null);
    }
    setIsSheetOpen(true);
  };

  const holdingsForSheet = useMemo(() => {
    if (!sheetFilterType || !holdings) return [];

    switch (sheetFilterType) {
      case 'class':
        return holdings.filter((h) => {
          const isCash = h.holdingType === HoldingType.CASH;
          const assetSubClass = isCash ? 'Cash' : h.instrument?.assetSubclass || 'Other';
          return assetSubClass === sheetFilterName;
        });
      case 'sector':
        return holdings.filter(
          (h) => h.instrument?.sectors?.some((s) => s.name === sheetFilterName)
        );
      case 'country':
        return holdings.filter(
          (h) => h.instrument?.countries?.some((c) => c.name === sheetFilterName)
        );
      case 'currency':
        return holdings.filter((h) => h.localCurrency === sheetFilterName);

      case 'composition':
        if (sheetCompositionFilter) {
           return holdings.filter(h => h.instrument?.id === sheetCompositionFilter);
        }
        if(sheetFilterName) {
            return holdings.filter(h => h.instrument?.assetSubclass === sheetFilterName || h.instrument?.assetClass === sheetFilterName);
        }
        return [];

      default:
        return [];
    }
  }, [holdings, sheetFilterType, sheetFilterName, sheetCompositionFilter, sheetAccountIdsFilter]);

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HoldingCurrencyChart
              holdings={holdings || []}
              baseCurrency={settings?.baseCurrency || 'USD'}
              isLoading={isLoading}
              onCurrencySectionClick={(currencyName) => handleChartSectionClick('currency', currencyName, `Holdings in ${currencyName}`)}
            />

            <AccountAllocationChart 
              isLoading={isLoading} 
            />

            <ClassesChart 
              holdings={holdings} 
              isLoading={isLoading} 
              onClassSectionClick={(className) => handleChartSectionClick('class', className, `Asset Class: ${className}`)}
            />

            <CountryChart 
              holdings={nonCashHoldings} 
              isLoading={isLoading} 
              onCountrySectionClick={(countryName) => handleChartSectionClick('country', countryName, `Holdings in ${countryName}`)}
            />
          </div>

          {/* Second row: Composition and Sector */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="col-span-1 md:col-span-3">
              <PortfolioComposition 
                holdings={nonCashHoldings} 
                isLoading={isLoading} 
              />
            </div>

            {/* Sectors Chart - Now self-contained */}
            <div className="col-span-1 h-full">
              <SectorsChart 
                holdings={nonCashHoldings} 
                isLoading={isLoading} 
                onSectorSectionClick={(sectorName) => handleChartSectionClick('sector', sectorName, `Holdings in Sector: ${sectorName}`)}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription>
              View a breakdown of your holdings filtered by this category.
            </SheetDescription>
          </SheetHeader>
          <div className="py-8">
            {holdingsForSheet.length > 0 ? (
              <ul className="space-y-2">
                {holdingsForSheet.map((holding) => {
                  let displayName = 'N/A';
                  let symbol = '-';
                  if (holding.holdingType === HoldingType.CASH) {
                    displayName = holding.localCurrency ? `Cash (${holding.localCurrency})` : 'Cash';
                    symbol = `$CASH-${holding.localCurrency}`;
                  } else if (holding.instrument) {
                    displayName = holding.instrument.name || holding.instrument.symbol || 'Unnamed Security';
                    symbol = holding.instrument.symbol || '-';
                  }

                  return (
                    <li
                      key={holding.id}
                      className="flex justify-between rounded-md border p-3 text-sm"
                    >
                      <div className="flex items-center">
                        <Badge className="flex min-w-[50px] cursor-pointer items-center justify-center rounded-sm">
                          {symbol}
                        </Badge>

                        <span className="ml-2 line-clamp-1">
                          {displayName}
                        </span>
                      </div>
                      <span className="text-right font-semibold">
                        <AmountDisplay
                          value={Number(holding.marketValue?.base) || 0}
                          currency={holding.baseCurrency}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No holdings found for this selection.</p>
            )}
          </div>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">Close</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ApplicationShell>
  );
};

export default HoldingsPage;
