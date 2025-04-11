import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { GainPercent } from '@/components/gain-percent';
import { GainAmount } from '@/components/gain-amount';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountGroup, AccountSummaryView } from '@/lib/types';
import { PrivacyAmount } from '@/components/privacy-amount';
import { useSettingsContext } from '@/lib/settings-provider';

// Reusable component for displaying either a single account summary or a group summary
const AccountSummaryComponent = React.memo(
  ({
    item,
    isGroup = false,
    isExpanded = false,
    onToggle,
  }: {
    item: AccountGroup | AccountSummaryView;
    isGroup?: boolean;
    isExpanded?: boolean;
    onToggle?: () => void;
  }) => {
    const name = isGroup ? (item as AccountGroup).groupName : (item as AccountSummaryView).accountName;
    const accountId = isGroup ? undefined : (item as AccountSummaryView).accountId;
    const subText = isGroup
      ? `${(item as AccountGroup).accountCount} accounts`
      : `${(item as AccountSummaryView).accountGroup ? `${(item as AccountSummaryView).accountGroup} | ` : ''}${(item as AccountSummaryView).accountCurrency}`;
    const totalValue = isGroup
      ? (item as AccountGroup).totalValueBaseCurrency
      : (item as AccountSummaryView).totalValueBaseCurrency;
    const currency = item.baseCurrency;
    const performance = item.performance;

    return (
      <div
        key={isGroup ? (item as AccountGroup).groupName : accountId}
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
            {(performance.totalGainLossAmount !== null || performance.dayGainLossAmount !== null) && (
              <div className="flex items-center space-x-2">
                {/* Display total gain if available */}
                {performance.totalGainLossAmount !== null && (
                  <GainAmount
                    className="text-sm font-light"
                    value={performance.totalGainLossAmount}
                    currency={currency}
                    displayCurrency={false}
                  />
                )}
                {/* Separator only if both total and day gains are shown */}
                {performance.totalGainLossAmount !== null &&
                  performance.dayGainLossAmount !== null && (
                    <div className="mx-1 h-3 border-r border-gray-300" />
                  )}
                {/* Display day gain if available */}
                {performance.dayGainLossPercent !== null && (
                  <GainPercent
                    className="text-sm font-light"
                    value={performance.dayGainLossPercent}
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
            <Link to={`/accounts/${accountId}`} className="ml-2 p-0">
              <Icons.ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          )}
        </div>
      </div>
    );
  },
);
AccountSummaryComponent.displayName = 'AccountSummaryComponent'; // Add display name for memoized component

export const AccountsSummary = React.memo(
  ({
    accountsSummary,
    className,
  }: {
    accountsSummary?: AccountGroup[];
    className?: string;
  }) => {
    const { accountsGrouped, setAccountsGrouped } = useSettingsContext();
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const toggleGroup = useCallback((groupName: string) => {
      setExpandedGroups((prev) => ({
        ...prev,
        [groupName]: !prev[groupName],
      }));
    }, []); // No dependencies needed if setExpandedGroups is stable

    const renderedContent = useMemo(() => {
      if (!accountsSummary || accountsSummary.length === 0) {
        return null;
      }

      if (accountsGrouped) {
        const actualGroups: AccountGroup[] = [];
        const standaloneAccounts: AccountSummaryView[] = [];

        accountsSummary.forEach((group) => {
          if (group.groupName && group.groupName !== 'Uncategorized') {
            actualGroups.push(group);
          } else {
            standaloneAccounts.push(...group.accounts);
          }
        });

        // Sort groups by total value (descending)
        actualGroups.sort((a, b) => b.totalValueBaseCurrency - a.totalValueBaseCurrency);
        // Sort standalone accounts by total value (descending)
        standaloneAccounts.sort((a, b) => b.totalValueBaseCurrency - a.totalValueBaseCurrency);

        return (
          <>
            {/* Render collapsible groups */}
            {actualGroups.map((group) => {
              const isExpanded = expandedGroups[group.groupName];
              // Sort accounts within the group by total value (descending)
              const sortedAccounts = [...group.accounts].sort(
                (a, b) => b.totalValueBaseCurrency - a.totalValueBaseCurrency,
              );
              return (
                <Card key={group.groupName} className="border-none shadow-none">
                  <CardHeader>
                    <AccountSummaryComponent
                      item={group}
                      isGroup={true}
                      isExpanded={isExpanded}
                      onToggle={() => toggleGroup(group.groupName)}
                    />
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="border-t pt-4">
                      {sortedAccounts.map((account) => (
                        <div key={account.accountId} className="py-4">
                          <AccountSummaryComponent item={account} isGroup={false} />
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })}
            {/* Render standalone accounts directly */}
            {standaloneAccounts.map((account) => (
              <Card key={account.accountId} className="border-none shadow-sm">
                <CardHeader className="py-6">
                  <AccountSummaryComponent item={account} isGroup={false} />
                </CardHeader>
              </Card>
            ))}
          </>
        );
      } else {
        // Flatten all accounts when not grouped
        const allAccounts = accountsSummary.flatMap((group) => group.accounts);
        // Sort all accounts by total value (descending)
        allAccounts.sort((a, b) => b.totalValueBaseCurrency - a.totalValueBaseCurrency);

        return allAccounts.map((account) => (
          <Card key={account.accountId} className="border-none shadow-sm">
            <CardHeader className="py-6">
              <AccountSummaryComponent item={account} isGroup={false} />
            </CardHeader>
          </Card>
        ));
      }
    }, [accountsSummary, accountsGrouped, expandedGroups, toggleGroup]); // Include dependencies

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
  },
);
AccountsSummary.displayName = 'AccountsSummary'; // Add display name for memoized component
