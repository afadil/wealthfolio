import { Suspense, useMemo, useState, useEffect } from "react";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import { SwipablePage, type SwipablePageView } from "@/components/page";
import { AllocationsOverview } from "./components/allocations-overview";
import { RebalancingTab } from "./components/rebalancing-tab";
import { useSettingsContext } from "@/lib/settings-provider";
import { usePortfolioTargets, useAllocationDeviations } from "@/hooks/use-portfolio-targets";
import type { Account } from "@/lib/types";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";

const LoadingSkeleton = () => (
  <div className="space-y-4 p-4">
    <Skeleton className="h-10 w-48" />
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Skeleton className="h-75" />
      <Skeleton className="h-75]" />
    </div>
  </div>
);

const AllocationsPage = () => {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  // Persist selected account in sessionStorage
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(() => {
    const stored = sessionStorage.getItem("allocations-selected-account");
    if (stored) {
      try {
        return JSON.parse(stored) as Account;
      } catch {
        // If parsing fails, return default
      }
    }
    return {
      id: PORTFOLIO_ACCOUNT_ID,
      name: "All Portfolio",
      accountType: "PORTFOLIO" as unknown as Account["accountType"],
      balance: 0,
      currency: baseCurrency,
      isDefault: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Account;
  });

  // Persist account selection to sessionStorage
  useEffect(() => {
    if (selectedAccount) {
      sessionStorage.setItem("allocations-selected-account", JSON.stringify(selectedAccount));
    }
  }, [selectedAccount]);

  const accountId = selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID;
  const { targets } = usePortfolioTargets(accountId);
  const activeTarget = targets.find((t) => t.isActive) ?? targets[0] ?? null;
  const { deviationReport } = useAllocationDeviations(activeTarget?.id);

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
  };

  const views: SwipablePageView[] = useMemo(
    () => [
      {
        value: "overview",
        label: "Overview",
        icon: Icons.PieChart,
        content: (
          <Suspense fallback={<LoadingSkeleton />}>
            <AllocationsOverview
              selectedAccount={selectedAccount}
              onAccountChange={handleAccountSelect}
            />
          </Suspense>
        ),
      },
      {
        value: "rebalancing",
        label: "Rebalancing",
        icon: Icons.ArrowLeftRight,
        content: (
          <Suspense fallback={<LoadingSkeleton />}>
            {selectedAccount && (
              <RebalancingTab
                selectedAccount={selectedAccount}
                onAccountChange={handleAccountSelect}
                activeTarget={activeTarget}
                deviationReport={deviationReport ?? null}
                baseCurrency={baseCurrency}
              />
            )}
          </Suspense>
        ),
      },
    ],
    [selectedAccount, activeTarget, deviationReport, baseCurrency],
  );

  return <SwipablePage views={views} defaultView="overview" withPadding={true} />;
};

export default AllocationsPage;
