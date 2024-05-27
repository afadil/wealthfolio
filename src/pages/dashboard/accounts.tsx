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
}: {
  title: string;
  description?: string;
  value: number;
  gain: number;
  gainPercent: number;
  currency: string;
}) => {
  return (
    <div key={title} className="flex items-center">
      <div className="ml-4 space-y-1">
        <p className="font-medium leading-none">{title}</p>
        <p className="text-xs font-light text-muted-foreground">{description}</p>
      </div>
      <div className="text-md ml-auto text-right font-medium">
        <p className="font-medium leading-none"> {formatAmount(value, currency)}</p>
        {gain !== 0 ? (
          <p
            className={`text-xs ${
              gainPercent === 0 ? 'text-base' : gainPercent > 0 ? 'text-green-500' : 'text-red-500'
            } `}
          >
            {formatAmount(gain, currency, false)} / {formatPercent(gainPercent)}
          </p>
        ) : null}
      </div>
      <div className="ml-2">
        {/* <Button variant="ghost" size="sm">
          <Icons.ChevronRight className="h-4 w-4" />
        </Button> */}
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
      <div className="ml-4 space-y-1">
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

  // Function to group accounts by category and calculate aggregate values
  const groupAccountsByCategory = () => {
    const groupedAccounts: Record<string, AccountTotal[]> = {};
    for (const account of accounts || []) {
      const category = account.group || account.name;
      if (!groupedAccounts[category]) {
        groupedAccounts[category] = [];
      }
      groupedAccounts[category].push(account);
    }
    return groupedAccounts;
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
    return (
      <Summary
        title={category}
        description={
          categorySummary.numberOfAccounts +
          ' ' +
          (categorySummary.numberOfAccounts > 1 ? 'accounts' : 'account')
        }
        value={categorySummary.totalMarketValue + categorySummary.totalCashBalance}
        gain={categorySummary.totalGainAmount}
        gainPercent={categorySummary.totalGainPercent}
        currency={categorySummary.baseCurrency}
      />
    );
  };

  const renderAccounts = () => {
    if (accountsGrouped) {
      const groupedAccounts = groupAccountsByCategory();
      return Object.keys(groupedAccounts).map((category) => (
        <CategorySummary
          key={category}
          category={category}
          accountsInCategory={groupedAccounts[category]}
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
