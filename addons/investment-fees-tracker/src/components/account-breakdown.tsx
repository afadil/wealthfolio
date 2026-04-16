import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui";
import { AmountDisplay, Icons } from "@wealthfolio/ui";
import type { FeeAnalytics } from "../lib/fee-calculation.service";
import { useTranslation } from "react-i18next";

// Simple EmptyPlaceholder component since it's not exported from UI package
function EmptyPlaceholder({
  className,
  icon,
  title,
  description,
}: {
  className?: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className={`flex min-h-[400px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center ${className || ""}`}
    >
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
        <div className="bg-muted mb-4 flex h-20 w-20 items-center justify-center rounded-full">
          {icon}
        </div>
        <h2 className="mt-2 text-xl font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-2 text-center text-sm font-normal leading-6">
          {description}
        </p>
      </div>
    </div>
  );
}

interface AccountBreakdownProps {
  feeAnalytics: FeeAnalytics;
  currency: string;
  isBalanceHidden: boolean;
}

export function AccountBreakdown({
  feeAnalytics,
  currency,
  isBalanceHidden,
}: AccountBreakdownProps) {
  const { t } = useTranslation("common");
  const { accountFeeAnalysis } = feeAnalytics;

  // Get top 10 accounts
  const topAccounts = accountFeeAnalysis.slice(0, 10);

  if (topAccounts.length === 0) {
    return (
      <Card className="flex h-full flex-col">
        <CardHeader>
          <CardTitle className="text-xl">{t("addon.investment_fees.account_breakdown.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center">
          <EmptyPlaceholder
            className="mx-auto flex h-[300px] max-w-[420px] items-center justify-center"
            icon={<Icons.CreditCard className="h-10 w-10" />}
            title={t("addon.investment_fees.account_breakdown.empty_title")}
            description={t("addon.investment_fees.account_breakdown.empty_description")}
          />
        </CardContent>
      </Card>
    );
  }

  // total fees for percentage are calculated per-section where needed

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-xl">{t("addon.investment_fees.account_breakdown.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="space-y-6">
          {/* Horizontal Bar Chart */}
          <div className="flex w-full space-x-0.5">
            {(() => {
              const top5Accounts = accountFeeAnalysis.slice(0, 5);
              const otherAccounts = accountFeeAnalysis.slice(5);
              const otherTotal = otherAccounts.reduce((sum, account) => sum + account.totalFees, 0);
              const totalAccountFees = accountFeeAnalysis.reduce(
                (sum, account) => sum + account.totalFees,
                0,
              );

              const chartItems = [
                ...top5Accounts.map((account) => ({
                  name: account.accountName,
                  fees: account.totalFees,
                  isOther: false,
                })),
                ...(otherTotal > 0
                  ? [
                      {
                        name: t("addon.investment_fees.account_breakdown.other_accounts", {
                          count: otherAccounts.length,
                        }),
                        fees: otherTotal,
                        isOther: true,
                      },
                    ]
                  : []),
              ];

              const colors = [
                "var(--chart-1)",
                "var(--chart-2)",
                "var(--chart-3)",
                "var(--chart-4)",
                "var(--chart-5)",
                "var(--chart-6)",
              ];

              return chartItems.map((item, index) => {
                const percentage = totalAccountFees > 0 ? (item.fees / totalAccountFees) * 100 : 0;

                return (
                  <div
                    key={index}
                    className="group relative h-5 cursor-pointer rounded-lg transition-all duration-300 ease-in-out hover:brightness-110"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: colors[index % colors.length],
                    }}
                  >
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 transform group-hover:block">
                      <div className="bg-popover text-popover-foreground min-w-[180px] rounded-lg border px-3 py-2 shadow-md">
                        <div className="text-sm font-medium">{item.name}</div>
                        <div className="text-sm font-medium">
                          <AmountDisplay
                            value={item.fees}
                            currency={currency}
                            isHidden={isBalanceHidden}
                          />
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {t("addon.investment_fees.account_breakdown.tooltip_pct_of_fees", {
                            percent: percentage.toFixed(1),
                          })}
                        </div>
                        {/* Tooltip arrow */}
                        <div className="border-t-border absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 transform border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent"></div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Detailed List */}
          <div className="space-y-3">
            {topAccounts.map((account, index) => {
              const totalAccountFees = accountFeeAnalysis.reduce(
                (sum, acc) => sum + acc.totalFees,
                0,
              );
              return (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{account.accountName}</span>
                      <div className="text-muted-foreground flex items-center space-x-2 text-xs">
                        <span>
                          {t("addon.investment_fees.account_breakdown.transactions", {
                            count: account.transactionCount,
                          })}
                        </span>
                        <span>•</span>
                        <span>
                          <AmountDisplay
                            value={account.averageFeePerTransaction}
                            currency={currency}
                            isHidden={isBalanceHidden}
                          />{" "}
                          {t("addon.investment_fees.account_breakdown.avg_label")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-destructive text-sm font-medium">
                      <AmountDisplay
                        value={account.totalFees}
                        currency={currency}
                        isHidden={isBalanceHidden}
                      />
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {totalAccountFees > 0
                        ? ((account.totalFees / totalAccountFees) * 100).toFixed(1)
                        : 0}
                      %
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
