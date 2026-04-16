import { AccountSelector } from "@/components/account-selector";
import { SwipablePage, SwipablePageView } from "@/components/page";
import { createPortfolioAccount, PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Account } from "@/lib/types";
import IncomePage from "@/pages/income/income-page";
import PerformancePage from "@/pages/performance/performance-page";
import { Icons } from "@wealthfolio/ui";
import { Card, CardContent, CardHeader } from "@wealthfolio/ui/components/ui/card";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import HoldingsInsightsPage from "../holdings/holdings-insights-page";

// Loading skeleton to show while the dashboard is loading
function DashboardLoader() {
  const { t } = useTranslation("common");
  return (
    <div className="flex h-full w-full flex-col space-y-4 p-4">
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      <div className="flex items-center justify-center py-8">
        <span className="text-muted-foreground text-sm">
          {t("portfolio.insights.loading_dashboard")}
        </span>
      </div>
    </div>
  );
}

export default function PortfolioInsightsPage() {
  const { t, i18n } = useTranslation("common");
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(() => {
    return {
      ...createPortfolioAccount(baseCurrency),
      name: t("account.selector.all_portfolio"),
    } as Account;
  });

  useEffect(() => {
    setSelectedAccount((prev) => {
      if (!prev || prev.id !== PORTFOLIO_ACCOUNT_ID) return prev;
      return {
        ...prev,
        name: t("account.selector.all_portfolio"),
        currency: baseCurrency,
      };
    });
  }, [t, i18n.language, baseCurrency]);

  const accountId = selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID;

  const holdingsActions = useMemo(
    () => (
      <AccountSelector
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        variant="dropdown"
        includePortfolio={true}
        iconOnly={true}
        icon={Icons.ListFilter}
      />
    ),
    [selectedAccount],
  );

  // Define the views with icons
  const views: SwipablePageView[] = useMemo(
    () => [
      {
        value: "holdings",
        label: t("portfolio.insights.tab_holdings"),
        icon: Icons.PieChart,
        content: (
          <Suspense fallback={<DashboardLoader />}>
            <HoldingsInsightsPage accountId={accountId} />
          </Suspense>
        ),
        actions: holdingsActions,
      },
      {
        value: "performance",
        label: t("portfolio.insights.tab_performance"),
        icon: Icons.TrendingUp,
        content: (
          <Suspense fallback={<DashboardLoader />}>
            <PerformancePage />
          </Suspense>
        ),
      },
      {
        value: "income",
        label: t("portfolio.insights.tab_income"),
        icon: Icons.HandCoins,
        content: (
          <Suspense fallback={<DashboardLoader />}>
            <IncomePage />
          </Suspense>
        ),
      },
    ],
    [accountId, holdingsActions, t],
  );

  return <SwipablePage views={views} defaultView="holdings" withPadding={true} />;
}
