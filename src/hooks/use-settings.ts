import { useQuery } from "@tanstack/react-query";
import { Settings } from "@/lib/types";
import { getSettings } from "@/commands/settings";
import { QueryKeys } from "@/lib/query-keys";

export function useSettings() {
  return useQuery<Settings, Error>({
    queryKey: [QueryKeys.SETTINGS],
    queryFn: getSettings,
  });
}
