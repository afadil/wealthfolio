import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Separator, Skeleton } from "@wealthfolio/ui";
import { useAccounts } from "@/hooks/use-accounts";
import { getPortfolioTargets, updatePortfolioTarget } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import type { PortfolioTarget, RebalanceMode } from "@/lib/types";
import { SettingsHeader } from "../settings-header";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function ModeSelector({
  target,
  onUpdate,
  isPending,
}: {
  target: PortfolioTarget;
  onUpdate: (target: PortfolioTarget, mode: RebalanceMode) => void;
  isPending: boolean;
}) {
  const current = target.rebalanceMode ?? "buy_only";

  return (
    <div className="flex gap-2">
      {(["buy_only", "buy_and_sell"] as RebalanceMode[]).map((mode) => (
        <button
          key={mode}
          disabled={isPending}
          onClick={() => current !== mode && onUpdate(target, mode)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            current === mode
              ? "bg-foreground text-background border-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {mode === "buy_only" ? "Buy only" : "Buy & Sell"}
        </button>
      ))}
    </div>
  );
}

export default function AllocationStrategyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { accounts, isLoading: accountsLoading } = useAccounts();

  // Fetch targets for all accounts + the global portfolio
  const accountIds = [PORTFOLIO_ACCOUNT_ID, ...(accounts?.map((a) => a.id) ?? [])];
  const targetQueries = useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: [QueryKeys.PORTFOLIO_TARGETS, accountId],
      queryFn: () => getPortfolioTargets(accountId),
      staleTime: 30000,
      enabled: !accountsLoading,
    })),
  });

  const targetsLoading = targetQueries.some((q) => q.isLoading);
  const allTargets: PortfolioTarget[] = targetQueries.flatMap((q) => q.data ?? []);

  const updateMutation = useMutation({
    mutationFn: updatePortfolioTarget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO_TARGETS] });
      toast.success("Strategy updated.");
    },
    onError: () => toast.error("Failed to update strategy."),
  });

  const handleUpdate = (target: PortfolioTarget, mode: RebalanceMode) => {
    updateMutation.mutate({ ...target, rebalanceMode: mode });
  };

  const isLoading = accountsLoading || targetsLoading;

  const getAccountName = (accountId: string) => {
    if (accountId === PORTFOLIO_ACCOUNT_ID) return "All Portfolio";
    return accounts?.find((a) => a.id === accountId)?.name ?? accountId;
  };

  // Active targets indexed by accountId for quick lookup
  const targetByAccountId = new Map(
    allTargets.filter((t) => t.isActive).map((t) => [t.accountId, t]),
  );

  // All rows: global portfolio + each account
  const allRows = [PORTFOLIO_ACCOUNT_ID, ...(accounts?.map((a) => a.id) ?? [])];

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Allocation Strategy"
        text="Choose how rebalancing recommendations are calculated for each target."
      />
      <Separator />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="divide-border divide-y rounded-md border">
          {allRows.map((accountId) => {
            const target = targetByAccountId.get(accountId);
            return (
              <div key={accountId} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className={cn("text-sm font-medium", !target && "text-muted-foreground")}>
                    {getAccountName(accountId)}
                  </p>
                  {target ? (
                    <p className="text-muted-foreground text-xs">{target.name}</p>
                  ) : (
                    <p className="text-muted-foreground text-xs">No allocation target set</p>
                  )}
                </div>
                {target ? (
                  <ModeSelector
                    target={target}
                    onUpdate={handleUpdate}
                    isPending={updateMutation.isPending}
                  />
                ) : (
                  <button
                    onClick={() => {
                      const account = accounts?.find((a) => a.id === accountId) ?? null;
                      if (account) {
                        sessionStorage.setItem(
                          "allocations-selected-account",
                          JSON.stringify(account),
                        );
                      } else {
                        sessionStorage.removeItem("allocations-selected-account");
                      }
                      navigate("/allocations");
                    }}
                    className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                  >
                    Set up targets →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="text-muted-foreground space-y-1 text-xs">
        <p>
          <span className="font-medium">Buy only</span> — Rebalancing suggestions only deploy new
          cash into underweight positions. Overweight positions are left unchanged.
        </p>
        <p>
          <span className="font-medium">Buy &amp; Sell</span> — Rebalancing suggestions may include
          selling overweight positions to fund underweight ones. Consider tax implications before
          selling.
        </p>
      </div>
    </div>
  );
}
