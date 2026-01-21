import { SwipablePage, SwipablePageView } from "@/components/page";
import { HealthStatusIndicator } from "@/components/health-status-icon";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { useNavigationMode } from "@/pages/layouts/navigation/navigation-mode-context";
import { Icons, Button } from "@wealthfolio/ui";
import { Suspense, useMemo } from "react";
import { DashboardContent } from "./dashboard-content";
import { DashboardActions } from "./dashboard-actions";
import { NetWorthContent } from "../net-worth/net-worth-content";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@wealthfolio/ui/components/ui/card";

// Loading skeleton
const PageLoader = () => (
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
  </div>
);

export default function PortfolioPage() {
  const { isFocusMode, toggleFocusMode } = useNavigationMode();

  // Shared actions for both views
  const sharedActions = (
    <>
      <HealthStatusIndicator />
      {isFocusMode && (
        <Button
          variant="secondary"
          size="icon-xs"
          className="bg-secondary/50 rounded-full"
          onClick={toggleFocusMode}
        >
          <Icons.Fullscreen className="size-5" />
        </Button>
      )}
      <PrivacyToggle />
      <DashboardActions />
    </>
  );

  const views: SwipablePageView[] = useMemo(
    () => [
      {
        value: "investments",
        label: "Investments",
        icon: Icons.TrendingUp,
        content: (
          <Suspense fallback={<PageLoader />}>
            <DashboardContent />
          </Suspense>
        ),
        actions: sharedActions,
      },
      {
        value: "net-worth",
        label: "Net Worth",
        icon: Icons.Wallet,
        content: (
          <Suspense fallback={<PageLoader />}>
            <NetWorthContent />
          </Suspense>
        ),
        actions: sharedActions,
      },
    ],
    [sharedActions],
  );

  return <SwipablePage views={views} defaultView="investments" withPadding={false} />;
}
