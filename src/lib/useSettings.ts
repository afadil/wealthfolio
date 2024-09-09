import { useQuery } from '@tanstack/react-query';
import { Settings } from './types';
import { getSettings } from '@/commands/setting';

export function useSettings() {
  return useQuery<Settings, Error>({
    queryKey: ['settings'],
    queryFn: getSettings,
  });
}
