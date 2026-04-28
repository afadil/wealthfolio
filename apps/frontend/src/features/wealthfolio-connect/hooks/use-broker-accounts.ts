import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { listBrokerAccounts } from "../services/broker-service";
import type { BrokerAccount } from "../types";

export function useBrokerAccounts(options?: { enabled?: boolean }) {
  return useQuery<BrokerAccount[], Error>({
    queryKey: [QueryKeys.BROKER_ACCOUNTS],
    queryFn: listBrokerAccounts,
    staleTime: 30 * 1000, // 30 seconds
    enabled: options?.enabled,
  });
}
