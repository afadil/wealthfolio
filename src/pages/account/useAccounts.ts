import { useQuery } from '@tanstack/react-query';
import { Account } from '@/lib/types';
import { getAccounts } from '@/commands/account';

export function useAccounts() {
  return useQuery<Account[], Error>({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });
}
