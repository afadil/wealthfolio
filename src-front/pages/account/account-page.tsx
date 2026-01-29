import { getHoldings, getSnapshots, searchActivities } from "@/adapters";
import type { ActivityDetails } from "@/lib/types";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui";
import { useMemo, useState } from "react";

import { MobileActionsMenu } from "@/components/mobile-actions-menu";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@wealthfolio/ui/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { ScrollArea } from "@wealthfolio/ui/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@wealthfolio/ui/components/ui/sheet";
import { useAccounts } from "@/hooks/use-accounts";
import { useValuationHistory } from "@/hooks/use-valuation-history";
import { AccountType } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import {
  Account,
  AccountValuation,
  DateRange,
  getTrackingMode,
  Holding,
  SnapshotInfo,
  TimePeriod,
  TrackedItem,
} from "@/lib/types";
import { canAddHoldings } from "@/lib/activity-restrictions";
import { cn } from "@/lib/utils";
import { PortfolioUpdateTrigger } from "@/pages/dashboard/portfolio-update-trigger";
import { useCalculatePerformanceHistory } from "@/pages/performance/hooks/use-performance-data";
import { useQuery } from "@tanstack/react-query";
import { Icons, type Icon } from "@wealthfolio/ui";
import { format, parseISO, subMonths } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { AccountContributionLimit } from "./account-contribution-limit";
import AccountHoldings from "./account-holdings";
import AccountMetrics from "./account-metrics";
import { HoldingsEditMode } from "@/pages/holdings/components/holdings-edit-mode";
import { ActivityTableMobile } from "@/pages/activity/components/activity-table/activity-table-mobile";

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
  PROPERTY: Icons.Home,
  VEHICLE: Icons.Activity2,
  COLLECTIBLE: Icons.Star,
  PRECIOUS: Icons.HandCoins,
  LIABILITY: Icons.CreditCard,
  OTHER: Icons.Package,
};

// Helper function to get the initial date range (copied from dashboard)
const getInitialDateRange = (): DateRange => ({
  from: subMonths(new Date(), 3),
  to: new Date(),
});

