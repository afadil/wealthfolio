import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { getBrokerSyncStates } from "../services/broker-service";
import type { BrokerSyncState } from "../types";

export function useSyncStates() {
  return useQuery<BrokerSyncState[], Error>({
    queryKey: [QueryKeys.BROKER_SYNC_STATES],
    queryFn: getBrokerSyncStates,
    staleTime: 30 * 1000, // 30 seconds
    // No polling - state is refreshed via event-driven invalidation
    // when broker:sync-complete fires (see use-global-event-listener.ts)
  });
}
