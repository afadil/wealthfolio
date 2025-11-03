import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AmountDisplay, AnimatedToggleGroup } from "@wealthfolio/ui";
import { useMemo, useState } from "react";

import { AccountSelector } from "@/components/account-selector";
import type { SwipablePageView } from "@/components/page";
import { SwipablePage } from "@/components/page";
import { useAccounts } from "@/hooks/use-accounts";
import { useHapticFeedback } from "@/hooks/use-haptic-feedback";
import { useHoldings } from "@/hooks/use-holdings";
import { usePlatform } from "@/hooks/use-platform";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import { Account, Holding, HoldingType, Instrument } from "@/lib/types";
import { AccountAllocationChart } from "./components/account-allocation-chart";
import { CashHoldingsWidget } from "./components/cash-holdings-widget";
import { ClassesChart } from "./components/classes-chart";
import { PortfolioComposition } from "./components/composition-chart";
import { CountryChart } from "./components/country-chart";
import { HoldingCurrencyChart } from "./components/currency-chart";
import { HoldingsMobileFilterSheet } from "./components/holdings-mobile-filter-sheet";
import { HoldingsTable } from "./components/holdings-table";
import { HoldingsTableMobile } from "./components/holdings-table-mobile";
import { SectorsChart } from "./components/sectors-chart";

// Define a type for the filter criteria
type SheetFilterType = "class" | "sector" | "country" | "currency" | "account" | "composition";