// Format date for display
const formatDate = (dateStr: string): string => {
  try {
    return format(parseISO(dateStr), "MMMM d, yyyy");
  } catch {
    return dateStr;
  }
};

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
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [isEditingHoldings, setIsEditingHoldings] = useState(false);
  const [showSnapshotMarkers, setShowSnapshotMarkers] = useState(false);
  const [editingSnapshotDate, setEditingSnapshotDate] = useState<string | null>(null);
  const [selectedActivityDate, setSelectedActivityDate] = useState<string | null>(null);
  const [isActivitySheetOpen, setIsActivitySheetOpen] = useState(false);

  const { accounts, isLoading: isAccountsLoading } = useAccounts();
  const account = useMemo(() => accounts?.find((acc) => acc.id === id), [accounts, id]);

  // Check if this account is in HOLDINGS tracking mode
  const isHoldingsMode = useMemo(() => {
    if (!account) return false;
    return getTrackingMode(account) === "HOLDINGS";
  }, [account]);

  // Check if user can directly edit holdings (manual HOLDINGS-mode accounts only)
  const canEditHoldingsDirectly = useMemo(() => {
    return canAddHoldings(account);
  }, [account]);

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

  // Format date range for snapshot query
  const snapshotDateFrom = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const snapshotDateTo = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  // Query snapshots for chart markers (only when toggle is on)
  // Filtered by the chart's visible date range
  const { data: snapshots } = useQuery<SnapshotInfo[], Error>({
    queryKey: [...QueryKeys.snapshots(id), snapshotDateFrom, snapshotDateTo],
    queryFn: () => getSnapshots(id, snapshotDateFrom, snapshotDateTo),
    enabled: showSnapshotMarkers && !!account,
  });

  // Extract snapshot dates for chart markers
  const snapshotDates = useMemo(() => {
    if (!snapshots) return [];
    return snapshots.map((s) => s.snapshotDate);
  }, [snapshots]);

  // Query activities for selected date (Transactions mode marker click)
  const { data: dateActivities, isLoading: isDateActivitiesLoading } = useQuery<
    ActivityDetails[],
    Error
  >({
    queryKey: ["activities", "byDate", id, selectedActivityDate],
    queryFn: async () => {
      if (!selectedActivityDate) return [];
      const response = await searchActivities(
        0,
        100,
        { accountIds: [id], dateFrom: selectedActivityDate, dateTo: selectedActivityDate },
        "",
        { id: "date", desc: true },
      );
      return response.data;
    },
    enabled: isActivitySheetOpen && !!selectedActivityDate,
  });

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

  // Pass tracking mode to the performance hook for SOTA calculations
  const { data: performanceResponse, isLoading: isPerformanceHistoryLoading } =
    useCalculatePerformanceHistory({
      selectedItems: accountTrackedItem ? [accountTrackedItem] : [],
      dateRange: dateRange,
      trackingMode: isHoldingsMode ? "HOLDINGS" : "TRANSACTIONS",
    });

  const accountPerformance = performanceResponse?.[0] || null;

  const { valuationHistory, isLoading: isValuationHistoryLoading } = useValuationHistory(
    dateRange,
    id,
  );

  const currentValuation = valuationHistory?.[valuationHistory.length - 1];

  // Use period gain and return from backend (SOTA calculations for HOLDINGS mode)
  const frontendGainLossAmount = accountPerformance?.periodGain ?? 0;
  const frontendSimpleReturn = accountPerformance?.periodReturn ?? 0;

  const chartData: HistoryChartData[] = useMemo(() => {
    if (!valuationHistory) return [];
    return valuationHistory.map((valuation: AccountValuation) => ({
      date: valuation.valuationDate,
      totalValue: valuation.totalValue,
      netContribution: valuation.netContribution,
      currency: valuation.accountCurrency,
    }));
  }, [valuationHistory]);

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
    // For HOLDINGS mode, always use simple return since TWR/MWR are not meaningful
    // (they require transaction history to track cash flows)
    if (isHoldingsMode) {
      return frontendSimpleReturn;
    }
    if (selectedIntervalCode === "ALL") {
      return frontendSimpleReturn;
    }
    // For other intervals, if accountPerformance is available, use cumulativeMwr
    if (accountPerformance) {
      return accountPerformance.cumulativeMwr ?? 0;
    }
    return 0; // Default if no specific logic matches or data is unavailable
  }, [accountPerformance, selectedIntervalCode, frontendSimpleReturn, isHoldingsMode]);

  const handleAccountSwitch = (selectedAccount: Account) => {
    navigate(`/accounts/${selectedAccount.id}`);
    setDesktopSelectorOpen(false);
    setMobileSelectorOpen(false);
  };

  return (
    <Page>
      <PageHeader
        onBack={() => navigate(-1)}
        actions={
          <>
            <div className="hidden items-center gap-2 sm:flex">
              <TooltipProvider>
                {canEditHoldingsDirectly ? (
                  // HOLDINGS mode (manual): Import and Update Holdings buttons
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => navigate(`/import?account=${id}`)}
                        >
                          <Icons.Import className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Import holdings CSV</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setEditingSnapshotDate(null);
                            setIsEditingHoldings(true);
                          }}
                        >
                          <Icons.Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Update holdings</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                ) : (
                  // TRANSACTIONS mode: Import and Record transaction buttons
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => navigate(`/import?account=${id}`)}
                        >
                          <Icons.Import className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Import CSV</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => navigate(`/activities/manage?account=${id}`)}
                        >
                          <Icons.Plus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Record transaction</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
              </TooltipProvider>
            </div>

            <div className="sm:hidden">
              <MobileActionsMenu
                open={mobileActionsOpen}
                onOpenChange={setMobileActionsOpen}
                title="Account Actions"
                description="Manage this account"
                actions={
                  canEditHoldingsDirectly
                    ? [
                        {
                          icon: "Import",
                          label: "Import Holdings",
                          description: "Import holdings from CSV file",
                          onClick: () => navigate(`/import?account=${id}`),
                        },
                        {
                          icon: "Pencil",
                          label: "Update Holdings",
                          description: "Edit positions and cash balances",
                          onClick: () => {
                            setEditingSnapshotDate(null);
                            setIsEditingHoldings(true);
                          },
                        },
                      ]
                    : [
                        {
                          icon: "Import",
                          label: "Import CSV",
                          description: "Import transactions from file",
                          onClick: () => navigate(`/import?account=${id}`),
                        },
                        {
                          icon: "Plus",
                          label: "Record Transaction",
                          description: "Add a new activity manually",
                          onClick: () => navigate(`/activities/manage?account=${id}`),
                        },
                      ]
                }
              />
            </div>
          </>
        }
      >
        <div className="flex items-center gap-2" data-tauri-drag-region="true">
          {/* Tracking mode avatar */}
          {account && (
            <div className="bg-primary/10 dark:bg-primary/20 flex size-9 shrink-0 items-center justify-center rounded-full">
              {getTrackingMode(account) === "HOLDINGS" ? (
                <Icons.Holdings className="text-primary h-5 w-5" />
              ) : (
                <Icons.Activity className="text-primary h-5 w-5" />
              )}
            </div>
          )}
          <div className="flex min-w-0 flex-col justify-center">
            <div className="flex items-center gap-1">
              <h1 className="truncate text-base leading-tight font-semibold md:text-lg">
                {account?.name ?? "Account"}
              </h1>
              {/* Desktop account selector */}
              <div className="hidden sm:block">
                <Popover open={desktopSelectorOpen} onOpenChange={setDesktopSelectorOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      aria-label="Switch account"
                    >
                      <Icons.ChevronDown className="text-muted-foreground size-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-0" align="start">
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
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      aria-label="Switch account"
                    >
                      <Icons.ChevronDown className="text-muted-foreground h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="mx-1 h-[80vh] rounded-t-4xl p-0">
                    <SheetHeader className="border-border border-b px-6 py-4">
                      <SheetTitle>Switch Account</SheetTitle>
                      <SheetDescription>Choose an account to view</SheetDescription>
                    </SheetHeader>
                    <ScrollArea className="h-[calc(80vh-5rem)] px-6 py-4">
                      <div className="space-y-6">
                        {accountsByType.map(([type, typeAccounts]) => (
                          <div key={type}>
                            <h3 className="text-muted-foreground mb-3 text-sm font-medium">
                              {type}
                            </h3>
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
            </div>
            <p className="text-muted-foreground text-xs leading-tight md:text-sm">
              {account?.group ?? account?.currency}
            </p>
          </div>
        </div>
      </PageHeader>
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
                          <div className="flex items-center gap-2 text-sm">
                            <GainAmount
                              className="text-sm font-light"
                              value={frontendGainLossAmount}
                              currency={account?.currency ?? "USD"}
                              displayCurrency={false}
                            />
                            <GainPercent
                              value={percentageToDisplay}
                              variant="badge"
                              className="text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </PortfolioUpdateTrigger>
                  </CardTitle>
                  <div className="-mt-3 flex items-center gap-1 self-start">
                    <PrivacyToggle />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={showSnapshotMarkers ? "default" : "secondary"}
                            size="icon-xs"
                            className={cn(
                              "rounded-full",
                              !showSnapshotMarkers && "bg-secondary/50",
                            )}
                            onClick={() => setShowSnapshotMarkers(!showSnapshotMarkers)}
                          >
                            <Icons.History className="size-5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{showSnapshotMarkers ? "Hide" : "Show"} snapshot markers</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="w-full p-0">
                    <div className="flex w-full flex-col">
                      <div className="h-[480px] w-full">
                        <HistoryChart
                          data={chartData}
                          isLoading={false}
                          showMarkers={showSnapshotMarkers}
                          snapshotDates={snapshotDates}
                          onMarkerClick={(date) => {
                            if (isHoldingsMode) {
                              // Holdings mode: open edit holdings sheet
                              setEditingSnapshotDate(date);
                              setIsEditingHoldings(true);
                            } else {
                              // Transactions mode: open activities sheet for this date
                              setSelectedActivityDate(date);
                              setIsActivitySheetOpen(true);
                            }
                          }}
                        />
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
                  hideBalanceEdit={isHoldingsMode}
                  isHoldingsMode={isHoldingsMode}
                />
                <AccountContributionLimit accountId={id} />
              </div>
            </div>

            <AccountHoldings accountId={id} onAddHoldings={() => setIsEditingHoldings(true)} />
          </>
        ) : (
          <AccountHoldings
            accountId={id}
            showEmptyState={true}
            onAddHoldings={() => setIsEditingHoldings(true)}
          />
        )}
      </PageContent>

      {/* Holdings Edit Mode Sheet for manual HOLDINGS-mode accounts */}
      {account && canEditHoldingsDirectly && (
        <Sheet open={isEditingHoldings} onOpenChange={setIsEditingHoldings}>
          <SheetContent side="right" className="flex h-full w-full flex-col p-0 sm:max-w-2xl">
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle>Update Holdings</SheetTitle>
              <SheetDescription>
                Edit positions and cash balances for {account.name}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-hidden px-6">
              <HoldingsEditMode
                holdings={holdings ?? []}
                account={account}
                isLoading={isHoldingsLoading}
                onClose={() => {
                  setIsEditingHoldings(false);
                  setEditingSnapshotDate(null);
                }}
                existingSnapshotDate={editingSnapshotDate}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Activities Sheet for Transactions mode marker click */}
      <Sheet open={isActivitySheetOpen} onOpenChange={setIsActivitySheetOpen}>
        <SheetContent side="right" className="flex h-full w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>
              Activities on {selectedActivityDate ? formatDate(selectedActivityDate) : ""}
            </SheetTitle>
            <SheetDescription>
              {dateActivities?.length ?? 0} activities recorded on this date
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-4 py-4">
            {isDateActivitiesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Icons.Spinner className="size-6 animate-spin" />
              </div>
            ) : (
              <ActivityTableMobile
                activities={dateActivities ?? []}
                isCompactView={true}
                handleEdit={() => {}}
                handleDelete={() => {}}
                onDuplicate={async () => {}}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Page>
  );
};

export default AccountPage;
