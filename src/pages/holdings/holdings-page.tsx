import { getHoldings } from "@/commands/portfolio";
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
import { QueryKeys } from "@/lib/query-keys";
import { useQueries } from "@tanstack/react-query";
import { AnimatedToggleGroup, AmountDisplay, Page, PageContent, PageHeader } from "@wealthvn/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AccountSelector } from "@/components/account-selector";
import { useDividendAdjustedHoldings } from "@/hooks/use-dividend-adjusted-holdings";
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
import { HoldingsTable } from "./components/holdings-table";
import { SectorsChart } from "./components/sectors-chart";

// Define a type for the filter criteria
type SheetFilterType = "class" | "sector" | "country" | "currency" | "account" | "composition";

export const HoldingsPage = () => {
  const { t } = useTranslation(["holdings", "common"]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>({
    id: PORTFOLIO_ACCOUNT_ID,
    name: t("page.allPortfolio"),
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
  const { adjustedHoldings } = useDividendAdjustedHoldings(holdings ?? undefined);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState("");
  const [sheetFilterType, setSheetFilterType] = useState<SheetFilterType | null>(null);
  const [sheetFilterName, setSheetFilterName] = useState<string | null>(null);
  const [sheetCompositionFilter, setSheetCompositionFilter] = useState<Instrument["id"] | null>(
    null,
  );
  const [sheetAccountIdsFilter, setSheetAccountIdsFilter] = useState<string[] | null>(null);

  const handleAccountSelect = (account: Account | null) => {
    setSelectedAccount(account);
  };

  const handleChartSectionClick = (
    type: SheetFilterType,
    name: string,
    title?: string,
    compositionId?: Instrument["id"],
    accountIdsForFilter?: string[],
  ) => {
    setSheetFilterType(type);
    setSheetFilterName(name);
    setSheetTitle(title ?? t("page.detailsFor", { name }));
    if (type === "composition" && compositionId) {
      setSheetCompositionFilter(compositionId);
    } else {
      setSheetCompositionFilter(null);
    }
    if (type === "account" && accountIdsForFilter) {
      setSheetAccountIdsFilter(accountIdsForFilter);
    } else {
      setSheetAccountIdsFilter(null);
    }
    setIsSheetOpen(true);
  };

  // Fetch holdings for specific accounts when account filter is active
  const accountHoldingsQueries = useQueries({
    queries: (sheetAccountIdsFilter ?? []).map((accountId) => ({
      queryKey: [QueryKeys.HOLDINGS, accountId],
      queryFn: () => getHoldings(accountId),
      enabled: sheetFilterType === "account" && isSheetOpen && !!sheetAccountIdsFilter?.length,
      staleTime: 5 * 60 * 1000, // 5 minutes
    })),
  });

  // Combine holdings from all accounts when filtering by account
  const accountHoldings = useMemo(() => {
    if (sheetFilterType !== "account" || !sheetAccountIdsFilter?.length) {
      return [];
    }
    const allHoldings: Holding[] = [];
    accountHoldingsQueries.forEach((query) => {
      if (query.data) {
        allHoldings.push(...query.data);
      }
    });
    return allHoldings;
  }, [accountHoldingsQueries, sheetFilterType, sheetAccountIdsFilter]);

  const isLoadingAccountHoldings = accountHoldingsQueries.some((q) => q.isLoading);

  const holdingsForSheet = useMemo(() => {
    if (!sheetFilterType) {
      return [];
    }

    // For account filter, use the fetched account holdings
    if (sheetFilterType === "account") {
      return accountHoldings.sort((a, b) => {
        const bBase = b.marketValue?.base ?? 0;
        const aBase = a.marketValue?.base ?? 0;
        return Number(bBase) - Number(aBase);
      });
    }

    // For other filters, use adjusted holdings from the current view
    if (!adjustedHoldings) {
      return [];
    }

    let filteredHoldings: Holding[] = [];

    switch (sheetFilterType) {
      case "class":
        filteredHoldings = adjustedHoldings.filter(
          (h) => h.instrument?.assetClass === sheetFilterName,
        );
        break;
      case "sector":
        filteredHoldings = adjustedHoldings.filter(
          (h) => h.instrument?.sector === sheetFilterName,
        );
        break;
      case "country":
        filteredHoldings = adjustedHoldings.filter(
          (h) => h.instrument?.country === sheetFilterName,
        );
        break;
      case "currency":
        filteredHoldings = adjustedHoldings.filter(
          (h) => h.localCurrency === sheetFilterName,
        );
        break;
      case "composition":
        filteredHoldings = adjustedHoldings.filter(
          (h) => h.instrument?.id === sheetCompositionFilter,
        );
        break;
      default:
        filteredHoldings = [];
    }

    return filteredHoldings.sort((a, b) => {
      const bBase = b.marketValue?.base ?? 0;
      const aBase = a.marketValue?.base ?? 0;
      return Number(bBase) - Number(aBase);
    });
  }, [sheetFilterType, sheetFilterName, sheetCompositionFilter, accountHoldings, adjustedHoldings]);

  const currentHoldings = useMemo(() => {
    if (!adjustedHoldings) {
      return { cashHoldings: [], nonCashHoldings: [], filteredNonCashHoldings: [] };
    }

    const currentHoldings = adjustedHoldings;
    const cash =
      currentHoldings.filter((holding) => holding.holdingType?.toLowerCase() === HoldingType.CASH) ?? [];
    const nonCash =
      currentHoldings.filter((holding) => holding.holdingType?.toLowerCase() !== HoldingType.CASH) ?? [];

    return { cashHoldings: cash, nonCashHoldings: nonCash, filteredNonCashHoldings: nonCash };
  }, [adjustedHoldings]);

  const { cashHoldings, nonCashHoldings, filteredNonCashHoldings } = currentHoldings;

  const renderHoldingsView = () => (
    <div className="space-y-4 p-2 lg:p-4">
      <HoldingsTable holdings={filteredNonCashHoldings ?? []} isLoading={isLoading} />
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
            handleChartSectionClick(
              "currency",
              currencyName,
              t("charts.holdingsIn", { name: currencyName }),
            )
          }
        />

        <AccountAllocationChart
          isLoading={isLoading}
          onAccountSectionClick={(groupOrAccountName, accountIdsInGroup) =>
            handleChartSectionClick(
              "account",
              groupOrAccountName,
              t("charts.holdingsIn", { name: groupOrAccountName }),
              undefined,
              accountIdsInGroup,
            )
          }
        />

        <ClassesChart
          holdings={[...cashHoldings, ...filteredNonCashHoldings]}
          isLoading={isLoading}
          onClassSectionClick={(className) =>
            handleChartSectionClick("class", className, t("charts.assetClass", { name: className }))
          }
        />

        <CountryChart
          holdings={filteredNonCashHoldings}
          isLoading={isLoading}
          onCountrySectionClick={(countryName) =>
            handleChartSectionClick(
              "country",
              countryName,
              t("charts.holdingsIn", { name: countryName }),
            )
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
              handleChartSectionClick(
                "sector",
                sectorName,
                t("charts.sector", { name: sectorName }),
              )
            }
          />
        </div>
      </div>
    </div>
  );

  type HoldingsView = "holdings" | "analytics";
  const [currentView, setCurrentView] = useState<HoldingsView>("analytics");

  const toggleItems = useMemo(() => {
    return [
      { value: "holdings" as HoldingsView, label: t("page.viewHoldings") },
      { value: "analytics" as HoldingsView, label: t("page.viewInsights") },
    ];
  }, [t]);

  return (
    <>
      <Page>
        <PageHeader
          heading={t("page.title")}
          actions={
            <div className="flex items-center gap-3">
              <AnimatedToggleGroup
                items={toggleItems}
                value={currentView}
                onValueChange={(next: HoldingsView) => {
                  if (next !== currentView) {
                    setCurrentView(next);
                  }
                }}
                size="sm"
              />
              <AccountSelector
                selectedAccount={selectedAccount}
                setSelectedAccount={handleAccountSelect}
                variant="dropdown"
                includePortfolio={true}
                className="h-9"
              />
            </div>
          }
        />
        <PageContent withPadding={false}>
          {currentView === "holdings" ? renderHoldingsView() : renderAnalyticsView()}
        </PageContent>
      </Page>

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
            {sheetFilterType === "account" && isLoadingAccountHoldings ? (
              <div className="flex items-center justify-center py-8">
                <Icons.Spinner className="h-6 w-6 animate-spin" />
              </div>
            ) : holdingsForSheet.length > 0 ? (
              <ul className="space-y-2">
                {holdingsForSheet.map((holding) => {
                  let displayName = t("common:common.na");
                  let symbol = "-";
                  if (holding.holdingType === HoldingType.CASH) {
                    displayName = holding.localCurrency
                      ? `${t("page.cash")} (${holding.localCurrency})`
                      : t("page.cash");
                    symbol = `$CASH-${holding.localCurrency}`;
                  } else if (holding.instrument) {
                    displayName =
                      holding.instrument.name ?? holding.instrument.symbol ?? t("page.unnamedSecurity");
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
              <p>{t("page.noHoldings")}</p>
            )}
          </div>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">{t("page.close")}</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default HoldingsPage;
