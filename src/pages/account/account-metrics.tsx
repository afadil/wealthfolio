import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  MoneyInput,
  PrivacyAmount,
  Button,
  Icons,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Separator,
  Skeleton,
} from "@wealthfolio/ui";
import { getAccountFreeCash } from "@/commands/goal";
import { AccountFreeCash, AccountValuation, PerformanceMetrics } from "@/lib/types";
import { AccountType } from "@/lib/constants";
import { PerformanceGrid } from "@/pages/account/performance-grid";
import { formatDate } from "@/lib/utils";
import { QueryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { useBalanceUpdate } from "./use-balance-update";
import { Link } from "react-router-dom";

interface EditableBalanceProps {
  account: AccountValuation;
  initialBalance: number;
  currency: string;
}

const EditableBalance: React.FC<EditableBalanceProps> = ({ account, initialBalance, currency }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [balance, setBalance] = useState(initialBalance);
  const { updateBalance, isPending } = useBalanceUpdate(account);

  const handleSave = () => {
    updateBalance(balance);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <MoneyInput
          value={balance}
          onChange={(e) => {
            const inputValue = parseFloat(e.target.value);
            if (!isNaN(inputValue)) {
              setBalance(inputValue);
            }
          }}
        />
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? (
            <Icons.Spinner className="h-4 w-4 animate-spin" />
          ) : (
            <Icons.Check className="h-4 w-4" />
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
          <Icons.Close className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex cursor-pointer items-center gap-2 text-lg font-extrabold"
            onClick={() => setIsEditing(true)}
          >
            <PrivacyAmount value={initialBalance} currency={currency} />
            <Icons.Pencil className="text-muted-foreground h-4 w-4 cursor-pointer" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Click to update the cash balance</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface AccountMetricsProps {
  accountId: string;
  accountType?: AccountType;
  valuation?: AccountValuation | null;
  performance?: PerformanceMetrics | null;
  className?: string;
  isLoading?: boolean;
}

const AccountMetrics: React.FC<AccountMetricsProps> = ({
  accountId,
  accountType,
  valuation,
  performance,
  className,
  isLoading,
}) => {
  const isCashAccount = accountType === "CASH";

  const { data: freeCashData } = useQuery<AccountFreeCash[], Error>({
    queryKey: [QueryKeys.ACCOUNT_FREE_CASH, accountId],
    queryFn: () => getAccountFreeCash([accountId]),
    enabled: isCashAccount && !!accountId,
  });

  const accountFreeCash = freeCashData?.[0];
  const hasContributions = accountFreeCash && accountFreeCash.totalContributions > 0;

  if (isLoading || !valuation)
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-7 w-24" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Separator className="mb-4" />
          <div className="space-y-4 text-sm">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          {!isCashAccount && <PerformanceGrid isLoading={true} />}
        </CardContent>
        <CardFooter className="flex justify-end pb-0">
          <Skeleton className="h-3 w-48" />
        </CardFooter>
      </Card>
    );

  const displayCurrency = valuation?.accountCurrency || valuation?.baseCurrency;

  if (isCashAccount) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-bold">Balance</CardTitle>
          {valuation && (
            <EditableBalance
              account={valuation}
              initialBalance={valuation?.cashBalance || 0}
              currency={displayCurrency}
            />
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />
          {hasContributions ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Allocated to Goals</span>
                <span className="font-medium text-primary">
                  <PrivacyAmount
                    value={accountFreeCash.totalContributions}
                    currency={displayCurrency}
                  />
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available Balance</span>
                <span className={`font-medium ${accountFreeCash.freeCash < 0 ? "text-destructive" : ""}`}>
                  <PrivacyAmount value={accountFreeCash.freeCash} currency={displayCurrency} />
                </span>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground py-2 text-center text-sm">
              <p>No savings goals allocated</p>
              <Link
                to="/settings/goals"
                className="text-primary hover:text-primary/80 mt-1 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
              >
                Set up goals
                <Icons.ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Non-cash accounts: show investments/performance metrics
  const rows = [
    {
      label: "Investments",
      value: (
        <PrivacyAmount value={valuation?.investmentMarketValue || 0} currency={displayCurrency} />
      ),
    },
    {
      label: "Net Contribution",
      value: <PrivacyAmount value={valuation?.netContribution || 0} currency={displayCurrency} />,
    },
    {
      label: "Cost Basis",
      value: <PrivacyAmount value={valuation?.costBasis || 0} currency={displayCurrency} />,
    },
  ];

  const formattedStartDate = formatDate(performance?.periodStartDate || "");
  const formattedEndDate = formatDate(performance?.periodEndDate || "");

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-bold">Cash Balance</CardTitle>
        {valuation && (
          <EditableBalance
            account={valuation}
            initialBalance={valuation?.cashBalance || 0}
            currency={displayCurrency}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <Separator className="mb-4" />
        <div className="space-y-4 text-sm">
          {rows.map(({ label, value }, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-medium`}>{value}</span>
            </div>
          ))}
        </div>

        <PerformanceGrid performance={performance} isLoading={isLoading} />
      </CardContent>
      <CardFooter className="flex justify-end pb-0">
        <p className="text-muted-foreground m-0 p-0 text-xs">
          from {formattedStartDate} to {formattedEndDate}
        </p>
      </CardFooter>
    </Card>
  );
};

export default AccountMetrics;
