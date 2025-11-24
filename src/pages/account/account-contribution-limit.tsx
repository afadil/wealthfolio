import { calculateDepositsForLimit, getContributionLimit } from "@/commands/contribution-limits";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryKeys } from "@/lib/query-keys";
import { ContributionLimit, DepositsCalculation } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Icons, PrivacyAmount } from "@wealthfolio/ui";
import { Link } from "react-router-dom";

interface AccountContributionLimitProps {
  accountId: string;
}

export function AccountContributionLimit({ accountId }: AccountContributionLimitProps) {
  const currentYear = new Date().getFullYear();

  const { data: allLimits, isLoading: isLimitsLoading } = useQuery<ContributionLimit[], Error>({
    queryKey: [QueryKeys.CONTRIBUTION_LIMITS],
    queryFn: getContributionLimit,
  });

  const limitForAccount = allLimits?.find(
    (limit) => limit.accountIds?.includes(accountId) && limit.contributionYear === currentYear,
  );

  const { data: deposits, isLoading: isDepositsLoading } = useQuery<DepositsCalculation, Error>({
    queryKey: [QueryKeys.CONTRIBUTION_LIMIT_PROGRESS, accountId, currentYear],
    queryFn: () => calculateDepositsForLimit(limitForAccount?.id ?? ""),
    enabled: !isLimitsLoading,
  });

  if (isLimitsLoading || isDepositsLoading) {
    return <AccountContributionLimit.Skeleton />;
  }

  const accountDeposit = deposits?.byAccount[accountId];

  if (!limitForAccount) {
    return (
      <Card className="border-muted bg-muted/70 border-none p-6 shadow-none">
        <div className="flex items-center justify-between text-sm">
          <span>
            You&apos;ve contributed{" "}
            <span className="font-semibold">
              <PrivacyAmount
                value={accountDeposit?.convertedAmount ?? 0}
                currency={deposits?.baseCurrency ?? "USD"}
              />
            </span>{" "}
            so far in {currentYear}. There&apos;s no contribution limit set for this account.{" "}
            <Link
              to="/settings/contribution-limits"
              className="text-primary inline-flex items-center gap-1 font-semibold"
            >
              Set limit
              <Icons.ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <AccountContributionLimitItem
        key={limitForAccount.id}
        limit={limitForAccount}
        deposit={accountDeposit}
        totalDeposits={deposits?.total ?? 0}
        baseCurrency={deposits?.baseCurrency ?? "USD"}
      />
    </div>
  );
}

function AccountContributionLimitItem({
  limit,
  deposit,
  totalDeposits,
  baseCurrency,
}: {
  limit: ContributionLimit;
  deposit?: { amount: number; currency: string; convertedAmount: number };
  totalDeposits: number;
  baseCurrency: string;
}) {
  const progressValue = totalDeposits ? totalDeposits : 0;
  const progressPercentageNumber =
    limit.limitAmount > 0 ? (progressValue / limit.limitAmount) * 100 : 0;
  const isOverLimit = progressPercentageNumber > 100;
  const isAtLimit = progressPercentageNumber === 100;

  return (
    <Card
      className={`border-none pt-6 shadow-sm ${
        isOverLimit ? "border-destructive/20 bg-destructive/10" : isAtLimit ? "bg-success/10" : ""
      }`}
    >
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {isOverLimit ? (
              <span>
                You&apos;ve contributed{" "}
                <span className="font-semibold">
                  <PrivacyAmount value={deposit?.convertedAmount ?? 0} currency={baseCurrency} />
                </span>{" "}
                to this account in {limit.contributionYear}. Your total is{" "}
                <span className="text-destructive font-semibold">
                  <PrivacyAmount value={totalDeposits} currency={baseCurrency} />
                </span>{" "}
                which is over the{" "}
                <span className="font-semibold">
                  <PrivacyAmount value={limit.limitAmount} currency={baseCurrency} />
                </span>{" "}
                limit.
              </span>
            ) : (
              <span>
                You&apos;ve contributed{" "}
                <span className="font-semibold">
                  <PrivacyAmount value={deposit?.convertedAmount ?? 0} currency={baseCurrency} />
                </span>{" "}
                to this account in {limit.contributionYear}. Your total contribution towards the{" "}
                <span className="font-semibold">
                  <PrivacyAmount value={limit.limitAmount} currency={baseCurrency} />
                </span>{" "}
                {limit.groupName} limit is{" "}
                <span className="font-semibold">
                  <PrivacyAmount value={totalDeposits} currency={baseCurrency} />
                </span>
                .
              </span>
            )}
          </div>
        </div>
        <Progress value={progressPercentageNumber} className="w-full" />
      </CardContent>
    </Card>
  );
}

AccountContributionLimit.Skeleton = function AccountContributionLimitSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    </div>
  );
};
