import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AmountDisplay } from "@wealthfolio/ui";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { AccountSelector } from "@/components/account-selector";
import { Page, PageContent, PageHeader } from "@/components/page/page";
import { Badge } from "@/components/ui/badge";
import { useHoldings } from "@/hooks/use-holdings";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import { Account, Holding, HoldingType, Instrument } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AccountAllocationChart } from "./components/account-allocation-chart";
import { CashHoldingsWidget } from "./components/cash-holdings-widget";
import { ClassesChart } from "./components/classes-chart";
import { PortfolioComposition } from "./components/composition-chart";
import { CountryChart } from "./components/country-chart";
import { HoldingCurrencyChart } from "./components/currency-chart";
import { HoldingsTable } from "./components/holdings-table";
import { SectorsChart } from "./components/sectors-chart";

// Define a type for the filter criteria
type SheetFilterType = "class" | "sector" | "country" | "currency" | "account" | "composition";

// Sticky header wrapper component with scroll animation
function StickyHeaderSection({ children }: { children: ReactNode }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (headerRef.current) {
        const scrollContainer = headerRef.current.closest("[data-page-scroll-container]");
        if (scrollContainer) {
          const scrollTop = scrollContainer.scrollTop;
          setIsScrolled(scrollTop > 10);
        }
      }
    };

    const scrollContainer = headerRef.current?.closest("[data-page-scroll-container]");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
      return () => scrollContainer.removeEventListener("scroll", handleScroll);
    }
  }, []);

  return (
    <div
      ref={headerRef}
      className={cn(
        "bg-background sticky top-0 z-10 -mx-3 space-y-3 px-3 pt-2 pb-3 transition-all duration-300 lg:static lg:mx-0 lg:space-y-2 lg:px-0 lg:pb-0",
        isScrolled && "border-border border-b shadow-sm lg:border-b-0 lg:shadow-none",
      )}
    >
      {children}
    </div>
  );
}

export const HoldingsPage = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const defaultTab = queryParams.get("tab") ?? "overview";

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

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState("");
  const [sheetFilterType, setSheetFilterType] = useState<SheetFilterType | null>(null);
  const [sheetFilterName, setSheetFilterName] = useState<string | null>(null);
  const [sheetCompositionFilter, setSheetCompositionFilter] = useState<Instrument["id"] | null>(
    null,
  );
  // Removed unused sheetAccountIdsFilter state

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

  const { cashHoldings, nonCashHoldings } = useMemo(() => {
    const cash =
      holdings?.filter((holding) => holding.holdingType?.toLowerCase() === HoldingType.CASH) ?? [];
    const nonCash =
      holdings?.filter((holding) => holding.holdingType?.toLowerCase() !== HoldingType.CASH) ?? [];
    return { cashHoldings: cash, nonCashHoldings: nonCash };
  }, [holdings]);

  return (
    <Page>
      <Tabs defaultValue={defaultTab} className="flex h-full w-full flex-col overflow-hidden">
        <TabsContent value="holdings" className="min-h-0 flex-1 overflow-hidden">
          <PageContent className="space-y-0">
            <StickyHeaderSection>
              <PageHeader heading="Holdings">
                <TabsList
                  aria-label="Holdings views"
                  className="rounded-full"
                  // className="bg-secondary max-w-full overflow-x-auto rounded-full p-1 whitespace-nowrap"
                >
                  <TabsTrigger className="rounded-full" value="overview">
                    Analytics
                  </TabsTrigger>
                  <TabsTrigger className="rounded-full" value="holdings">
                    Positions
                  </TabsTrigger>
                </TabsList>
              </PageHeader>
              <div className="space-y-3">
                <AccountSelector
                  selectedAccount={selectedAccount}
                  setSelectedAccount={handleAccountSelect}
                  variant="dropdown"
                  includePortfolio={true}
                />
                <CashHoldingsWidget cashHoldings={cashHoldings ?? []} isLoading={isLoading} />
              </div>
            </StickyHeaderSection>
            <div className="space-y-4 pt-4">
              <HoldingsTable holdings={nonCashHoldings ?? []} isLoading={isLoading} />
            </div>
          </PageContent>
        </TabsContent>

        <TabsContent value="overview" className="min-h-0 flex-1 overflow-hidden">
          <PageContent className="space-y-0">
            <StickyHeaderSection>
              <PageHeader heading="Holdings">
                <TabsList
                  aria-label="Holdings views"
                  className="rounded-full"
                  // className="bg-secondary max-w-full overflow-x-auto rounded-full p-1 whitespace-nowrap"
                >
                  <TabsTrigger className="rounded-full" value="overview">
                    Analytics
                  </TabsTrigger>
                  <TabsTrigger className="rounded-full" value="holdings">
                    Positions
                  </TabsTrigger>
                </TabsList>
              </PageHeader>
              <div className="space-y-3">
                <AccountSelector
                  selectedAccount={selectedAccount}
                  setSelectedAccount={handleAccountSelect}
                  variant="dropdown"
                  includePortfolio={true}
                />
                <CashHoldingsWidget cashHoldings={cashHoldings ?? []} isLoading={isLoading} />
              </div>
            </StickyHeaderSection>
            <div className="space-y-4 pt-4">
              {/* Top row: Summary widgets */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <HoldingCurrencyChart
                  holdings={holdings ?? []}
                  baseCurrency={settings?.baseCurrency ?? "USD"}
                  isLoading={isLoading}
                  onCurrencySectionClick={(currencyName) =>
                    handleChartSectionClick("currency", currencyName, `Holdings in ${currencyName}`)
                  }
                />

                <AccountAllocationChart isLoading={isLoading} />

                <ClassesChart
                  holdings={holdings}
                  isLoading={isLoading}
                  onClassSectionClick={(className) =>
                    handleChartSectionClick("class", className, `Asset Class: ${className}`)
                  }
                />

                <CountryChart
                  holdings={nonCashHoldings}
                  isLoading={isLoading}
                  onCountrySectionClick={(countryName) =>
                    handleChartSectionClick("country", countryName, `Holdings in ${countryName}`)
                  }
                />
              </div>

              {/* Second row: Composition and Sector */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="col-span-1 md:col-span-3">
                  <PortfolioComposition holdings={nonCashHoldings ?? []} isLoading={isLoading} />
                </div>

                {/* Sectors Chart - Now self-contained */}
                <div className="col-span-1 h-full">
                  <SectorsChart
                    holdings={nonCashHoldings}
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
          </PageContent>
        </TabsContent>
      </Tabs>

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
