import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { GainPercent } from '@/components/gain-percent';
import { GainAmount } from '@/components/gain-amount';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountSummary } from '@/lib/types';
import { formatAmount } from '@/lib/utils';
import { useSettingsContext } from '@/lib/settings-provider';

// Helper function to calculate category summary
const calculateCategorySummary = (accountsInCategory: AccountSummary[]) => {
  const totalMarketValue = accountsInCategory.reduce(
    (total, account) =>
      total + account.performance.marketValue * (account.performance.exchangeRate || 1),
    0,
  );
  const bookValue = accountsInCategory.reduce(
    (total, account) =>
      total + account.performance.bookCost * (account.performance.exchangeRate || 1),
    0,
  );

  const totalCashBalance = accountsInCategory.reduce(
    (total, account) =>
      total + account.performance.availableCash * (account.performance.exchangeRate || 1),
    0,
  );

  return {
    baseCurrency: accountsInCategory[0].performance.baseCurrency,
    totalMarketValue,
    totalCashBalance,
    totalGainPercent: ((totalMarketValue - bookValue) / bookValue) * 100,
    totalGainAmount: totalMarketValue - bookValue,
    numberOfAccounts: accountsInCategory.length,
  };
};

const Summary = ({
  title,
  description,
  value,
  gain,
  gainPercent,
  currency,
  isExpanded,
  onToggle,
}: {
  title: string;
  description?: string;
  value: number;
  gain: number;
  gainPercent: number;
  currency: string;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  return (
    <div className="flex w-full cursor-pointer items-center justify-between" onClick={onToggle}>
      <div className="flex flex-col">
        <div className="flex items-center">
          <span className="font-medium leading-none">{title}</span>
        </div>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      <div className="ml-2 flex items-start justify-between">
        <div className="flex flex-col items-end">
          <span className="font-medium leading-none">{formatAmount(value, currency)}</span>
          {gain !== 0 && (
            <div className="flex items-center space-x-2">
              <GainAmount
                className="text-sm font-light"
                value={gain || 0}
                currency={currency}
                displayCurrency={false}
              />
              <div className="mx-1 h-3 border-r border-gray-300" />
              <GainPercent className="text-sm font-light" value={gainPercent || 0} />
            </div>
          )}
        </div>
        <Icons.ChevronDown
          className={`ml-2 h-5 w-5 transition-transform ${isExpanded ? 'rotate-180 transform' : ''}`}
        />
      </div>
    </div>
  );
};

const AccountSummaryComponent = ({ accountSummary }: { accountSummary: AccountSummary }) => {
  return (
    <div key={accountSummary.account.id} className="flex w-full items-center justify-between">
      <div className="flex flex-col">
        <span className="font-medium leading-none">{accountSummary.account.name}</span>
        <span className="text-sm text-muted-foreground">
          {accountSummary.account.group
            ? `${accountSummary.account.group} - ${accountSummary.account.currency}`
            : accountSummary.account.currency}
        </span>
      </div>
      <div className="flex items-center">
        <div className="text-right">
          <p className="font-medium leading-none">
            {formatAmount(accountSummary.performance.totalValue, accountSummary.account.currency)}
          </p>
          {accountSummary.performance.totalGainPercentage !== 0 && (
            <div className="flex items-center space-x-2">
              <GainAmount
                className="text-sm font-light"
                value={accountSummary.performance.totalGainValue || 0}
                currency={accountSummary.account.currency || 'USD'}
                displayCurrency={false}
              />
              <div className="mx-1 h-3 border-r border-gray-300" />
              <GainPercent
                className="text-sm font-light"
                value={accountSummary.performance.totalGainPercentage || 0}
              />
            </div>
          )}
        </div>
        <Link to={`/accounts/${accountSummary.account.id}`} className="ml-2 p-0">
          <Button variant="link" size="sm">
            <Icons.ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Button>
        </Link>
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
      <Card>
        <CardHeader className="border-b">
          <Summary
            title={category}
            description={`${categorySummary.numberOfAccounts} accounts`}
            value={categorySummary.totalMarketValue + categorySummary.totalCashBalance}
            gain={categorySummary.totalGainAmount}
            gainPercent={categorySummary.totalGainPercent}
            currency={categorySummary.baseCurrency}
            isExpanded={isExpanded}
            onToggle={() => toggleCategory(category)}
          />
        </CardHeader>
        {isExpanded && (
          <CardContent className="pt-4">
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
            <Card key={accountSummary.account.id}>
              <CardHeader className="py-6">
                <AccountSummaryComponent accountSummary={accountSummary} />
              </CardHeader>
            </Card>
          ))}
        </>
      );
    } else {
      return accounts?.map((accountSummary) => (
        <Card key={accountSummary.account.id}>
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
