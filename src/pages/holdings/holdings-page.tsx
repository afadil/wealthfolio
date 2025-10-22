import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AmountDisplay, AnimatedToggleGroup } from "@wealthfolio/ui";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AccountSelector } from "@/components/account-selector";
import { Page, PageContent, PageHeader } from "@/components/page/page";
import { useAccounts } from "@/hooks/use-accounts";
import { useHoldings } from "@/hooks/use-holdings";
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

// Deprecated local sticky wrapper removed — PageHeader handles stickiness.

type HoldingsView = "overview" | "positions";

export const HoldingsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const defaultTab = (queryParams.get("tab") as HoldingsView) ?? "overview";
  const [view, setView] = useState<HoldingsView>(defaultTab);

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

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState("");
  const [sheetFilterType, setSheetFilterType] = useState<SheetFilterType | null>(null);
  const [sheetFilterName, setSheetFilterName] = useState<string | null>(null);
  const [sheetCompositionFilter, setSheetCompositionFilter] = useState<Instrument["id"] | null>(
    null,
  );
  // Removed unused sheetAccountIdsFilter state

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

  return (
    <Page>
      <PageHeader
        heading="Holdings"
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden md:block">
              <AccountSelector
                selectedAccount={selectedAccount}
                setSelectedAccount={handleAccountSelect}
                variant="dropdown"
                includePortfolio={true}
              />
            </div>
            <AnimatedToggleGroup
              items={[
                { value: "overview", label: "Analytics" },
                { value: "positions", label: "Positions" },
              ]}
              value={view}
              onValueChange={(next: HoldingsView) => {
                setView(next);
                const url = `${location.pathname}?tab=${next}`;
                navigate(url, { replace: true });
              }}
              size="sm"
              className="max-w-full"
            />
          </div>
        }
      />

      <PageContent withPadding={false}>
        {view === "positions" ? (
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
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-2 lg:p-4">
            {/* Mobile Filter Button - Analytics View */}
            <div className="flex justify-end md:hidden">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                onClick={() => setIsFilterSheetOpen(true)}
              >
                <div className="relative">
                  <Icons.ListFilter className="h-4 w-4" />
                  {hasActiveFilters && (
                    <span className="bg-primary absolute -top-1 -left-[1.5px] h-2 w-2 rounded-full" />
                  )}
                </div>
              </Button>
            </div>

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
                <PortfolioComposition
                  holdings={filteredNonCashHoldings ?? []}
                  isLoading={isLoading}
                />
              </div>

              {/* Sectors Chart - Now self-contained */}
              <div className="col-span-1 h-full">
                <SectorsChart
                  holdings={filteredNonCashHoldings}
                  isLoading={isLoading}
                  onSectorSectionClick={(sectorName) =>
                    handleChartSectionClick(
                      "sector",
                      sectorName,
                      `Holdings in Sector: ${sectorName}`,
                    )
                  }
                />
              </div>
            </div>
          </div>
        )}
      </PageContent>

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
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
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
    </Page>
  );
};

export default HoldingsPage;
