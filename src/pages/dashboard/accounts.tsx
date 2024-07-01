import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountTotal } from '@/lib/types';
import { formatAmount, formatPercent } from '@/lib/utils';
import { useSettingsContext } from '@/lib/settings-provider';

// Helper function to calculate category summary
const calculateCategorySummary = (accountsInCategory: AccountTotal[]) => {
  const totalMarketValue = accountsInCategory.reduce(
    (total, account) => total + account.marketValueConverted,
    0,
  );
  const bookValue = accountsInCategory.reduce(
    (total, account) => total + account.bookValueConverted,
    0,
  );

  const totalCashBalance = accountsInCategory.reduce(
    (total, account) => total + account.cashBalanceConverted,
    0,
  );

  return {
    baseCurrency: accountsInCategory[0].baseCurrency,
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
            <span
              className={`text-sm font-light ${gainPercent > 0 ? 'text-green-500' : 'text-red-500'}`}
            >
              {formatAmount(gain, currency, false)} / {formatPercent(gainPercent)}
            </span>
          )}
        </div>
        <Icons.ChevronDown
          className={`ml-2 h-5 w-5 transition-transform ${isExpanded ? 'rotate-180 transform' : ''}`}
        />
      </div>
    </div>
  );
};

const AccountSummary = ({ account }: { account: AccountTotal }) => {
  const navigate = useNavigate();
  const handleNavigate = () => {
    navigate(`/accounts/${account.id}`, { state: { account: account } });
  };
  return (
    <div key={account.id} className="flex w-full items-center justify-between">
      <div className="flex flex-col">
        <span className="font-medium leading-none">{account.name}</span>
        <span className="text-sm text-muted-foreground">
          {account.group ? `${account.group} - ${account.currency}` : account.currency}
        </span>
      </div>
      <div className="flex items-center">
        <div className="text-right">
          <p className="font-medium leading-none">
            {formatAmount(account.totalValue, account.currency)}
          </p>
          {account.totalGainAmount !== 0 && (
            <p
              className={`text-sm font-light ${account.totalGainPercent > 0 ? 'text-green-500' : 'text-red-500'}`}
            >
              {formatAmount(account.totalGainAmount, account.currency, false)} /
              {formatPercent(account.totalGainPercent)}
            </p>
          )}
        </div>
        <Button variant="link" size="sm" onClick={handleNavigate} className="ml-2 p-0">
          <Icons.ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
};

export function Accounts({
  accounts,
  className,
}: {
  accounts?: AccountTotal[];
  className?: string;
}) {
  const { accountsGrouped, setAccountsGrouped } = useSettingsContext();
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const groupAccountsByCategory = () => {
    const groupedAccounts: Record<string, AccountTotal[]> = {};
    for (const account of accounts || []) {
      const category = account.group;
      if (!groupedAccounts[category]) {
        groupedAccounts[category] = [];
      }
      groupedAccounts[category].push(account);
    }
    return groupedAccounts;
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
    accountsInCategory: AccountTotal[];
  }) => {
    if (!category) {
      return (
        <Card>
          <CardHeader className="py-4">
            <AccountSummary account={accountsInCategory[0]} />
          </CardHeader>
        </Card>
      );
    }

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
            {accountsInCategory.map((account) => (
              <AccountSummary key={account.id} account={account} />
            ))}
          </CardContent>
        )}
      </Card>
    );
  };

  const renderAccounts = () => {
    if (accountsGrouped) {
      const groupedAccounts = groupAccountsByCategory();
      return Object.entries(groupedAccounts).map(([category, accountsInCategory]) => (
        <CategorySummary
          key={category}
          category={category}
          accountsInCategory={accountsInCategory}
        />
      ));
    } else {
      return accounts?.map((account) => (
        <Card key={account.id}>
          <CardHeader className="py-6">
            <AccountSummary account={account} />
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
