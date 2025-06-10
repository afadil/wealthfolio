import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { GainPercent } from '@/components/gain-percent';
import { GainAmount } from '@/components/gain-amount';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountValuation } from '@/lib/types';
import { PrivacyAmount } from '@/components/privacy-amount';
import { useSettingsContext } from '@/lib/settings-provider';
import { useAccounts } from '@/hooks/use-accounts';
import { Skeleton } from '@/components/ui/skeleton';
import { useLatestValuations } from '@/hooks/use-latest-valuations';
import { calculatePerformanceMetrics } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

// Define a unified type for displaying both individual accounts and groups
type AccountSummaryDisplayData = {
  // Common fields
  accountName: string; // Account name or Group name
  baseCurrency: string; // Mandatory

  // Base Currency Values (for sorting, grouping, and default display)
  totalValueBaseCurrency: number;
  totalGainLossAmountBaseCurrency: number | null;

  // Account Currency Values (for expanded view)
  totalValueAccountCurrency?: number;
  totalGainLossAmountAccountCurrency?: number | null;
  accountCurrency?: string;

  // Common Performance
  totalGainLossPercent: number | null;

  // Individual Account specific fields
  accountId?: string;
  accountType?: string;
  accountGroup?: string | null;

  // Group specific fields
  isGroup?: boolean;
  accountCount?: number;
  accounts?: AccountSummaryDisplayData[];
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
    displayInAccountCurrency = false,
  }: {
    item: AccountSummaryDisplayData;
    isExpanded?: boolean;
    onToggle?: () => void;
    isLoadingValuation?: boolean;
    displayInAccountCurrency?: boolean;
  }) => {
    const isGroup = item.isGroup ?? false;
    const useAccountCurrency = !isGroup && displayInAccountCurrency;

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

    const subText = useAccountCurrency
      ? `${item.accountGroup ? `${item.accountGroup} | ` : ''}${item.accountCurrency}`
      : isGroup
      ? `${item.accountCount} accounts`
      : `${item.accountGroup ? `${item.accountGroup} | ` : ''}${item.baseCurrency}`;

    const totalValue = useAccountCurrency
      ? item.totalValueAccountCurrency ?? 0
      : item.totalValueBaseCurrency;
    const currency = useAccountCurrency ? item.accountCurrency ?? item.baseCurrency : item.baseCurrency;

    // Performance is always in base currency for groups, but can be account currency for individuals
    const gainAmountToDisplay = useAccountCurrency
      ? item.totalGainLossAmountAccountCurrency
      : item.totalGainLossAmountBaseCurrency;
    const gainDisplayCurrency = currency;
    const gainPercentToDisplay = item.totalGainLossPercent;

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
            {(gainAmountToDisplay !== null || gainPercentToDisplay !== null) &&
              !(gainAmountToDisplay === 0 && gainPercentToDisplay === 0) && (
                <div className="flex items-center space-x-2">
                  {gainAmountToDisplay !== null && (
                    <GainAmount
                      className="text-sm font-light"
                      value={gainAmountToDisplay ?? 0}
                      currency={gainDisplayCurrency}
                      displayCurrency={false}
                      showSign={false}
                    />
                  )}
                  {gainAmountToDisplay !== null && gainPercentToDisplay !== null && (
                    <Separator orientation="vertical" className="h-3" />
                  )}
                  {gainPercentToDisplay !== null && (
                    <GainPercent className="text-sm font-light" value={gainPercentToDisplay} />
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

  const accountIds = useMemo(() => accounts?.map((acc) => acc.id) ?? [], [accounts]);

  const {
    latestValuations,
    isLoading: isLoadingValuations,
    error: errorValuations,
  } = useLatestValuations(accountIds);

  // --- Data Processing ---
  const combinedAccountViews = useMemo((): AccountSummaryDisplayData[] => {
    if (!accounts) return [];
    const valuationMap = new Map<string, AccountValuation>();
    if (latestValuations) {
      latestValuations.forEach((val: AccountValuation) => valuationMap.set(val.accountId, val));
    }
    return accounts.map((acc): AccountSummaryDisplayData => {
      const valuation = valuationMap.get(acc.id);
      const baseCurrency = settings?.baseCurrency ?? 'USD';

      if (!valuation) {
        return {
          accountName: acc.name,
          totalValueBaseCurrency: 0,
          baseCurrency,
          totalGainLossAmountBaseCurrency: null,
          totalGainLossPercent: null,
          accountId: acc.id,
          accountType: acc.accountType,
          accountGroup: acc.group ?? null,
          isGroup: false,
        };
      }

      const { gainLossAmount, simpleReturn } = calculatePerformanceMetrics([valuation], true);

      const totalValueAccountCurrency = valuation.totalValue;
      const fxRate = valuation.fxRateToBase ?? 1;
      const totalValueBaseCurrency = totalValueAccountCurrency * fxRate;
      const totalGainLossAmountAccountCurrency = gainLossAmount;
      const totalGainLossAmountBaseCurrency = gainLossAmount * fxRate;

      return {
        accountName: acc.name,
        totalValueBaseCurrency,
        baseCurrency,
        totalGainLossAmountBaseCurrency,
        totalValueAccountCurrency,
        accountCurrency: valuation.accountCurrency,
        totalGainLossAmountAccountCurrency,
        totalGainLossPercent: simpleReturn,
        accountId: acc.id,
        accountType: acc.accountType,
        accountGroup: acc.group ?? null,
        isGroup: false,
      };
    });
  }, [accounts, latestValuations, settings?.baseCurrency]);

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

    const isLoadingPerformance = isLoadingValuations;

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
            (sum, acc) => sum + Number(acc.totalGainLossAmountBaseCurrency ?? 0),
            0,
          );

          const totalNetContributionBase = groupAccounts.reduce((sum, acc) => {
            const netContribution =
              Number(acc.totalValueBaseCurrency) -
              Number(acc.totalGainLossAmountBaseCurrency ?? 0);
            return sum + netContribution;
          }, 0);

          const groupTotalReturnPercent =
            totalNetContributionBase !== 0
              ? totalGainLossAmountBase / totalNetContributionBase
              : null;

          return {
            accountName: groupName,
            totalValueBaseCurrency,
            baseCurrency,
            totalGainLossAmountBaseCurrency: totalGainLossAmountBase,
            totalGainLossPercent: groupTotalReturnPercent,
            isGroup: true,
            accountCount: groupAccounts.length,
            accounts: groupAccounts,
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
                          displayInAccountCurrency
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
                <AccountSummaryComponent
                  item={account}
                  isLoadingValuation={isLoadingPerformance}
                  displayInAccountCurrency={false}
                />
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
            <AccountSummaryComponent
              item={account}
              isLoadingValuation={isLoadingPerformance}
              displayInAccountCurrency={false}
            />
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
    isLoadingValuations,
    isErrorAccounts,
    errorAccounts,
    errorValuations,
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
