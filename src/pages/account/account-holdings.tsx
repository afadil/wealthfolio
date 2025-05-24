import { Holding, HoldingType } from '@/lib/types';
import { getHoldings } from '@/commands/portfolio';
import { QueryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { HoldingsTable } from '@/pages/holdings/components/holdings-table';

const AccountHoldings = ({ accountId }: { accountId: string }) => {
  const { data: holdings, isLoading } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS, accountId],
    queryFn: () => getHoldings(accountId),
  });

  if (!isLoading && !holdings?.length) {
    return null;
  }

  const filteredHoldings = holdings?.filter((holding) => holding.holdingType !== HoldingType.CASH);

  if (!isLoading && !filteredHoldings?.length) {
    return null;
  }

  return (
    <div>
      <h3 className="py-4 text-lg font-bold">Holdings</h3>
      <HoldingsTable holdings={filteredHoldings ?? []} isLoading={isLoading} />
    </div>
  );
};

export default AccountHoldings;
