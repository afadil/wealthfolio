// SyncStatusBadge
// Shows the current sync/trust state in a compact badge
// =====================================================

import { Badge, Icons } from "@wealthfolio/ui";
import { useSync } from "../providers/sync-provider";

export function SyncStatusBadge() {
  const { state } = useSync();

  if (state.isLoading) {
    return (
      <Badge variant="outline" className="gap-1">
        <Icons.Spinner className="h-3 w-3 animate-spin" />
        Loading
      </Badge>
    );
  }

  if (!state.syncStatus?.e2eeEnabled) {
    return (
      <Badge variant="outline" className="gap-1">
        <Icons.ShieldOff className="h-3 w-3" />
        Sync Off
      </Badge>
    );
  }

  if (state.trustState === "trusted") {
    return (
      <Badge variant="success" className="gap-1">
        <Icons.ShieldCheck className="h-3 w-3" />
        Syncing
      </Badge>
    );
  }

  return (
    <Badge variant="warning" className="gap-1">
      <Icons.ShieldAlert className="h-3 w-3" />
      Pairing Required
    </Badge>
  );
}
