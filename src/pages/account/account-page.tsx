import { getHoldings } from "@/commands/portfolio";
import { HistoryChart } from "@/components/history-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  GainAmount,
  GainPercent,
  IntervalSelector,
  Page,
  PageContent,
  PageHeader,
  PrivacyAmount,
} from "@wealthfolio/ui";
import { useMemo, useState } from "react";

import { PrivacyToggle } from "@/components/privacy-toggle";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAccounts } from "@/hooks/use-accounts";
import { useValuationHistory } from "@/hooks/use-valuation-history";
import { AccountType } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import {
  Account,
  AccountValuation,
  DateRange,
  Holding,
  TimePeriod,
  TrackedItem,
} from "@/lib/types";
import { calculatePerformanceMetrics, cn } from "@/lib/utils";
import { PortfolioUpdateTrigger } from "@/pages/dashboard/portfolio-update-trigger";
import { useCalculatePerformanceHistory } from "@/pages/performance/hooks/use-performance-data";
import { useQuery } from "@tanstack/react-query";
import { Icons, type Icon } from "@wealthfolio/ui";
import { subMonths } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { AccountContributionLimit } from "./account-contribution-limit";
import AccountHoldings from "./account-holdings";
import AccountMetrics from "./account-metrics";

interface HistoryChartData {
  date: string;
  totalValue: number;
  netContribution: number;
  currency: string;
}

// Map account types to icons for visual distinction
const accountTypeIcons: Record<AccountType, Icon> = {
  SECURITIES: Icons.Briefcase,
  CASH: Icons.DollarSign,
  CRYPTOCURRENCY: Icons.Bitcoin,
};

// Helper function to get the initial date range (copied from dashboard)
const getInitialDateRange = (): DateRange => ({
  from: subMonths(new Date(), 3),
  to: new Date(),
});

// Define the initial interval code (consistent with other pages)
const INITIAL_INTERVAL_CODE: TimePeriod = "3M";

