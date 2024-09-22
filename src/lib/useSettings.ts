import { useQuery } from '@tanstack/react-query';
import { Settings } from './types';
import { getSettings } from '@/commands/settings';
import { QueryKeys } from './query-keys';

export function useSettings() {
  return useQuery<Settings, Error>({
    queryKey: [QueryKeys.SETTINGS],
    queryFn: getSettings,
  });
}
