import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { GainPercent } from '@/components/gain-percent';
import { GainAmount } from '@/components/gain-amount';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SimplePerformanceMetrics } from '@/lib/types';
import { PrivacyAmount } from '@/components/privacy-amount';
import { useSettingsContext } from '@/lib/settings-provider';
import { useAccounts } from '@/hooks/use-accounts';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccountsSimplePerformance } from '@/hooks/use-accounts-simple-performance';
import { Separator } from '@/components/ui/separator';

// Define a unified type for displaying both individual accounts and groups
type AccountSummaryDisplayData = {
  // Common fields
  accountName: string; // Account name or Group name
  totalValueBaseCurrency: number; // Mandatory for value display & sorting
  baseCurrency: string; // Mandatory

  // Performance (base currency for both individuals and groups)
  totalGainLossAmount: number | null;
  totalGainLossPercent: number | null;
  dayGainLossAmount: number | null;
  dayGainLossPercent: number | null;

  // Individual Account specific fields (optional)
  accountId?: string;
  accountType?: string;
  accountGroup?: string | null;
  accountCurrency?: string; // Original account currency
  totalValueAccountCurrency?: number; // Original account value
  fxRateToBase?: number | null;

  // Group specific fields (optional)
  isGroup?: boolean;
  accountCount?: number;
  accounts?: AccountSummaryDisplayData[]; // Accounts within the group
};

// Skeleton component for loading state within AccountSummaryComponent
const AccountSummarySkeleton = () => (
  <div className="flex w-full items-center justify-between py-1">
    <div className="flex flex-col space-y-1">
      <Skeleton className="h-5 w-32 rounded" />
      <Skeleton className="h-4 w-24 rounded" />
    </div>
    <div className="flex items-center">
      <div className="flex flex-col items-end space-y-1">
        <Skeleton className="h-5 w-20 rounded" />
        <Skeleton className="h-4 w-28 rounded" />
      </div>
      <Skeleton className="ml-2 h-5 w-5 rounded-full" />
    </div>
  </div>
);

// Reusable component for displaying either a single account summary or a group summary
const AccountSummaryComponent = React.memo(
  ({
    item,
    isExpanded = false,
    onToggle,
    isLoadingValuation = false,
  }: {
    item: AccountSummaryDisplayData;
    isExpanded?: boolean;
    onToggle?: () => void;
    isLoadingValuation?: boolean;
  }) => {
    const isGroup = item.isGroup ?? false;

    // If loading valuation for a single account, show skeleton for values
    if (!isGroup && isLoadingValuation) {
      // Show basic info but skeleton for values
      return (
        <div key={item.accountId} className="flex w-full items-center justify-between">
          <div className="flex flex-col">
            <span className="font-medium leading-none">{item.accountName}</span>
            <span className="text-sm text-muted-foreground">
              {`${item.accountGroup ? `${item.accountGroup} | ` : ''}${item.accountCurrency}`}
            </span>
          </div>
          <div className="flex items-center">
            <div className="flex flex-col items-end space-y-1">
              <Skeleton className="h-5 w-20 rounded" />
              <Skeleton className="h-4 w-28 rounded" />
            </div>
          </div>
        </div>
      );
    }

    // --- Derive display values based on item type (account or group) ---
    const name = item.accountName;
    const accountId = item.accountId;
    const subText = isGroup
      ? `${item.accountCount} accounts`
      : `${item.accountGroup ? `${item.accountGroup} | ` : ''}${item.accountCurrency}`;
    const totalValue = isGroup
      ? item.totalValueBaseCurrency
      : (item.totalValueAccountCurrency ?? 0);
    const currency = isGroup ? item.baseCurrency : (item.accountCurrency ?? item.baseCurrency);

    // Performance is always in base currency, directly use item fields
    const performance = {
      totalGainLossAmount: item.totalGainLossAmount,
      totalGainLossPercent: item.totalGainLossPercent,
    };

    // Currency for gain/loss display (always base currency)
    const gainDisplayCurrency = item.baseCurrency;

    return (
      <div
        key={isGroup ? name : accountId}
        className="flex w-full items-center justify-between"
        onClick={isGroup ? onToggle : undefined}
        style={{ cursor: isGroup ? 'pointer' : 'default' }}
      >
        <div className="flex flex-col">
          <span className="font-medium leading-none">{name}</span>
          <span className="text-sm text-muted-foreground">{subText}</span>
        </div>
        <div className="flex items-center">
          <div className="flex flex-col items-end">
            <p className="font-medium leading-none">
              <PrivacyAmount value={totalValue} currency={currency} />
            </p>
            {(performance.totalGainLossAmount !== null ||
              performance.totalGainLossPercent !== null) &&
              !(
                performance.totalGainLossAmount === 0 && performance.totalGainLossPercent === 0
              ) && (
                <div className="flex items-center space-x-2">
                  {performance.totalGainLossAmount !== null && (
                    <GainAmount
                      className="text-sm font-light"
                      value={performance.totalGainLossAmount}
                      currency={gainDisplayCurrency}
                      displayCurrency={false}
                      showSign={false}
                    />
                  )}
                  {performance.totalGainLossAmount !== null &&
                    performance.totalGainLossPercent !== null && (
                      <Separator orientation="vertical" className="h-3" />
                    )}
                  {performance.totalGainLossPercent !== null && (
                    <GainPercent
                      className="text-sm font-light"
                      value={performance.totalGainLossPercent}
                    />
                  )}
                </div>
              )}
          </div>
          {isGroup ? (
            <Icons.ChevronDown
              className={`ml-2 h-5 w-5 text-muted-foreground transition-transform ${
                isExpanded ? 'rotate-180 transform' : ''
              }`}
            />
          ) : (
            !isLoadingValuation &&
            accountId && (
              <Link to={`/accounts/${accountId}`} className="ml-2 p-0">
                <Icons.ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            )
          )}
        </div>
      </div>
    );
  },
);
AccountSummaryComponent.displayName = 'AccountSummaryComponent';

