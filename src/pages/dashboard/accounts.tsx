import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { GainPercent } from '@/components/gain-percent';
import { GainAmount } from '@/components/gain-amount';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountSummary } from '@/lib/types';
import { useSettingsContext } from '@/lib/settings-provider';
import { PrivacyAmount } from '@/components/privacy-amount';

// Helper function to calculate category summary
const calculateCategorySummary = (accountsInCategory: AccountSummary[]) => {
  const totalMarketValue = accountsInCategory.reduce(
    (total, account) =>
      total + account.performance.marketValue * (account.performance.exchangeRate || 1),
    0,
  );
  const totalValue = accountsInCategory.reduce(
    (total, account) =>
      total + account.performance.totalValue * (account.performance.exchangeRate || 1),
    0,
  );

  const totalNetDeposit = accountsInCategory.reduce(
    (total, account) =>
      total + account.performance.netDeposit * (account.performance.exchangeRate || 1),
    0,
  );

  const totalCashBalance = accountsInCategory.reduce(
    (total, account) =>
      total + account.performance.availableCash * (account.performance.exchangeRate || 1),
    0,
  );

  const totalGainPercent =
    totalNetDeposit !== 0 ? ((totalValue - totalNetDeposit) / totalNetDeposit) * 100 : 0;

  return {
    baseCurrency: accountsInCategory[0].performance.baseCurrency,
    totalMarketValue,
    totalCashBalance,
    totalGainPercent,
    totalGainAmount: totalValue - totalNetDeposit,
    numberOfAccounts: accountsInCategory.length,
  };
};

const AccountSummaryComponent = ({
  accountSummary,
  isGroup = false,
  isExpanded = false,
  onToggle,
}: {
  accountSummary:
    | AccountSummary
    | { account: { id: string; name: string; group?: string; currency: string }; performance: any };
  isGroup?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}) => {
  return (
    <div
      key={isGroup ? accountSummary.account.group : accountSummary.account.id}
      className="flex w-full items-center justify-between"
      onClick={isGroup ? onToggle : undefined}
    >
      <div className="flex flex-col">
        <span className="font-medium leading-none">{accountSummary.account.name}</span>
        <span className="text-sm text-muted-foreground">
          {isGroup
            ? `${accountSummary.performance.numberOfAccounts} accounts`
            : accountSummary.account.group
              ? `${accountSummary.account.group} - ${accountSummary.account.currency}`
              : accountSummary.account.currency}
        </span>
      </div>
      <div className="flex items-center">
        <div className="flex flex-col items-end">
          <p className="font-medium leading-none">
            {isGroup ? (
              <PrivacyAmount
                value={
                  accountSummary.performance.totalValue ||
                  accountSummary.performance.totalMarketValue +
                    accountSummary.performance.totalCashBalance
                }
                currency={accountSummary.account.currency}
              />
            ) : (
              <PrivacyAmount
                value={
                  accountSummary.performance.totalValue ||
                  accountSummary.performance.marketValue + accountSummary.performance.availableCash
                }
                currency={accountSummary.account.currency}
              />
            )}
          </p>
          {(accountSummary.performance.totalGainPercentage !== 0 ||
            accountSummary.performance.totalGainPercent !== 0) && (
            <div className="flex items-center space-x-2">
              <GainAmount
                className="text-sm font-light"
                value={
                  accountSummary.performance.totalGainValue ||
                  accountSummary.performance.totalGainAmount ||
                  0
                }
                currency={accountSummary.account.currency || 'USD'}
                displayCurrency={false}
              />
              <div className="mx-1 h-3 border-r border-gray-300" />
              <GainPercent
                className="text-sm font-light"
                value={
                  accountSummary.performance.totalGainPercentage ||
                  accountSummary.performance.totalGainPercent ||
                  0
                }
                animated={true}
              />
            </div>
          )}
        </div>
        {isGroup ? (
          <Icons.ChevronDown
            className={`ml-2 h-5 w-5 transition-transform ${isExpanded ? 'rotate-180 transform' : ''}`}
          />
        ) : (
          <Link to={`/accounts/${accountSummary.account.id}`} className="ml-2 p-0">
            <Icons.ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        )}
      </div>
    </div>
  );
};

export function Accounts({
  accounts,
  className,
}: {
  accounts?: AccountSummary[];
  className?: string;
}) {
  const { accountsGrouped, setAccountsGrouped } = useSettingsContext();
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const groupAccountsByCategory = () => {
    const groupedAccounts: Record<string, AccountSummary[]> = {};
    const ungroupedAccounts: AccountSummary[] = [];

    for (const accountSummary of accounts || []) {
      const category = accountSummary.account.group;
      if (category) {
        if (!groupedAccounts[category]) {
          groupedAccounts[category] = [];
        }
        groupedAccounts[category].push(accountSummary);
      } else {
        ungroupedAccounts.push(accountSummary);
      }
    }
    return { groupedAccounts, ungroupedAccounts };
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const CategorySummary = ({
    category,
    accountsInCategory,
  }: {
    category: string;
    accountsInCategory: AccountSummary[];
  }) => {
    const categorySummary = calculateCategorySummary(accountsInCategory);
    const isExpanded = expandedCategories[category];
    return (
      <Card className="border-none shadow-sm">
        <CardHeader>
          <AccountSummaryComponent
            accountSummary={{
              account: { id: category, name: category, currency: categorySummary.baseCurrency },
              performance: categorySummary,
            }}
            isGroup={true}
            isExpanded={isExpanded}
            onToggle={() => toggleCategory(category)}
          />
        </CardHeader>
        {isExpanded && (
          <CardContent className="border-t pt-4">
            {accountsInCategory.map((accountSummary) => (
              <div key={accountSummary.account.id} className="py-4">
                <AccountSummaryComponent accountSummary={accountSummary} />
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    );
  };

  const renderAccounts = () => {
    if (accountsGrouped) {
      const { groupedAccounts, ungroupedAccounts } = groupAccountsByCategory();
      return (
        <>
          {Object.entries(groupedAccounts).map(([category, accountsInCategory]) => (
            <CategorySummary
              key={category}
              category={category}
              accountsInCategory={accountsInCategory}
            />
          ))}
          {ungroupedAccounts.map((accountSummary) => (
            <Card key={accountSummary.account.id} className="border-none shadow-sm">
              <CardHeader className="py-6">
                <AccountSummaryComponent accountSummary={accountSummary} />
              </CardHeader>
            </Card>
          ))}
        </>
      );
    } else {
      return accounts?.map((accountSummary) => (
        <Card key={accountSummary.account.id} className="border-none shadow-sm">
          <CardHeader className="py-6">
            <AccountSummaryComponent accountSummary={accountSummary} />
          </CardHeader>
        </Card>
      ));
    }
  };

  return (
    <Card className={className}>
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
        <div className="space-y-4">{renderAccounts()}</div>
      </CardContent>
    </Card>
  );
}
