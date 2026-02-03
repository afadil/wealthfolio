import { ActionPalette, type ActionPaletteGroup } from "@/components/action-palette";
import { useSyncBrokerData } from "@/features/wealthfolio-connect/hooks";
import { useWealthfolioConnect } from "@/features/wealthfolio-connect/providers/wealthfolio-connect-provider";
import {
  useRecalculatePortfolioMutation,
  useUpdatePortfolioMutation,
} from "@/hooks/use-calculate-portfolio";
import { useRunHealthChecks } from "@/hooks/use-health";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

export function DashboardActions() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Portfolio update mutations
  const updatePortfolioMutation = useUpdatePortfolioMutation();
  const recalculatePortfolioMutation = useRecalculatePortfolioMutation();
  const runHealthChecksMutation = useRunHealthChecks();

  // Wealthfolio Connect sync
  const { isEnabled, isConnected, userInfo } = useWealthfolioConnect();
  const { mutate: syncBrokerData } = useSyncBrokerData();
  const hasSubscription =
    userInfo?.team?.subscription_status === "active" ||
    userInfo?.team?.subscription_status === "trialing";
  const showSyncAction = isEnabled && isConnected && hasSubscription;

  const groups = useMemo((): ActionPaletteGroup[] => {
    return [
      {
        items: [
          {
            icon: Icons.Plus,
            label: "Record Transaction",
            onClick: () => navigate("/activities/manage"),
          },
          ...(showSyncAction
            ? [
                {
                  icon: Icons.Download,
                  label: "Sync Broker Accounts",
                  onClick: () => syncBrokerData(),
                },
              ]
            : []),
          {
            icon: Icons.Refresh,
            label: "Update Prices",
            onClick: () => updatePortfolioMutation.mutate(),
          },
          {
            icon: Icons.History,
            label: "Rebuild Full History",
            onClick: () => recalculatePortfolioMutation.mutate(),
          },
          {
            icon: Icons.ShieldCheck,
            label: "Verify Data",
            onClick: () => runHealthChecksMutation.mutate(),
          },
        ],
      },
    ];
  }, [
    navigate,
    showSyncAction,
    syncBrokerData,
    updatePortfolioMutation,
    recalculatePortfolioMutation,
    runHealthChecksMutation,
  ]);

  return (
    <ActionPalette
      open={open}
      onOpenChange={setOpen}
      groups={groups}
      trigger={
        <Button variant="secondary" size="icon-xs" className="bg-secondary/50 rounded-full">
          <Icons.DotsThreeVertical className="size-5" weight="fill" />
        </Button>
      }
    />
  );
}
