import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { getBrokerSyncStates } from "../services/broker-service";
import type { BrokerSyncState } from "../types";

export function useSyncStates(options?: { enabled?: boolean }) {
  return useQuery<BrokerSyncState[], Error>({
    queryKey: [QueryKeys.BROKER_SYNC_STATES],
    queryFn: getBrokerSyncStates,
    staleTime: 30 * 1000, // 30 seconds
    enabled: options?.enabled,
    // No polling - state is refreshed via event-driven invalidation
    // when broker:sync-complete fires (see use-global-event-listener.ts)
  });
}