const AccountPage = () => {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getInitialDateRange());
  const [selectedIntervalCode, setSelectedIntervalCode] =
    useState<TimePeriod>(INITIAL_INTERVAL_CODE);
  const [desktopSelectorOpen, setDesktopSelectorOpen] = useState(false);
  const [mobileSelectorOpen, setMobileSelectorOpen] = useState(false);

  const { accounts, isLoading: isAccountsLoading } = useAccounts();
  const account = useMemo(() => accounts?.find((acc) => acc.id === id), [accounts, id]);

  // Query holdings to check if account has any assets
  const { data: holdings, isLoading: isHoldingsLoading } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS, id],
    queryFn: () => getHoldings(id),
  });

  // Check if account has any holdings (including cash)
  const hasHoldings = useMemo(() => {
    if (!holdings) return false;
    return holdings.length > 0;
  }, [holdings]);

  // Group accounts by type for the selector
  const accountsByType = useMemo(() => {
    const grouped: Record<string, Account[]> = {};
    accounts.forEach((acc) => {
      if (!grouped[acc.accountType]) {
        grouped[acc.accountType] = [];
      }
      grouped[acc.accountType].push(acc);
    });
    return Object.entries(grouped);
  }, [accounts]);

  const accountTrackedItem: TrackedItem | undefined = useMemo(() => {
    if (account) {
      return { id: account.id, type: "account", name: account.name };
    }
    return undefined;
  }, [account]);

  const { data: performanceResponse, isLoading: isPerformanceHistoryLoading } =
    useCalculatePerformanceHistory({
      selectedItems: accountTrackedItem ? [accountTrackedItem] : [],
      dateRange: dateRange,
    });

  const accountPerformance = performanceResponse?.[0] || null;

  const { valuationHistory, isLoading: isValuationHistoryLoading } = useValuationHistory(
    dateRange,
    id,
  );

  // Calculate gainLossAmount and simpleReturn from valuationHistory
  const { gainLossAmount: frontendGainLossAmount, simpleReturn: frontendSimpleReturn } =
    useMemo(() => {
      return calculatePerformanceMetrics(valuationHistory, false);
    }, [valuationHistory, id]);

  const chartData: HistoryChartData[] = useMemo(() => {
    if (!valuationHistory) return [];
    return valuationHistory.map((valuation: AccountValuation) => ({
      date: valuation.valuationDate,
      totalValue: valuation.totalValue,
      netContribution: valuation.netContribution,
      currency: valuation.accountCurrency,
    }));
  }, [valuationHistory]);

  const currentValuation = valuationHistory?.[valuationHistory.length - 1];

  const isLoading = isAccountsLoading || isValuationHistoryLoading;
  const isDetailsLoading = isLoading || isPerformanceHistoryLoading;

  // Callback for IntervalSelector
  const handleIntervalSelect = (
    code: TimePeriod,
    _description: string,
    range: DateRange | undefined,
  ) => {
    setSelectedIntervalCode(code);
    setDateRange(range);
  };

  const percentageToDisplay = useMemo(() => {
    if (selectedIntervalCode === "ALL") {
      return frontendSimpleReturn;
    }
    // For other intervals, if accountPerformance is available, use cumulativeMwr
    if (accountPerformance) {
      return accountPerformance.cumulativeMwr ?? 0;
    }
    return 0; // Default if no specific logic matches or data is unavailable
  }, [accountPerformance, selectedIntervalCode, frontendSimpleReturn]);

  const handleAccountSwitch = (selectedAccount: Account) => {
    navigate(`/accounts/${selectedAccount.id}`);
    setDesktopSelectorOpen(false);
    setMobileSelectorOpen(false);
  };

  return (
    <Page>
      <PageHeader
        heading={account?.name ?? "Account"}
        text={account?.group ?? account?.currency}
        onBack={() => navigate(-1)}
        actions={
          <>
            {/* Desktop account selector */}
            <div className="hidden sm:block">
              <Popover open={desktopSelectorOpen} onOpenChange={setDesktopSelectorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    aria-label="Switch account"
                  >
                    <Icons.ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Search accounts..." />
                    <CommandList>
                      <CommandEmpty>No accounts found.</CommandEmpty>
                      {accountsByType.map(([type, typeAccounts]) => (
                        <CommandGroup key={type} heading={type}>
                          {typeAccounts.map((acc) => {
                            const IconComponent =
                              accountTypeIcons[acc.accountType] ?? Icons.CreditCard;
                            return (
                              <CommandItem
                                key={acc.id}
                                value={`${acc.name} ${acc.currency}`}
                                onSelect={() => handleAccountSwitch(acc)}
                                className="flex items-center py-1.5"
                              >
                                <IconComponent className="mr-2 h-4 w-4" />
                                <span>
                                  {acc.name} ({acc.currency})
                                </span>
                                <Icons.Check
                                  className={cn(
                                    "ml-auto h-4 w-4",
                                    account?.id === acc.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Mobile account selector */}
            <div className="block sm:hidden">
              <Sheet open={mobileSelectorOpen} onOpenChange={setMobileSelectorOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    aria-label="Switch account"
                  >
                    <Icons.ChevronDown className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh] p-0">
                  <SheetHeader className="border-border border-b px-6 py-4">
                    <SheetTitle>Switch Account</SheetTitle>
                    <SheetDescription>Choose an account to view</SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(80vh-5rem)] px-6 py-4">
                    <div className="space-y-6">
                      {accountsByType.map(([type, typeAccounts]) => (
                        <div key={type}>
                          <h3 className="text-muted-foreground mb-3 text-sm font-medium">{type}</h3>
                          <div className="space-y-2">
                            {typeAccounts.map((acc) => {
                              const IconComponent =
                                accountTypeIcons[acc.accountType] ?? Icons.CreditCard;
                              return (
                                <button
                                  key={acc.id}
                                  onClick={() => handleAccountSwitch(acc)}
                                  className={cn(
                                    "hover:bg-accent active:bg-accent/80 flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors focus:outline-none",
                                    account?.id === acc.id
                                      ? "border-primary bg-accent"
                                      : "border-transparent",
                                  )}
                                >
                                  <div className="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
                                    <IconComponent className="text-primary h-5 w-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-foreground truncate font-medium">
                                      {acc.name}
                                    </div>
                                    <div className="text-muted-foreground text-sm">
                                      {acc.currency}
                                    </div>
                                  </div>
                                  {account?.id === acc.id && (
                                    <Icons.Check className="text-primary h-5 w-5 flex-shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>
          </>
        }
      />
      <PageContent>
        {hasHoldings && !isHoldingsLoading ? (
          <>
            <div className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-3">
              <Card className="col-span-1 md:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-md">
                    <PortfolioUpdateTrigger lastCalculatedAt={currentValuation?.calculatedAt}>
                      <div className="flex items-start gap-2">
                        <div>
                          <p className="pt-3 text-xl font-bold">
                            <PrivacyAmount
                              value={currentValuation?.totalValue ?? 0}
                              currency={account?.currency ?? "USD"}
                            />
                          </p>
                          <div className="flex space-x-3 text-sm">
                            <GainAmount
                              className="text-sm font-light"
                              value={frontendGainLossAmount}
                              currency={account?.currency ?? "USD"}
                              displayCurrency={false}
                            />
                            <div className="border-muted-foreground my-1 border-r pr-2" />
                            <GainPercent
                              className="text-sm font-light"
                              value={percentageToDisplay}
                              animated={true}
                            />
                          </div>
                        </div>
                        <PrivacyToggle className="mt-3" />
                      </div>
                    </PortfolioUpdateTrigger>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="w-full p-0">
                    <div className="flex w-full flex-col">
                      <div className="h-[480px] w-full">
                        <HistoryChart data={chartData} isLoading={false} />
                        <IntervalSelector
                          className="relative right-0 bottom-10 left-0 z-10"
                          onIntervalSelect={handleIntervalSelect}
                          isLoading={isValuationHistoryLoading}
                          initialSelection={INITIAL_INTERVAL_CODE}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col space-y-4">
                <AccountMetrics
                  valuation={currentValuation}
                  performance={accountPerformance}
                  className="grow"
                  isLoading={isDetailsLoading || isPerformanceHistoryLoading}
                />
                <AccountContributionLimit accountId={id} />
              </div>
            </div>

            <AccountHoldings accountId={id} />
          </>
        ) : (
          <AccountHoldings accountId={id} showEmptyState={true} />
        )}
      </PageContent>
    </Page>
  );
};

export default AccountPage;
