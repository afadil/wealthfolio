import { getHoldings } from "@/commands/portfolio";
import { useAccounts } from "@/hooks/use-accounts";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { QueryKeys } from "@/lib/query-keys";
import { Account, Holding, HoldingType } from "@/lib/types";
import { HoldingsTable } from "@/pages/holdings/components/holdings-table";
import { HoldingsTableMobile } from "@/pages/holdings/components/holdings-table-mobile";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

const AccountHoldings = ({ accountId }: { accountId: string }) => {
  const isMobile = useIsMobileViewport();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const { data: holdings, isLoading } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS, accountId],
    queryFn: () => getHoldings(accountId),
  });

  const { accounts } = useAccounts();

  const selectedAccount = useMemo(() => {
    return accounts?.find((acc) => acc.id === accountId) ?? null;
  }, [accounts, accountId]);

  const dummyAccounts = useMemo(() => {
    return selectedAccount ? [selectedAccount] : [];
  }, [selectedAccount]);

  if (!isLoading && !holdings?.length) {
    return null;
  }

  const filteredHoldings = holdings?.filter((holding) => holding.holdingType !== HoldingType.CASH);

  if (!isLoading && !filteredHoldings?.length) {
    return null;
  }

  const handleAccountChange = (_account: Account) => {
    // No-op for account page since we're already on a specific account
  };

  return (
    <div>
      <h3 className="py-4 text-lg font-bold">Holdings</h3>
      {isMobile ? (
        <HoldingsTableMobile
          holdings={filteredHoldings ?? []}
          isLoading={isLoading}
          selectedTypes={selectedTypes}
          setSelectedTypes={setSelectedTypes}
          selectedAccount={selectedAccount}
          accounts={dummyAccounts}
          onAccountChange={handleAccountChange}
          showAccountFilter={false}
        />
      ) : (
        <HoldingsTable holdings={filteredHoldings ?? []} isLoading={isLoading} />
      )}
    </div>
  );
};

export default AccountHoldings;