export const AccountsSummary = React.memo(({ className }: { className?: string }) => {
  const { accountsGrouped, setAccountsGrouped, settings } = useSettingsContext();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // --- Data Fetching ---
  const {
    accounts,
    isLoading: isLoadingAccounts,
    isError: isErrorAccounts,
    error: errorAccounts,
  } = useAccounts();

  const {
    data: performanceData,
    isLoading: isLoadingPerformanceData,
    isFetching: isFetchingPerformanceData,
    isError: isErrorPerformance,
    error: errorPerformance,
  } = useAccountsSimplePerformance(accounts);

  // --- Data Processing ---
  const combinedAccountViews = useMemo((): AccountSummaryDisplayData[] => {
    if (!accounts) return [];
    const performanceMap = new Map<string, SimplePerformanceMetrics>();
    if (performanceData) {
      performanceData.forEach((perf: SimplePerformanceMetrics) =>
        performanceMap.set(perf.accountId, perf),
      );
    }
    return accounts.map((acc): AccountSummaryDisplayData => {
      const performance = performanceMap.get(acc.id);
      const accountCurrency = acc.currency;
      const baseCurrency = performance?.baseCurrency ?? accountCurrency;
      const fxRate = performance?.fxRateToBase ?? null;

      const totalValueAccountCurrency = Number(performance?.totalValue ?? 0);

      let totalValueBaseCurrency = 0;

      if (performance?.totalValue !== null && performance?.totalValue !== undefined) {
        if (baseCurrency === accountCurrency || !fxRate || fxRate === 0) {
          totalValueBaseCurrency = performance.totalValue;
        } else {
          totalValueBaseCurrency = performance.totalValue * fxRate;
        }
      } else {
        totalValueBaseCurrency = 0;
      }

      const totalGainLossAmountBase = performance?.totalGainLossAmount ?? null;
      const dayGainLossAmountBase = performance?.dayGainLossAmount ?? null;
      const totalGainLossPercent = performance?.cumulativeReturnPercent ?? null;
      const dayGainLossPercent = performance?.dayReturnPercentModDietz ?? null;

      return {
        accountName: acc.name,
        totalValueBaseCurrency: totalValueBaseCurrency,
        baseCurrency: baseCurrency,
        totalGainLossAmount: totalGainLossAmountBase,
        totalGainLossPercent: totalGainLossPercent,
        dayGainLossAmount: dayGainLossAmountBase,
        dayGainLossPercent: dayGainLossPercent,
        accountId: acc.id,
        accountType: acc.accountType,
        accountGroup: acc.group ?? null,
        accountCurrency: accountCurrency,
        totalValueAccountCurrency: totalValueAccountCurrency,
        fxRateToBase: fxRate,
        isGroup: false,
      };
    });
  }, [accounts, performanceData]);

  const toggleGroup = useCallback((groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  }, []);

  // --- Rendering Logic ---
  const renderedContent = useMemo(() => {
    if (isLoadingAccounts) {
      return Array.from({ length: 4 }).map((_, index) => (
        <Card key={`skeleton-${index}`} className="border-none shadow-sm">
          <CardHeader className="py-6">
            <AccountSummarySkeleton />
          </CardHeader>
        </Card>
      ));
    }

    if (isErrorAccounts) {
      return <p className="text-destructive">Error loading accounts: {errorAccounts?.message}</p>;
    }

    if (!combinedAccountViews || combinedAccountViews.length === 0) {
      return <p className="text-muted-foreground">No accounts found.</p>;
    }

    const isLoadingPerformance = isLoadingPerformanceData || isFetchingPerformanceData;

    if (accountsGrouped) {
      const groups: Record<string, AccountSummaryDisplayData[]> = {};
      const standaloneAccounts: AccountSummaryDisplayData[] = [];

      combinedAccountViews.forEach((account) => {
        const groupName = account.accountGroup || 'Uncategorized';
        if (groupName === 'Uncategorized') {
          standaloneAccounts.push(account);
        } else {
          if (!groups[groupName]) {
            groups[groupName] = [];
          }
          groups[groupName].push(account);
        }
      });

      const actualGroups: AccountSummaryDisplayData[] = Object.entries(groups).map(
        ([groupName, groupAccounts]) => {
          const baseCurrency = groupAccounts[0]?.baseCurrency ?? settings?.baseCurrency ?? 'USD';

          const totalValueBaseCurrency = groupAccounts.reduce(
            (sum, acc) => sum + Number(acc.totalValueBaseCurrency),
            0,
          );

          const totalGainLossAmountBase = groupAccounts.reduce(
            (sum, acc) => sum + Number(acc.totalGainLossAmount ?? 0),
            0,
          );
          const dayGainLossAmountBase = groupAccounts.reduce(
            (sum, acc) => sum + Number(acc.dayGainLossAmount ?? 0),
            0,
          );
          let weightedTotalReturnSum = 0;
          let weightedDayReturnSum = 0;
          let totalValueForWeighting = 0;
          groupAccounts.forEach((acc) => {
            const value = Number(acc.totalValueBaseCurrency);
            if (value > 0) {
              totalValueForWeighting += value;
              if (acc.totalGainLossPercent !== null) {
                weightedTotalReturnSum += acc.totalGainLossPercent * value;
              }
              if (acc.dayGainLossPercent !== null) {
                weightedDayReturnSum += acc.dayGainLossPercent * value;
              }
            }
          });
          const groupTotalReturnPercent =
            totalValueForWeighting > 0 ? weightedTotalReturnSum / totalValueForWeighting : null;
          const groupDayGainPercent =
            totalValueForWeighting > 0 ? weightedDayReturnSum / totalValueForWeighting : null;

          return {
            accountName: groupName,
            totalValueBaseCurrency: totalValueBaseCurrency,
            baseCurrency: baseCurrency,
            totalGainLossAmount: totalGainLossAmountBase,
            totalGainLossPercent: groupTotalReturnPercent,
            dayGainLossAmount: dayGainLossAmountBase,
            dayGainLossPercent: groupDayGainPercent,
            isGroup: true,
            accountCount: groupAccounts.length,
            accounts: groupAccounts,
            accountId: undefined,
            accountType: undefined,
            accountGroup: undefined,
            accountCurrency: undefined,
            totalValueAccountCurrency: undefined,
            fxRateToBase: undefined,
          };
        },
      );

      actualGroups.sort(
        (a, b) => Number(b.totalValueBaseCurrency) - Number(a.totalValueBaseCurrency),
      );
      standaloneAccounts.sort(
        (a, b) => Number(b.totalValueBaseCurrency) - Number(a.totalValueBaseCurrency),
      );

      return (
        <>
          {actualGroups.map((group) => {
            const isExpanded = expandedGroups[group.accountName];
            const sortedAccounts = [...(group.accounts ?? [])].sort(
              (a, b) => Number(b.totalValueBaseCurrency) - Number(a.totalValueBaseCurrency),
            );

            return (
              <Card key={group.accountName} className="border-none shadow-none">
                <CardHeader>
                  <AccountSummaryComponent
                    item={group}
                    isExpanded={isExpanded}
                    onToggle={() => toggleGroup(group.accountName)}
                  />
                </CardHeader>
                {isExpanded && (
                  <CardContent className="border-t pt-4">
                    {sortedAccounts.map((account) => (
                      <div key={account.accountId} className="py-4">
                        <AccountSummaryComponent
                          item={account}
                          isLoadingValuation={isLoadingPerformance}
                        />
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}
          {standaloneAccounts.map((account) => (
            <Card key={account.accountId} className="border-none shadow-sm">
              <CardHeader className="py-6">
                <AccountSummaryComponent item={account} isLoadingValuation={isLoadingPerformance} />
              </CardHeader>
            </Card>
          ))}
        </>
      );
    } else {
      const sortedAccounts = [...combinedAccountViews].sort(
        (a, b) => Number(b.totalValueBaseCurrency) - Number(a.totalValueBaseCurrency),
      );

      return sortedAccounts.map((account) => (
        <Card key={account.accountId} className="border-none shadow-sm">
          <CardHeader className="py-6">
            <AccountSummaryComponent item={account} isLoadingValuation={isLoadingPerformance} />
          </CardHeader>
        </Card>
      ));
    }
  }, [
    combinedAccountViews,
    accountsGrouped,
    expandedGroups,
    toggleGroup,
    isLoadingAccounts,
    isFetchingPerformanceData,
    isLoadingPerformanceData,
    isErrorAccounts,
    errorAccounts,
    isErrorPerformance,
    errorPerformance,
  ]);

  return (
    <Card className={`border-none bg-transparent shadow-none ${className || ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-1">
        <CardTitle className="text-md">Accounts</CardTitle>
        <Button
          variant="ghost"
          className="rounded-full"
          size="sm"
          onClick={() => setAccountsGrouped(!accountsGrouped)}
          aria-label={accountsGrouped ? 'List view' : 'Group view'}
          title={accountsGrouped ? 'List view' : 'Group view'}
          disabled={isLoadingAccounts || combinedAccountViews.length === 0}
        >
          {accountsGrouped ? (
            <Icons.ListCollapse className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Icons.Group className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">{renderedContent}</div>
      </CardContent>
    </Card>
  );
});
AccountsSummary.displayName = 'AccountsSummary';
