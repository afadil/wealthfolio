import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import { AmountDisplay, EmptyPlaceholder } from "@wealthfolio/ui";
import { useMemo, useState } from "react";

import { AccountSelector } from "@/components/account-selector";
import { useHoldings } from "@/hooks/use-holdings";
import { PORTFOLIO_ACCOUNT_ID, isAlternativeAssetId } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import { Account, Holding, HoldingType, Instrument } from "@/lib/types";
import { useNavigate } from "react-router-dom";
import { AccountAllocationChart } from "./components/account-allocation-chart";
import { CashHoldingsWidget } from "./components/cash-holdings-widget";
import { ClassesChart } from "./components/classes-chart";
import { PortfolioComposition } from "./components/composition-chart";
import { CountryChart } from "./components/country-chart";
import { HoldingCurrencyChart } from "./components/currency-chart";
import { SectorsChart } from "./components/sectors-chart";

// Define a type for the filter criteria
type SheetFilterType = "class" | "sector" | "country" | "currency" | "account" | "composition";

export const HoldingsInsightsPage = () => {
  const navigate = useNavigate();
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
          // Check taxonomy assetType first, fall back to legacy assetSubclass
          const assetType = isCash
            ? "Cash"
            : h.instrument?.classifications?.assetType?.name ??
              h.instrument?.assetSubclass ??
              "Other";
          return assetType === sheetFilterName;
        });
        break;
      case "sector":
        filteredHoldings = holdings.filter((h) => {
          // Check taxonomy sectors first, fall back to legacy sectors
          const taxonomySectors = h.instrument?.classifications?.sectors;
          if (taxonomySectors && taxonomySectors.length > 0) {
            return taxonomySectors.some((s) => s.category.name === sheetFilterName);
          }
          return h.instrument?.sectors?.some((s) => s.name === sheetFilterName);
        });
        break;
      case "country":
        filteredHoldings = holdings.filter((h) => {
          // Check taxonomy regions first, fall back to legacy countries
          const taxonomyRegions = h.instrument?.classifications?.regions;
          if (taxonomyRegions && taxonomyRegions.length > 0) {
            return taxonomyRegions.some((r) => r.category.name === sheetFilterName);
          }
          return h.instrument?.countries?.some((c) => c.name === sheetFilterName);
        });
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
    // Filter out alternative assets (PROP-, VEH-, COLL-, PREC-, LIAB-, ALT-) - insights is investment-focused
    const nonCash =
      holdings?.filter((holding) => {
        if (holding.holdingType?.toLowerCase() === HoldingType.CASH) return false;
        const symbol = holding.instrument?.symbol ?? holding.id;
        if (isAlternativeAssetId(symbol)) return false;
        return true;
      }) ?? [];

    return { cashHoldings: cash, nonCashHoldings: nonCash };
  }, [holdings]);

  // For insights tab, check if there are no holdings at all (including cash)
  const hasNoHoldingsAtAll = !isLoading && (!holdings || holdings.length === 0);

  const renderEmptyState = () => (
    <div className="flex items-center justify-center py-16">
      <EmptyPlaceholder
        icon={<Icons.TrendingUp className="text-muted-foreground h-10 w-10" />}
        title="No holdings yet"
        description="Get started by adding your first transaction or quickly import your existing holdings from a CSV file."
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button size="default" onClick={() => navigate("/activities/manage")}>
            <Icons.Plus className="mr-2 h-4 w-4" />
            Add Transaction
          </Button>
          <Button size="default" variant="outline" onClick={() => navigate("/import")}>
            <Icons.Import className="mr-2 h-4 w-4" />
            Import from CSV
          </Button>
        </div>
      </EmptyPlaceholder>
    </div>
  );

  const renderAnalyticsView = () => {
    if (hasNoHoldingsAtAll) {
      return renderEmptyState();
    }

    return (
      <div className="space-y-4">
        {/* Cash Holdings Widget */}
        <CashHoldingsWidget cashHoldings={cashHoldings ?? []} isLoading={isLoading} />

        {/* Top row: Summary widgets */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <HoldingCurrencyChart
            holdings={[...cashHoldings, ...nonCashHoldings]}
            baseCurrency={settings?.baseCurrency ?? "USD"}
            isLoading={isLoading}
            onCurrencySectionClick={(currencyName) =>
              handleChartSectionClick("currency", currencyName, `Holdings in ${currencyName}`)
            }
          />

          <AccountAllocationChart isLoading={isLoading} />

          <ClassesChart
            holdings={[...cashHoldings, ...nonCashHoldings]}
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="col-span-1 lg:col-span-3">
            <PortfolioComposition holdings={nonCashHoldings ?? []} isLoading={isLoading} />
          </div>

          {/* Sectors Chart - Now self-contained */}
          <div className="col-span-1">
            <SectorsChart
              holdings={nonCashHoldings}
              isLoading={isLoading}
              onSectorSectionClick={(sectorName) =>
                handleChartSectionClick("sector", sectorName, `Holdings in Sector: ${sectorName}`)
              }
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Account selector - fixed position in header area */}
      <div className="pointer-events-auto fixed top-4 right-2 z-20 hidden md:block lg:right-4">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>

      <div className="mb-4 flex justify-end md:hidden">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>

      {renderAnalyticsView()}

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

export default HoldingsInsightsPage;
