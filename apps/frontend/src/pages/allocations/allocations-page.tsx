import { Suspense, useMemo } from "react";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { EmptyPlaceholder } from "@wealthfolio/ui";

import { SwipablePage, type SwipablePageView } from "@/components/page";
import { AllocationsOverview } from "./components/allocations-overview";

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
  const views: SwipablePageView[] = useMemo(
    () => [
      {
        value: "overview",
        label: "Overview",
        icon: Icons.PieChart,
        content: (
          <Suspense fallback={<LoadingSkeleton />}>
            <AllocationsOverview />
          </Suspense>
        ),
      },
      {
        value: "rebalancing",
        label: "Rebalancing",
        icon: Icons.ArrowLeftRight,
        content: (
          <div className="flex items-center justify-center py-16">
            <EmptyPlaceholder
              icon={<Icons.ArrowLeftRight className="text-muted-foreground h-10 w-10" />}
              title="Rebalancing Advisor"
              description="Coming soon. This will suggest trades to align your portfolio with your target allocations."
            />
          </div>
        ),
      },
    ],
    [],
  );

  return <SwipablePage views={views} defaultView="overview" withPadding={true} />;
};

export default AllocationsPage;
