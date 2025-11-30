import { getHoldings } from "@/commands/portfolio";
import { useAccounts } from "@/hooks/use-accounts";
import { useDividendAdjustedHoldings } from "@/hooks/use-dividend-adjusted-holdings";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { QueryKeys } from "@/lib/query-keys";
import { Account, Holding, HoldingType } from "@/lib/types";
import { HoldingsTable } from "@/pages/holdings/components/holdings-table";
import { HoldingsTableMobile } from "@/pages/holdings/components/holdings-table-mobile";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyPlaceholder, Icons } from "@wealthvn/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

interface AccountHoldingsProps {
  accountId: string;
  showEmptyState?: boolean;
}

const AccountHoldings = ({ accountId, showEmptyState = true }: AccountHoldingsProps) => {
  const { t } = useTranslation(["accounts"]);
  const isMobile = useIsMobileViewport();
  const navigate = useNavigate();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const { data: holdings, isLoading } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS, accountId],
    queryFn: () => getHoldings(accountId),
  });

  const { adjustedHoldings } = useDividendAdjustedHoldings(holdings ?? undefined);

  const { accounts } = useAccounts();

  const selectedAccount = useMemo(() => {
    return accounts?.find((acc) => acc.id === accountId) ?? null;
  }, [accounts, accountId]);

  const dummyAccounts = useMemo(() => {
    return selectedAccount ? [selectedAccount] : [];
  }, [selectedAccount]);

  if (!isLoading && !adjustedHoldings?.length) {
    return null;
  }

  const filteredHoldings = adjustedHoldings?.filter((holding) => holding.holdingType !== HoldingType.CASH);

  // Show loading state while data is being fetched
  if (isLoading) {
    return null;
  }

  // Show empty state when there are no holdings
  if (!filteredHoldings || filteredHoldings.length === 0) {
    if (!showEmptyState) {
      return null;
    }

    return (
      <div className="flex items-center justify-center py-16">
        <EmptyPlaceholder
          icon={<Icons.TrendingUp className="text-muted-foreground h-10 w-10" />}
          title="No holdings yet"
          description="Get started by adding your first transaction or quickly import your existing holdings from a CSV file."
        >
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button
              size="default"
              onClick={() =>
                navigate(
                  `/activities/manage?account=${accountId}&redirect-to=/accounts/${accountId}`,
                )
              }
            >
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add Transaction
            </Button>
            <Button
              size="default"
              variant="outline"
              onClick={() => navigate(`/import?account=${accountId}`)}
            >
              <Icons.Import className="mr-2 h-4 w-4" />
              Import from CSV
            </Button>
          </div>
        </EmptyPlaceholder>
      </div>
    );
  }

  const handleAccountChange = (_account: Account) => {
    // No-op for account page since we're already on a specific account
  };

  return (
    <div>
      <h3 className="py-4 text-lg font-bold">{t("holdings.title")}</h3>
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