export const HoldingsPage = () => {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>({
    id: PORTFOLIO_ACCOUNT_ID,
    name: "All Portfolio",
    accountType: "PORTFOLIO" as unknown as Account["accountType"],
    balance: 0,
    currency: "USD",
    isDefault: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Account);

  const { settings } = useSettingsContext();

  const { holdings, isLoading } = useHoldings(selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID);
  const { accounts } = useAccounts();
  const { isMobile: isMobilePlatform } = usePlatform();
  const triggerHaptic = useHapticFeedback();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState("");
  const [sheetFilterType, setSheetFilterType] = useState<SheetFilterType | null>(null);
  const [sheetFilterName, setSheetFilterName] = useState<string | null>(null);
  const [sheetCompositionFilter, setSheetCompositionFilter] = useState<Instrument["id"] | null>(
    null,
  );

  // Mobile filter state
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const handleChartSectionClick = (
    type: SheetFilterType,
    name: string,
    title?: string,
    compositionId?: Instrument["id"],
    _accountIdsForFilter?: string[],
  ) => {
    setSheetFilterType(type);
    setSheetFilterName(name);
    setSheetTitle(title ?? `Details for ${name}`);
    if (type === "composition" && compositionId) {
      setSheetCompositionFilter(compositionId);
    } else {
      setSheetCompositionFilter(null);
    }
    setIsSheetOpen(true);
  };

  const holdingsForSheet = useMemo(() => {
    if (!sheetFilterType || !holdings) {
      return [];
    }

    let filteredHoldings: Holding[] = [];

    switch (sheetFilterType) {
      case "class":
        filteredHoldings = holdings.filter((h) => {
          const isCash = h.holdingType === HoldingType.CASH;
          const assetSubClass = isCash ? "Cash" : (h.instrument?.assetSubclass ?? "Other");
          return assetSubClass === sheetFilterName;
        });
        break;
      case "sector":
        filteredHoldings = holdings.filter((h) =>
          h.instrument?.sectors?.some((s) => s.name === sheetFilterName),
        );
        break;
      case "country":
        filteredHoldings = holdings.filter((h) =>
          h.instrument?.countries?.some((c) => c.name === sheetFilterName),
        );
        break;
      case "currency":
        filteredHoldings = holdings.filter((h) => h.localCurrency === sheetFilterName);
        break;
      case "composition":
        if (sheetCompositionFilter) {
          filteredHoldings = holdings.filter((h) => h.instrument?.id === sheetCompositionFilter);
        } else if (sheetFilterName) {
          filteredHoldings = holdings.filter(
            (h) =>
              h.instrument?.assetSubclass === sheetFilterName ||
              h.instrument?.assetClass === sheetFilterName,
          );
        }
        break;
      default:
        break;
    }

    return filteredHoldings.sort((a, b) => {
      const bBase = b.marketValue?.base ?? 0;
      const aBase = a.marketValue?.base ?? 0;
      return Number(bBase) - Number(aBase);
    });
  }, [holdings, sheetFilterType, sheetFilterName, sheetCompositionFilter]);

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
  };

  const { cashHoldings, nonCashHoldings, filteredNonCashHoldings } = useMemo(() => {
    const cash =
      holdings?.filter((holding) => holding.holdingType?.toLowerCase() === HoldingType.CASH) ?? [];
    const nonCash =
      holdings?.filter((holding) => holding.holdingType?.toLowerCase() !== HoldingType.CASH) ?? [];

    // Apply asset type filter
    const filtered =
      selectedTypes.length > 0
        ? nonCash.filter(
            (holding) =>
              holding.instrument?.assetSubclass &&
              selectedTypes.includes(holding.instrument.assetSubclass),
          )
        : nonCash;

    return { cashHoldings: cash, nonCashHoldings: nonCash, filteredNonCashHoldings: filtered };
  }, [holdings, selectedTypes]);

  const hasActiveFilters = useMemo(() => {
    const hasAccountFilter = selectedAccount?.id !== PORTFOLIO_ACCOUNT_ID;
    const hasTypeFilter = selectedTypes.length > 0;
    return hasAccountFilter || hasTypeFilter;
  }, [selectedAccount, selectedTypes]);

  const renderHoldingsView = () => (
    <div className="space-y-4 p-2 lg:p-4">
      <div className="hidden md:block">
        <HoldingsTable holdings={filteredNonCashHoldings ?? []} isLoading={isLoading} />
      </div>
      <div className="block md:hidden">
        <HoldingsTableMobile
          holdings={nonCashHoldings ?? []}
          isLoading={isLoading}
          selectedTypes={selectedTypes}
          setSelectedTypes={setSelectedTypes}
          selectedAccount={selectedAccount}
          accounts={accounts ?? []}
          onAccountChange={handleAccountSelect}
          showSearch={true}
          showFilterButton={false}
        />
      </div>
    </div>
  );

  const renderAnalyticsView = () => (
    <div className="space-y-4 p-2 lg:p-4">
      {/* Cash Holdings Widget */}
      <CashHoldingsWidget cashHoldings={cashHoldings ?? []} isLoading={isLoading} />

      {/* Top row: Summary widgets */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HoldingCurrencyChart
          holdings={[...cashHoldings, ...filteredNonCashHoldings]}
          baseCurrency={settings?.baseCurrency ?? "USD"}
          isLoading={isLoading}
          onCurrencySectionClick={(currencyName) =>
            handleChartSectionClick("currency", currencyName, `Holdings in ${currencyName}`)
          }
        />

        <AccountAllocationChart isLoading={isLoading} />

        <ClassesChart
          holdings={[...cashHoldings, ...filteredNonCashHoldings]}
          isLoading={isLoading}
          onClassSectionClick={(className) =>
            handleChartSectionClick("class", className, `Asset Class: ${className}`)
          }
        />

        <CountryChart
          holdings={filteredNonCashHoldings}
          isLoading={isLoading}
          onCountrySectionClick={(countryName) =>
            handleChartSectionClick("country", countryName, `Holdings in ${countryName}`)
          }
        />
      </div>

      {/* Second row: Composition and Sector */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="col-span-1 lg:col-span-3">
          <PortfolioComposition holdings={filteredNonCashHoldings ?? []} isLoading={isLoading} />
        </div>

        {/* Sectors Chart - Now self-contained */}
        <div className="col-span-1">
          <SectorsChart
            holdings={filteredNonCashHoldings}
            isLoading={isLoading}
            onSectorSectionClick={(sectorName) =>
              handleChartSectionClick("sector", sectorName, `Holdings in Sector: ${sectorName}`)
            }
          />
        </div>
      </div>
    </div>
  );

  const views: SwipablePageView[] = [
    { value: "holdings", label: "Holdings", content: renderHoldingsView() },
    { value: "analytics", label: "Insights", content: renderAnalyticsView() },
  ];

  const filterButton = (
    <Button
      variant="outline"
      size="icon"
      className="relative size-9 flex-shrink-0"
      onClick={() => setIsFilterSheetOpen(true)}
    >
      <Icons.ListFilter className="h-4 w-4" />
      {hasActiveFilters && (
        <span className="bg-destructive absolute top-0.5 right-0 h-2 w-2 rounded-full" />
      )}
    </Button>
  );

  const renderActions = (currentView: string, onViewChange: (view: string) => void) => (
    <div className="flex items-center gap-2">
      {/* Mobile: Only show filter button */}
      <div className="md:hidden">{filterButton}</div>

      {/* Desktop: Show account selector + toggle */}
      <div className="hidden md:flex md:items-center md:gap-2">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
        <AnimatedToggleGroup
          items={views.map((v) => ({ value: v.value, label: v.label }))}
          value={currentView}
          onValueChange={onViewChange}
          className="max-w-full"
        />
      </div>
    </div>
  );

  return (
    <>
      <SwipablePage
        views={views}
        heading="Holdings"
        defaultView="holdings"
        isMobile={isMobilePlatform}
        actions={renderActions}
        withPadding={false}
        onViewChange={triggerHaptic}
      />

      {/* Mobile Filter Sheet */}
      <HoldingsMobileFilterSheet
        open={isFilterSheetOpen}
        onOpenChange={setIsFilterSheetOpen}
        selectedAccount={selectedAccount}
        accounts={accounts ?? []}
        onAccountChange={handleAccountSelect}
        selectedTypes={selectedTypes}
        setSelectedTypes={setSelectedTypes}
      />

      {/* Details Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-lg [&>button]:top-[max(calc(env(safe-area-inset-top,0px)+1rem),2.5rem)]"
          style={{
            paddingTop: "max(env(safe-area-inset-top, 0px), 1.5rem)",
          }}
        >
          <SheetHeader className="mt-8">
            <SheetTitle>{sheetTitle}</SheetTitle>
          </SheetHeader>
          <div className="py-8">
            {holdingsForSheet.length > 0 ? (
              <ul className="space-y-2">
                {holdingsForSheet.map((holding) => {
                  let displayName = "N/A";
                  let symbol = "-";
                  if (holding.holdingType === HoldingType.CASH) {
                    displayName = holding.localCurrency
                      ? `Cash (${holding.localCurrency})`
                      : "Cash";
                    symbol = `$CASH-${holding.localCurrency}`;
                  } else if (holding.instrument) {
                    displayName =
                      holding.instrument.name ?? holding.instrument.symbol ?? "Unnamed Security";
                    symbol = holding.instrument.symbol ?? "-";
                  }

                  return (
                    <Card key={holding.id} className="flex items-center justify-between text-sm">
                      <CardHeader className="flex w-full flex-row items-center justify-between space-x-2 p-4">
                        <div className="flex items-center space-x-2">
                          <Badge className="flex min-w-[50px] cursor-pointer items-center justify-center rounded-sm">
                            {symbol}
                          </Badge>
                          <CardTitle className="line-clamp-1 text-sm font-normal">
                            {displayName}
                          </CardTitle>
                        </div>
                        <div className="text-right font-semibold">
                          <AmountDisplay
                            value={Number(holding.marketValue?.base ?? 0)}
                            currency={holding.baseCurrency}
                          />
                        </div>
                      </CardHeader>
                    </Card>
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
    </>
  );
};

export default HoldingsPage;
