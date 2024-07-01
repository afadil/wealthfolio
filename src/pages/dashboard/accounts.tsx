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
            <span className={`text-sm ${gainPercent > 0 ? 'text-green-500' : 'text-red-500'}`}>
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
    <div key={account.id} className="flex items-center">
      <div className="ml-2 space-y-1">
        <p className="font-medium leading-none">{account.name} </p>
        <p className="text-xs font-light text-muted-foreground">
          {account.group} - {account.currency}
        </p>
      </div>
      <div className="text-md ml-auto text-right font-medium">
        <p className="font-medium leading-none">
          {' '}
          {formatAmount(account.totalValue, account.currency)}
        </p>

        {account.totalGainAmount !== 0 ? (
          <p
            className={`text-xs ${
              account.totalGainPercent === 0
                ? 'text-base'
                : account.totalGainPercent > 0
                  ? 'text-green-500'
                  : 'text-red-500'
            } `}
          >
            {formatAmount(account.totalGainAmount, account.currency, false)} /
            {formatPercent(account.totalGainPercent)}
          </p>
        ) : null}
      </div>
      <div className="ml-2">
        <Button variant="ghost" size="sm" onClick={handleNavigate}>
          <Icons.ChevronRight className="h-4 w-4" />
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
      const category = account.group || 'Uncategorized';
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

  // Component for rendering a category summary
  const CategorySummary = ({
    category,
    accountsInCategory,
  }: {
    category: string;
    accountsInCategory: AccountTotal[];
  }) => {
    const categorySummary = calculateCategorySummary(accountsInCategory);
    const isExpanded = expandedCategories[category];

    return (
      <div>
        <Summary
          title={category}
          description={`${categorySummary.numberOfAccounts} ${
            categorySummary.numberOfAccounts > 1 ? 'accounts' : 'account'
          }`}
          value={categorySummary.totalMarketValue + categorySummary.totalCashBalance}
          gain={categorySummary.totalGainAmount}
          gainPercent={categorySummary.totalGainPercent}
          currency={categorySummary.baseCurrency}
          isExpanded={isExpanded}
          onToggle={() => toggleCategory(category)}
        />
        {isExpanded && (
          <div className="mt-4 space-y-2">
            {accountsInCategory.map((account) => (
              <AccountSummary key={account.id} account={account} />
            ))}
          </div>
        )}
      </div>
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
      return accounts?.map((account) => <AccountSummary key={account.id} account={account} />);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-md">{accountsGrouped ? 'Groups' : 'Accounts'}</CardTitle>
        <Button
          variant="ghost"
          className="rounded-full bg-muted"
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
        <div className={accountsGrouped ? 'space-y-8' : 'space-y-6'}>{renderAccounts()}</div>
      </CardContent>
    </Card>
  );
}
