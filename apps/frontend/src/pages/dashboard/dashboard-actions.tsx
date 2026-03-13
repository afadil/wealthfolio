import { ActionPalette, type ActionPaletteGroup } from "@/components/action-palette";
import { syncService } from "@/features/devices-sync";
import { useSyncStatus } from "@/features/devices-sync/hooks";
import { SyncStates } from "@/features/devices-sync/types";
import { useSyncBrokerData } from "@/features/wealthfolio-connect/hooks";
import { hasBrokerSync } from "@/features/wealthfolio-connect";
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

interface DashboardActionsProps {
  onAddAsset?: () => void;
  onAddLiability?: () => void;
}

export function DashboardActions({ onAddAsset, onAddLiability }: DashboardActionsProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Portfolio update mutations
  const updatePortfolioMutation = useUpdatePortfolioMutation();
  const recalculatePortfolioMutation = useRecalculatePortfolioMutation();
  const runHealthChecksMutation = useRunHealthChecks({ navigate });

  // Wealthfolio Connect sync
  const { isEnabled, isConnected, userInfo } = useWealthfolioConnect();
  const { mutate: syncBrokerData } = useSyncBrokerData();
  const showSyncAction = isEnabled && isConnected && hasBrokerSync(userInfo);

  // Device sync
  const { syncState } = useSyncStatus();
  const showDeviceSyncAction = syncState === SyncStates.READY;

  const groups = useMemo((): ActionPaletteGroup[] => {
    const primaryActions =
      onAddAsset && onAddLiability
        ? [
            {
              icon: Icons.Plus,
              label: "Add Asset",
              onClick: onAddAsset,
            },
            {
              icon: Icons.Plus,
              label: "Add Liability",
              onClick: onAddLiability,
            },
          ]
        : [
            {
              icon: Icons.Plus,
              label: "Record Transaction",
              onClick: () => navigate("/activities/manage"),
            },
          ];

    return [
      {
        items: [
          ...primaryActions,
          ...(showSyncAction
            ? [
                {
                  icon: Icons.Download,
                  label: "Sync Broker Accounts",
                  onClick: () => syncBrokerData(),
                },
              ]
            : []),
          ...(showDeviceSyncAction
            ? [
                {
                  icon: Icons.CloudSync,
                  label: "Sync Devices",
                  onClick: () => void syncService.triggerSyncCycle(),
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
    onAddAsset,
    onAddLiability,
    showSyncAction,
    showDeviceSyncAction,
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
