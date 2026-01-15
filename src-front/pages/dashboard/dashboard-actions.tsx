import { ActionPalette, type ActionPaletteGroup } from "@/components/action-palette";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  useUpdatePortfolioMutation,
  useRecalculatePortfolioMutation,
} from "@/hooks/use-calculate-portfolio";
import { useSyncBrokerData } from "@/features/wealthfolio-connect/hooks";
import { useWealthfolioConnect } from "@/features/wealthfolio-connect/providers/wealthfolio-connect-provider";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

export function DashboardActions() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Portfolio update mutations
  const updatePortfolioMutation = useUpdatePortfolioMutation();
  const recalculatePortfolioMutation = useRecalculatePortfolioMutation();

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
            icon: "Plus",
            label: "Record Transaction",
            onClick: () => navigate("/activities/manage"),
          },
          ...(showSyncAction
            ? [
                {
                  icon: "Download" as const,
                  label: "Sync Broker Accounts",
                  onClick: () => syncBrokerData(),
                },
              ]
            : []),
          {
            icon: "Refresh",
            label: "Update Market Data",
            onClick: () => updatePortfolioMutation.mutate(),
          },
          {
            icon: "History",
            label: "Recalculate Portfolio",
            onClick: () => recalculatePortfolioMutation.mutate(),
          },
        ],
      },
    ];
  }, [navigate, showSyncAction, syncBrokerData, updatePortfolioMutation, recalculatePortfolioMutation]);

  return (
    <ActionPalette
      open={open}
      onOpenChange={setOpen}
      groups={groups}
      trigger={
        <Button variant="secondary" size="icon-xs" className="rounded-full bg-secondary/50">
          <Icons.DotsThreeVertical className="size-5" weight="fill" />
        </Button>
      }
    />
  );
}
