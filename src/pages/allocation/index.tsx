import { getHoldings } from "@/commands/portfolio";
import { getRebalancingStrategies, saveRebalancingStrategy } from "@/commands/rebalancing";
import { AccountPortfolioSelector } from "@/components/account-portfolio-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useAccounts } from "@/hooks/use-accounts";
import { usePortfolios } from "@/hooks/use-portfolios";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { formatCurrencyDisplay } from "@/lib/currency-format";
import { QueryKeys } from "@/lib/query-keys";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Account, AccountType, Holding, Portfolio } from "@/lib/types";
import { getOrCreateVirtualStrategy } from "@/lib/virtual-portfolio-helper";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from "@wealthfolio/ui";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AllocationPieChartView } from "./components/allocation-pie-chart-view";
import { AssetClassFormDialog } from "./components/asset-class-form-dialog";
import { AssetClassTargetCard } from "./components/asset-class-target-card";
import { HoldingTargetRow } from "./components/holding-target-row";
import { RebalancingAdvisor } from "./components/rebalancing-advisor";
import { SaveAsPortfolioModal } from "./components/save-as-portfolio-modal";
import { TargetPercentInput } from "./components/target-percent-input";
import {
  useAssetClassMutations,
  useAssetClassTargets,
  useHoldingTargetMutations,
  useHoldingTargets,
  useRebalancingStrategy,
} from "./hooks";
import {
  getAvailableAssetClasses,
  getHoldingDisplayName,
  useCurrentAllocation,
  useHoldingsByAssetClass,
} from "./hooks/use-current-allocation";
import { calculateAutoDistribution } from "./lib/auto-distribution";

type TabType = "targets" | "composition" | "pie-chart" | "rebalancing";

const createPortfolioAccount = (): Account => ({
  id: PORTFOLIO_ACCOUNT_ID,
  name: "All Portfolio",
  accountType: "portfolio" as AccountType,
  balance: 0,
  currency: "USD",
  isDefault: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  isCombinedPortfolio: false,
});

// KEEP existing getAssetClassColor function (for base colors)
/**
 * Get green color based on asset class percentage
 * Higher % = darker green, Lower % = lighter green
 */
function getAssetClassColor(percent: number): string {
  if (percent >= 80) return "bg-green-700 dark:bg-green-600"; // Dark green (80%+)
  if (percent >= 50) return "bg-green-500 dark:bg-green-600"; // Dark green (50-79%)
  if (percent >= 30) return "bg-green-400 dark:bg-green-500"; // Medium green (30-49%)
  if (percent >= 20) return "bg-green-300 dark:bg-green-400"; // Light green (20-29%)
  return "bg-green-300 dark:bg-green-200"; // Very light green (<20%)
}

// KEEP existing getSubClassColor (orange tones)
const getSubClassColor = (percent: number): string => {
  if (percent >= 50) return "bg-orange-500";
  if (percent >= 30) return "bg-orange-400";
  if (percent >= 15) return "bg-amber-400";
  return "bg-yellow-400";
};

// Helper component for rendering holdings with targets
function HoldingsTargetList({
  assetClassId,
  allHoldings,
  displayHoldings,
  assetClassValue,
  sharedPendingEdits,
  onSharedPendingChange,
}: {
  assetClassId: string;
  allHoldings: Holding[]; // All holdings in asset class for auto-distribution
  displayHoldings: Holding[]; // Holdings to display (filtered by sub-class)
  assetClassValue: number;
  sharedPendingEdits: Map<string, number>;
  onSharedPendingChange: (edits: Map<string, number>) => void;
}) {
  const navigate = useNavigate();
  const { data: holdingTargets = [] } = useHoldingTargets(assetClassId);
  const { deleteTargetMutation, toggleLockMutation } = useHoldingTargetMutations();

  // Only run auto-distribution if user has set at least one target
  const hasAnyTargets = holdingTargets.length > 0 || sharedPendingEdits.size > 0;

  // Calculate distribution across ALL holdings in asset class
  const distribution = hasAnyTargets
    ? calculateAutoDistribution(allHoldings, holdingTargets, sharedPendingEdits, assetClassValue)
    : {
        holdings: allHoldings
          .map((holding) => ({
            assetId: holding.instrument?.id || "",
            symbol: holding.instrument?.symbol || "",
            displayName: holding.instrument?.name || holding.instrument?.symbol || "Unknown",
            currentValue: holding.marketValue?.base || 0,
            currentPercent:
              assetClassValue > 0 ? ((holding.marketValue?.base || 0) / assetClassValue) * 100 : 0,
            targetPercent: 0,
            isUserSet: false,
            isLocked: false,
          }))
          .sort((a, b) => b.currentValue - a.currentValue),
        totalUserSet: 0,
        remainder: 100,
      };

  const handlePendingChange = (assetId: string, percent: number | null) => {
    const newMap = new Map(sharedPendingEdits);
    if (percent === null) {
      newMap.delete(assetId);
    } else {
      newMap.set(assetId, percent);
    }
    onSharedPendingChange(newMap);

    // Trigger re-calculation of auto-distribution with new pending edits
    // This ensures that when a user sets one target, others adjust automatically
    // The parent component will re-render with updated distribution
  };

  const pendingValue = (assetId: string) => sharedPendingEdits.get(assetId);

  // Filter distribution to only show holdings from this sub-class
  const displayHoldingIds = new Set(displayHoldings.map((h) => h.instrument?.id));
  const filteredDistribution = distribution.holdings.filter((h) =>
    displayHoldingIds.has(h.assetId),
  );

  return (
    <>
      {filteredDistribution.map((holdingData) => {
        const holding = displayHoldings.find((h) => h.instrument?.id === holdingData.assetId);
        if (!holding) return null;

        const target = holdingTargets.find((t) => t.assetId === holdingData.assetId);
        const pending = pendingValue(holdingData.assetId);

        return (
          <HoldingTargetRow
            key={holding.id}
            holding={{
              id: holding.id,
              symbol: holdingData.symbol,
              displayName: holdingData.displayName,
              currentPercent: holdingData.currentPercent,
              currentValue: holdingData.currentValue,
            }}
            target={target}
            previewPercent={
              // Show preview for auto-distributed holdings (not user-set in current session)
              // This includes holdings with saved targets that aren't locked and have no pending edit
              holdingData.isUserSet ? undefined : holdingData.targetPercent
            }
            pendingPercent={pending}
            assetClassId={assetClassId}
            isLocked={holdingData.isLocked ?? false}
            onPendingChange={(percent) => handlePendingChange(holdingData.assetId, percent)}
            onToggleLock={() => {
              if (target) {
                toggleLockMutation.mutate({
                  id: target.id,
                  assetClassId,
                  holdingName: holdingData.displayName,
                });
              }
            }}
            onDelete={() => {
              if (target) {
                deleteTargetMutation.mutate({ id: target.id, assetClassId });
              }
              // Clear pending edit if exists
              handlePendingChange(holdingData.assetId, null);
            }}
            onNavigate={() => {
              if (holding.instrument?.symbol) {
                navigate(`/holdings/${holding.instrument.symbol}`);
              }
            }}
          />
        );
      })}
    </>
  );
}

export default function AllocationPage() {
  const { accounts } = useAccounts(false, false);
  const { data: portfolios = [] } = usePortfolios();
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([PORTFOLIO_ACCOUNT_ID]);
  // const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null); // TODO: Will be used for portfolio-specific allocation strategies
  const [formOpen, setFormOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<TabType>("pie-chart");
  const [showAssetDetails, setShowAssetDetails] = useState(false);
  const [selectedAssetClass, setSelectedAssetClass] = useState<string | null>(null);
  const [assetClassPendingEdits, setAssetClassPendingEdits] = useState<Map<string, number>>(
    new Map(),
  );
  const [assetClassLockStates, setAssetClassLockStates] = useState<Map<string, boolean>>(new Map());
  const [isSavingAllTargets, setIsSavingAllTargets] = useState(false);
  const [showHiddenTargets, setShowHiddenTargets] = useState(false);
  // Removed combinedPortfolio - now using virtual strategies instead
  const [showSaveAsPortfolioModal, setShowSaveAsPortfolioModal] = useState(false);
  const lastToastPortfolioId = useRef<string>("");
  const queryClient = useQueryClient();
  const { settings } = useSettingsContext(); // ← NEW: Get base currency

  // Derive selectedAccounts from selectedAccountIds
  const selectedAccounts = useMemo(() => {
    if (selectedAccountIds.includes(PORTFOLIO_ACCOUNT_ID)) {
      return [createPortfolioAccount()];
    }
    return accounts?.filter((acc) => selectedAccountIds.includes(acc.id)) ?? [];
  }, [selectedAccountIds, accounts]);

  // Use the first selected account for strategy-based features
  // In multi-select mode, we create/use a combined portfolio account for strategies
  const primaryAccount = selectedAccounts[0] ?? null;
  const baseCurrency = settings?.baseCurrency || "USD"; // ← NEW: Default to USD

  // Check if multiple accounts are selected
  const isMultiAccountView = selectedAccounts.length > 1;

  // NEW: Virtual strategy state for multi-account selections
  const [virtualStrategy, setVirtualStrategy] = useState<any>(null);

  // Determine which account ID to use for strategies
  // - If single account: use that account's ID
  // - If multi-account: use virtual strategy ID (wait for it to be created)
  // - If "All Portfolio": use PORTFOLIO_ACCOUNT_ID
  const selectedAccountId = isMultiAccountView
    ? (virtualStrategy?.id ?? null) // Multi-account: only use virtual strategy, don't fall back
    : (primaryAccount?.id ?? PORTFOLIO_ACCOUNT_ID); // Single account: use account ID

  // Removed old combined portfolio logic - now handled by virtual strategies in ensureStrategy effect

  // Track accounts for which we've already created strategies
  const createdStrategies = useRef<Set<string>>(new Set());

  // Auto-create strategy for account or virtual portfolio
  useEffect(() => {
    const ensureStrategy = async () => {
      // Skip for "All Portfolio" view
      if (selectedAccountIds.includes(PORTFOLIO_ACCOUNT_ID)) {
        setVirtualStrategy(null);
        return;
      }

      // CASE 1: Multiple accounts selected (not a saved portfolio)
      if (isMultiAccountView && selectedAccounts.length > 1) {
        try {
          const strategy = await getOrCreateVirtualStrategy(selectedAccounts);
          setVirtualStrategy(strategy);
          console.log("Using virtual strategy:", strategy);
        } catch (err) {
          console.error("Failed to create virtual strategy:", err);
        }
        return;
      }

      // CASE 2: Single account selected
      setVirtualStrategy(null);

      if (!primaryAccount?.id) {
        return;
      }

      const accountId = primaryAccount.id;

      // Skip if we've already created/checked this account
      if (createdStrategies.current.has(accountId)) {
        return;
      }

      try {
        const strategies = await getRebalancingStrategies();
        const exists = strategies.some((s) => s.accountId === accountId);

        if (!exists) {
          console.log("Creating strategy for account:", accountId, primaryAccount.name);
          await saveRebalancingStrategy({
            name: `${primaryAccount.name} Allocation Strategy`,
            accountId: accountId,
            isActive: true,
          } as any);
          // Mark as created to prevent recreation
          createdStrategies.current.add(accountId);
          // Invalidate to refetch the new strategy
          queryClient.invalidateQueries({
            queryKey: [QueryKeys.REBALANCING_STRATEGIES, accountId],
          });
        } else {
          // Mark as checked even if it already exists
          createdStrategies.current.add(accountId);
        }
      } catch (err) {
        console.error("Failed to ensure strategy:", err);
      }
    };

    ensureStrategy();
  }, [selectedAccountIds, isMultiAccountView, primaryAccount, queryClient]);
  // Note: selectedAccounts intentionally omitted - it's derived from selectedAccountIds
  // Including it causes infinite loop because it's a new array reference each render

  // Auto-match portfolio detection and toast notification
  useEffect(() => {
    if (
      !portfolios ||
      selectedAccountIds.length === 0 ||
      selectedAccountIds.includes(PORTFOLIO_ACCOUNT_ID)
    ) {
      lastToastPortfolioId.current = "";
      return;
    }

    // Check if current selection matches any portfolio (order-independent)
    const matchedPortfolio = portfolios.find((portfolio: Portfolio) => {
      const portfolioSet = new Set(portfolio.accountIds);
      const selectedSet = new Set(selectedAccountIds);

      if (portfolioSet.size !== selectedSet.size) return false;

      for (const id of selectedSet) {
        if (!portfolioSet.has(id)) return false;
      }

      return true;
    });

    // Show toast only once per matched portfolio
    if (matchedPortfolio) {
      if (lastToastPortfolioId.current !== matchedPortfolio.id) {
        toast({
          title: `✓ Matched Portfolio "${matchedPortfolio.name}"`,
          description: "Loading allocation targets...",
          variant: "success",
        });
        lastToastPortfolioId.current = matchedPortfolio.id;
      }
    } else {
      lastToastPortfolioId.current = "";
    }
  }, [selectedAccountIds, portfolios]);

  // React Query automatically refetches when selectedAccountId changes via queryKey
  // No need for manual invalidation here
  const { data: targets = [] } = useAssetClassTargets(selectedAccountId);

  // Fetch holdings for all selected accounts and aggregate
  const accountIds = selectedAccounts.map((acc) => acc.id);
  const holdingsQueries = useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: [QueryKeys.HOLDINGS, accountId],
      queryFn: async () => {
        if (!accountId) return [];
        return getHoldings(accountId);
      },
      enabled: !!accountId,
    })),
  });

  // Aggregate holdings from all selected accounts
  const allHoldings = holdingsQueries.flatMap((query) => query.data || []);
  const holdings = allHoldings;
  const holdingsLoading = holdingsQueries.some((query) => query.isLoading);

  // NEW: Get available asset classes from holdings
  const availableAssetClasses = getAvailableAssetClasses(holdings);

  const { saveTargetMutation, deleteTargetMutation } = useAssetClassMutations();
  const { saveTargetMutation: saveHoldingTargetMutation } = useHoldingTargetMutations();
  const { data: strategy } = useRebalancingStrategy(selectedAccountId);

  // NEW: Get current allocation breakdown (Tier 1: by asset class)
  const { currentAllocation } = useCurrentAllocation(holdings);

  // Calculate composition (target vs actual)
  const composition = useHoldingsByAssetClass(targets, holdings);

  // Calculate total allocated from composition only (excludes orphaned targets without holdings)
  const totalAllocated = composition.reduce((sum, comp) => {
    const target = targets.find((t) => t.assetClass === comp.assetClass);
    return sum + (target?.targetPercent || 0);
  }, 0);

  const isMutating = saveTargetMutation.isPending || deleteTargetMutation.isPending;

  const handleOpenForm = (assetClass?: string) => {
    if (assetClass) {
      setEditingTarget(assetClass);
    } else {
      setEditingTarget(null);
    }
    setFormOpen(true);
  };

  const handleFormSubmit = async (formData: { assetClass: string; targetPercent: number }) => {
    if (!strategy?.id) {
      console.error("No strategy ID available");
      return;
    }

    // Validate input
    const validPercent = Math.max(0, Math.min(100, formData.targetPercent));

    const existingTarget = editingTarget
      ? targets.find((t) => t.assetClass === editingTarget)
      : null;

    // Calculate current total (excluding the target being edited if editing)
    const currentTotalInt = Math.round(targets.reduce((sum, t) => sum + t.targetPercent, 0) * 100);
    const editingAmountInt = Math.round((existingTarget?.targetPercent || 0) * 100);
    const newAmountInt = Math.round(validPercent * 100);
    const totalIfSavedInt = currentTotalInt - editingAmountInt + newAmountInt;

    // Check if we're over 100% and need to auto-scale
    if (totalIfSavedInt > 10000) {
      // User is creating a new target or increasing existing one beyond 100%
      // Auto-scale existing targets proportionally
      const availableSpaceInt = 10000 - newAmountInt;
      const otherTargetsInt = currentTotalInt - editingAmountInt;

      if (otherTargetsInt > 0) {
        const scaleFactor = availableSpaceInt / otherTargetsInt;

        // Update all OTHER targets (not including the one being saved) with scaled percentages
        const targetsToUpdate = targets
          .filter((t) => {
            if (editingTarget) {
              // If editing, exclude the edited target
              return t.assetClass !== editingTarget;
            }
            // If creating new, update all existing targets
            return true;
          })
          .map((t) => ({
            ...t,
            targetPercent: Math.max(0, t.targetPercent * scaleFactor),
          }));

        // Save all scaled targets
        for (const target of targetsToUpdate) {
          await saveTargetMutation.mutateAsync({
            id: target.id,
            strategyId: strategy.id,
            assetClass: target.assetClass,
            targetPercent: target.targetPercent,
            isLocked: target.isLocked || false,
          });
        }
      }
    }

    // Save the new/edited target
    const payload = {
      ...(existingTarget?.id && { id: existingTarget.id }),
      strategyId: strategy.id,
      assetClass: formData.assetClass,
      targetPercent: validPercent,
      isLocked: existingTarget?.isLocked || false,
    };

    console.log("Form submit payload:", payload);

    await saveTargetMutation.mutateAsync(payload);

    // Clear editing state on success
    setEditingTarget(null);
    setFormOpen(false);

    // Force refresh of targets to sync card display
    queryClient.invalidateQueries({
      queryKey: [QueryKeys.ASSET_CLASS_TARGETS, selectedAccountId],
    });
  };

  const handleDelete = async (assetClass: string) => {
    const targetToDelete = targets.find((t) => t.assetClass === assetClass);

    if (targetToDelete) {
      // First, delete the target
      await deleteTargetMutation.mutateAsync(targetToDelete.id);

      // Calculate remaining targets after deletion
      const remainingTargets = targets.filter((t) => t.assetClass !== assetClass);
      const remainingTotalInt = Math.round(
        remainingTargets.reduce((sum, t) => sum + t.targetPercent, 0) * 100,
      );

      // If remaining targets exist and don't total 100%, scale them proportionally
      if (remainingTargets.length > 0 && remainingTotalInt > 0 && remainingTotalInt !== 10000) {
        const scaleFactor = 10000 / remainingTotalInt; // Scale to exactly 100%

        // Update all remaining targets with scaled percentages
        for (const target of remainingTargets) {
          const scaledPercent = target.targetPercent * scaleFactor;
          await saveTargetMutation.mutateAsync({
            id: target.id,
            strategyId: strategy?.id!,
            assetClass: target.assetClass,
            targetPercent: scaledPercent,
            isLocked: target.isLocked || false,
          });
        }
      }

      // Force refresh of targets after all updates complete
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.ASSET_CLASS_TARGETS, selectedAccountId],
      });
    }
  };

  // Composition tab holdings display
  const renderHoldingName = (holding: Holding): string => {
    // For cash holdings in specific account, use account name
    // Check if holding has no instrument (indicates cash holding)
    if (!holding.instrument && primaryAccount?.id !== PORTFOLIO_ACCOUNT_ID) {
      return getHoldingDisplayName(holding, primaryAccount?.name);
    }
    // For portfolio view or non-cash, use standard logic
    // In portfolio view, find account by holding.accountId from available data
    const holdingAccount = holdings.find((h) => h.accountId === holding.accountId)?.accountId;
    return getHoldingDisplayName(holding, holdingAccount ? primaryAccount?.name : undefined);
  };

  // Format currency helper (use throughout)
  const formatCurrency = (value: number): string => {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: baseCurrency,
    });
  };

  // Calculate total percentage for validation (used in UI)
  const totalPercentageValidation = useMemo(() => {
    if (!selectedAssetClass || assetClassPendingEdits.size === 0) {
      return { total: 100, isValid: true, error: null };
    }

    const assetClassData = currentAllocation.assetClasses.find(
      (ac) => ac.assetClass === selectedAssetClass,
    );
    if (!assetClassData) {
      return { total: 100, isValid: true, error: null };
    }

    const assetClassTarget = targets.find((t) => t.assetClass === selectedAssetClass);
    if (!assetClassTarget) {
      return { total: 100, isValid: true, error: null };
    }

    // Get all holdings in asset class
    const allHoldings = assetClassData.subClasses.flatMap((sc) => sc.holdings || []);
    const assetClassValue = assetClassData.currentValue;

    // Get holding targets for this asset class from cache
    const holdingTargets =
      (queryClient.getQueryData([QueryKeys.HOLDING_TARGETS, assetClassTarget.id]) as any[]) || [];

    // Calculate distribution with current pending edits
    const hasAnyTargets = holdingTargets.length > 0 || assetClassPendingEdits.size > 0;
    if (!hasAnyTargets) {
      return { total: 100, isValid: true, error: null };
    }

    const distribution = calculateAutoDistribution(
      allHoldings,
      holdingTargets,
      assetClassPendingEdits,
      assetClassValue,
    );

    // Calculate total percentage
    const totalPercent = distribution.holdings.reduce((sum, h) => sum + (h.targetPercent || 0), 0);

    const isValid = Math.abs(totalPercent - 100) <= 0.01;
    const error = isValid
      ? null
      : `Total must equal 100%. Current total: ${totalPercent.toFixed(1)}%`;

    return { total: totalPercent, isValid, error };
  }, [selectedAssetClass, assetClassPendingEdits, currentAllocation, targets, queryClient]);

  // Handle save all targets for selected asset class
  const handleSaveAllTargets = async () => {
    if (!selectedAssetClass) return;

    setIsSavingAllTargets(true);
    try {
      const assetClassData = currentAllocation.assetClasses.find(
        (ac) => ac.assetClass === selectedAssetClass,
      );
      if (!assetClassData) return;

      // Find the asset class target ID (needed for foreign key)
      const assetClassTarget = targets.find((t) => t.assetClass === selectedAssetClass);
      if (!assetClassTarget) {
        toast({
          title: "Error",
          description: `No allocation target found for ${selectedAssetClass}. Please create one first.`,
          variant: "destructive",
        });
        setIsSavingAllTargets(false);
        return;
      }

      // Get all holdings in asset class
      const allHoldings = assetClassData.subClasses.flatMap((sc) => sc.holdings || []);
      const assetClassValue = assetClassData.currentValue;

      // Get holding targets for this asset class
      const holdingTargets = (await queryClient.fetchQuery({
        queryKey: [QueryKeys.HOLDING_TARGETS, assetClassTarget.id],
      })) as any[];

      // Calculate final distribution
      const hasAnyTargets = holdingTargets.length > 0 || assetClassPendingEdits.size > 0;
      const distribution = hasAnyTargets
        ? calculateAutoDistribution(
            allHoldings,
            holdingTargets,
            assetClassPendingEdits,
            assetClassValue,
          )
        : { holdings: [] };

      // Validate total percentage
      const totalPercent = distribution.holdings.reduce(
        (sum, h) => sum + (h.targetPercent || 0),
        0,
      );

      if (Math.abs(totalPercent - 100) > 0.01) {
        toast({
          title: "Invalid Allocation",
          description: `Total must equal 100%. Current total: ${totalPercent.toFixed(1)}%`,
          variant: "destructive",
        });
        setIsSavingAllTargets(false);
        return;
      }

      // Save all holdings with targets
      const savePromises = distribution.holdings
        .filter((h) => h.targetPercent !== undefined && h.targetPercent > 0)
        .map(async (h) => {
          const existingTarget = holdingTargets.find((t: any) => t.assetId === h.assetId);
          return saveHoldingTargetMutation.mutateAsync({
            id: existingTarget?.id,
            assetClassId: assetClassTarget.id, // Use the asset class target ID, not the name
            assetId: h.assetId,
            targetPercentOfClass: h.targetPercent!,
            isLocked: h.isLocked ?? false,
          });
        });

      await Promise.all(savePromises);

      // Clear pending edits
      setAssetClassPendingEdits(new Map());

      // Show success message
      const autoCount = distribution.holdings.filter(
        (h) => !h.isUserSet && h.targetPercent! > 0,
      ).length;
      const userCount = distribution.holdings.filter(
        (h) => h.isUserSet && h.targetPercent! > 0,
      ).length;

      toast({
        title: "Success",
        description: `Saved ${userCount} user-set target${userCount !== 1 ? "s" : ""}${
          autoCount > 0
            ? ` and ${autoCount} auto-distributed target${autoCount !== 1 ? "s" : ""}`
            : ""
        }`,
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.HOLDING_TARGETS, assetClassTarget.id],
      });
    } catch (error) {
      console.error("Failed to save all targets:", error);
      toast({
        title: "Error",
        description: "Failed to save targets. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAllTargets(false);
    }
  };

  // Helper: Check if selection has no exact match and has 2+ accounts
  // Find the exact matching portfolio (if any)
  const exactMatchingPortfolio = useMemo(() => {
    if (selectedAccountIds.length < 2 || selectedAccountIds.includes(PORTFOLIO_ACCOUNT_ID)) {
      return null;
    }

    const selectedSet = new Set(selectedAccountIds);
    return (
      portfolios.find((portfolio: Portfolio) => {
        const portfolioSet = new Set(portfolio.accountIds);
        if (portfolioSet.size !== selectedSet.size) return false;
        for (const id of selectedSet) {
          if (!portfolioSet.has(id)) return false;
        }
        return true;
      }) || null
    );
  }, [selectedAccountIds, portfolios]);

  return (
    <div className="space-y-6 p-8">
      {/* Account/Portfolio Selector - Fixed position in top right corner */}
      <div className="pointer-events-auto fixed top-4 right-2 z-20 hidden md:block lg:right-4">
        <AccountPortfolioSelector
          selectedAccountIds={selectedAccountIds}
          onAccountsChange={setSelectedAccountIds}
          className="h-9"
        />
      </div>

      {/* Account/Portfolio Selector - Mobile */}
      <div className="mb-4 flex justify-end md:hidden">
        <AccountPortfolioSelector
          selectedAccountIds={selectedAccountIds}
          onAccountsChange={setSelectedAccountIds}
          className="h-9"
        />
      </div>

      {/* Tabs - Navigation Pills style */}
      <nav className="bg-muted/60 inline-flex items-center rounded-lg p-1">
        {[
          { id: "targets", label: "Targets" },
          { id: "composition", label: "Composition" },
          { id: "pie-chart", label: "Allocation Overview" },
          { id: "rebalancing", label: "Rebalancing Suggestions" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setViewTab(tab.id as TabType)}
            className={`focus-visible:ring-ring relative flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none ${
              viewTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
            aria-current={viewTab === tab.id ? "page" : undefined}
          >
            {viewTab === tab.id && (
              <div className="bg-background absolute inset-0 rounded-md shadow-sm" />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Banners - Portfolio-related notifications */}
      <div className="space-y-3">
        {/* Single Portfolio Banner - Shows either exact match or save option */}
        {selectedAccountIds.length >= 2 &&
          !selectedAccountIds.includes(PORTFOLIO_ACCOUNT_ID) &&
          (exactMatchingPortfolio ? (
            // Show portfolio composition when exact match found
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-blue-600 dark:text-blue-400">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {exactMatchingPortfolio.name}
                  </p>
                  <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                    Includes:{" "}
                    {selectedAccountIds
                      .map((id) => accounts?.find((a) => a.id === id)?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // Show save as portfolio option when no exact match
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-1 items-start gap-3">
                  <div className="mt-0.5 text-blue-600 dark:text-blue-400">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                      <path
                        fillRule="evenodd"
                        d="M4 5a2 2 0 012-2 1 1 0 000 2 1 1 0 100 2H3a1 1 0 00-1 1v6a1 1 0 001 1h14a1 1 0 001-1V9a1 1 0 00-1-1h-3a1 1 0 100-2 1 1 0 000-2 2 2 0 00-2-2H4zm4 0a1 1 0 000 2h2a1 1 0 000-2H8zm6 11a1 1 0 110 2 1 1 0 010-2z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Viewing {selectedAccountIds.length} accounts
                    </p>
                    <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                      Save this selection as a portfolio for quick access later.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSaveAsPortfolioModal(true)}
                  className="shrink-0"
                >
                  Save as Portfolio
                </Button>
              </div>
            </div>
          ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {/* Loading indicator for combined portfolio */}
        {false && (
          <div className="border-muted bg-muted/30 mb-4 rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="border-muted-foreground h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
              <p className="text-muted-foreground text-sm">Setting up combined portfolio view...</p>
            </div>
          </div>
        )}

        {viewTab === "targets" && (
          <div className="space-y-4">
            {/* Header with Action Button */}
            <div className="flex items-center justify-between">
              <Button
                onClick={() => handleOpenForm()}
                disabled={isMutating || availableAssetClasses.length === 0}
                size="sm"
              >
                + Add Target
              </Button>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Allocated:</span>{" "}
                  <span className="font-semibold">{totalAllocated.toFixed(1)}%</span>
                </div>
                <div
                  className={
                    totalAllocated > 100
                      ? "text-red-600 dark:text-red-400"
                      : "text-green-600 dark:text-green-400"
                  }
                >
                  <span className="text-muted-foreground">Remaining:</span>{" "}
                  <span className="font-semibold">{(100 - totalAllocated).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Target Cards Grid - FULL WIDTH WITH SLIDERS */}
            <div className="grid grid-cols-1 gap-4">
              {composition.map((comp) => {
                const target = targets.find((t) => t.assetClass === comp.assetClass);
                return (
                  <AssetClassTargetCard
                    key={comp.assetClass}
                    composition={comp}
                    targetPercent={target?.targetPercent || 0}
                    allTargets={targets}
                    allLockStates={assetClassLockStates}
                    isLocked={target?.isLocked || false}
                    onEdit={() => handleOpenForm(comp.assetClass)}
                    onDelete={() => handleDelete(comp.assetClass)}
                    onToggleLock={async () => {
                      if (!strategy?.id) return;
                      const existingTarget = targets.find((t) => t.assetClass === comp.assetClass);
                      if (existingTarget) {
                        const newLockState = !existingTarget.isLocked;
                        // Update local lock state map immediately
                        const newMap = new Map(assetClassLockStates);
                        newMap.set(comp.assetClass, newLockState);
                        setAssetClassLockStates(newMap);

                        await saveTargetMutation.mutateAsync({
                          id: existingTarget.id,
                          strategyId: strategy.id,
                          assetClass: comp.assetClass,
                          targetPercent: existingTarget.targetPercent,
                          isLocked: newLockState,
                        });
                      }
                    }}
                    onTargetChange={async (newPercent) => {
                      if (!strategy?.id) return;
                      const existingTarget = targets.find((t) => t.assetClass === comp.assetClass);
                      if (existingTarget) {
                        await saveTargetMutation.mutateAsync({
                          id: existingTarget.id,
                          strategyId: strategy.id,
                          assetClass: comp.assetClass,
                          targetPercent: newPercent,
                          isLocked: existingTarget.isLocked || false,
                        });
                      }
                    }}
                    onProportionalChange={async (updatedTargets) => {
                      if (!strategy?.id) return;
                      // Save all updated targets
                      for (const updatedTarget of updatedTargets) {
                        const existingTarget = targets.find(
                          (t) => t.assetClass === updatedTarget.assetClass,
                        );
                        if (existingTarget) {
                          await saveTargetMutation.mutateAsync({
                            id: existingTarget.id,
                            strategyId: strategy.id,
                            assetClass: updatedTarget.assetClass,
                            targetPercent: updatedTarget.targetPercent,
                            isLocked: updatedTarget.isLocked || false,
                          });
                        }
                      }
                    }}
                    isLoading={isMutating}
                    accountId={selectedAccountId}
                    isReadOnly={false}
                  />
                );
              })}
            </div>
          </div>
        )}

        {viewTab === "composition" && (
          <div className="space-y-4">
            {holdingsLoading && (
              <div className="space-y-4">
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
              </div>
            )}

            {!holdingsLoading && currentAllocation.assetClasses.length === 0 && (
              <div className="rounded-lg border border-dashed py-12 text-center">
                <p className="text-muted-foreground">No holdings in this account yet</p>
              </div>
            )}

            {!holdingsLoading && currentAllocation.assetClasses.length > 0 && (
              <div className="space-y-6">
                {/* Summary stats - USE formatCurrency */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-card rounded-lg border p-4">
                    <p className="text-muted-foreground text-xs">Total Value</p>
                    <p className="text-xl font-bold">
                      {formatCurrency(currentAllocation.totalValue)}
                    </p>
                  </div>
                  <div className="bg-card rounded-lg border p-4">
                    <p className="text-muted-foreground text-xs">Asset Classes</p>
                    <p className="text-xl font-bold">{currentAllocation.assetClasses.length}</p>
                  </div>
                  <div className="bg-card rounded-lg border p-4">
                    <p className="text-muted-foreground text-xs">Holdings</p>
                    <p className="text-xl font-bold">{holdings.length}</p>
                  </div>
                </div>

                {/* Asset class breakdown (Tier 1) */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">By Asset Class</h3>
                  {currentAllocation.assetClasses.map((assetClass) => (
                    <details
                      key={assetClass.assetClass}
                      className="bg-card group space-y-3 rounded-lg border p-4"
                    >
                      {/* Tier 1: Asset Class Header - TWO LINES: (chevron + name) then (color bar) */}
                      <summary className="cursor-pointer list-none space-y-2">
                        {/* LINE 1: Chevron + Name + Percentage */}
                        <div className="flex items-center gap-3">
                          {/* Chevron icon (LEFT) */}
                          <div className="flex w-5 flex-shrink-0 items-center justify-center">
                            <svg
                              className="text-muted-foreground h-4 w-4 transition-transform group-open:rotate-90"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </div>

                          {/* Asset Class Name */}
                          <span className="text-foreground flex-shrink-0 text-sm font-semibold">
                            {assetClass.assetClass}
                          </span>

                          {/* Spacer */}
                          <div className="flex-1" />

                          {/* Percentage (RIGHT) */}
                          <span className="text-foreground w-12 flex-shrink-0 text-right text-sm font-semibold">
                            {assetClass.actualPercent.toFixed(1)}%
                          </span>
                        </div>

                        {/* LINE 2: Color Bar - DIMMED WHEN OPEN */}
                        <div className="bg-muted h-3 overflow-hidden rounded">
                          <div
                            className={`h-full rounded transition-all ${getAssetClassColor(assetClass.actualPercent)} group-open:opacity-50 group-open:brightness-110`}
                            style={{ width: `${Math.min(assetClass.actualPercent, 100)}%` }}
                          />
                        </div>
                      </summary>

                      {/* Expanded Content (Hidden when collapsed) */}
                      <div className="hidden space-y-3 pl-8 group-open:block">
                        {/* Asset Class Value */}
                        <p className="text-muted-foreground text-xs">
                          {formatCurrency(assetClass.currentValue)}
                        </p>

                        {/* Tier 2: Asset Sub-Classes Breakdown */}
                        {assetClass.subClasses.length > 0 && (
                          <div className="border-border/50 space-y-2 border-t pt-3">
                            <p className="text-muted-foreground text-xs font-semibold uppercase">
                              By Sub-Class
                            </p>
                            {assetClass.subClasses.map((subClass) => (
                              <details
                                key={subClass.subClass}
                                className="bg-muted/30 group space-y-2 rounded-md p-2"
                              >
                                {/* Sub-Class Header - TWO LINES: (chevron + name) then (color bar) */}
                                <summary className="cursor-pointer list-none space-y-2">
                                  {/* LINE 1: Chevron + Name + Percentage */}
                                  <div className="flex items-center gap-2">
                                    {/* Chevron icon (LEFT) */}
                                    <div className="flex w-4 flex-shrink-0 items-center justify-center">
                                      <svg
                                        className="text-muted-foreground h-3 w-3 transition-transform group-open:rotate-90"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M9 5l7 7-7 7"
                                        />
                                      </svg>
                                    </div>

                                    {/* Sub-Class Name */}
                                    <span className="text-foreground flex-shrink-0 text-xs font-semibold">
                                      {subClass.subClass}
                                    </span>

                                    {/* Spacer */}
                                    <div className="flex-1" />

                                    {/* Percentage (RIGHT) */}
                                    <span className="text-foreground w-10 flex-shrink-0 text-right text-xs font-semibold">
                                      {subClass.subClassPercent.toFixed(1)}%
                                    </span>
                                  </div>

                                  {/* LINE 2: Color Bar */}
                                  <div className="bg-muted h-3 overflow-hidden rounded">
                                    <div
                                      className={`h-full rounded transition-all ${getSubClassColor(subClass.subClassPercent)}`}
                                      style={{
                                        width: `${Math.min(subClass.subClassPercent, 100)}%`,
                                      }}
                                    />
                                  </div>
                                </summary>

                                {/* Sub-Class Details */}
                                <div className="hidden space-y-2 pl-4 group-open:block">
                                  {/* Info row: "X% of Asset Class" + Value */}
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground text-xs">
                                      {subClass.subClassPercent.toFixed(1)}% of{" "}
                                      {assetClass.assetClass}
                                    </span>
                                    <span className="text-foreground text-xs font-semibold">
                                      {formatCurrency(subClass.subClassValue)}
                                    </span>
                                  </div>

                                  {/* Holdings in Sub-Class (Tier 3) */}
                                  <div className="border-border/30 space-y-1 border-l pl-2 text-xs">
                                    {subClass.holdings
                                      .sort(
                                        (a, b) =>
                                          (b.marketValue?.base || 0) - (a.marketValue?.base || 0),
                                      )
                                      .map((h) => (
                                        <div
                                          key={h.id}
                                          className="text-muted-foreground flex justify-between"
                                        >
                                          <span>{renderHoldingName(h)}</span>
                                          <span>{formatCurrency(h.marketValue?.base || 0)}</span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              </details>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {viewTab === "pie-chart" && (
          <AllocationPieChartView
            currentAllocation={currentAllocation}
            targets={targets}
            onSliceClick={(assetClass: string) => {
              setSelectedAssetClass(assetClass);
              setShowAssetDetails(true);
            }}
            onUpdateTarget={async (assetClass: string, newPercent: number, isLocked?: boolean) => {
              const target = targets.find((t) => t.assetClass === assetClass);
              if (target && strategy?.id) {
                // Determine if this is a lock toggle (isLocked explicitly passed AND different from current)
                const isLockChange = isLocked !== undefined && isLocked !== target.isLocked;
                const isPercentChange = newPercent !== target.targetPercent;

                let customMessage: string | undefined;
                if (isLockChange && !isPercentChange) {
                  // Pure lock toggle (no slider movement)
                  customMessage = `${assetClass} is now ${isLocked ? "locked" : "unlocked"}`;
                }
                // For slider/text changes, use default message (undefined)

                await saveTargetMutation.mutateAsync({
                  id: target.id,
                  strategyId: strategy.id,
                  assetClass,
                  targetPercent: newPercent,
                  isLocked: isLocked !== undefined ? isLocked : target.isLocked,
                  toastMessage: customMessage,
                } as any);
                queryClient.invalidateQueries({
                  queryKey: [QueryKeys.ASSET_CLASS_TARGETS, selectedAccountId],
                });
              }
            }}
            onAddTarget={() => handleOpenForm()}
            onDeleteTarget={async (assetClass: string) => {
              await handleDelete(assetClass);
            }}
            showHiddenTargets={showHiddenTargets}
            onToggleHiddenTargets={() => setShowHiddenTargets(!showHiddenTargets)}
          />
        )}

        {viewTab === "rebalancing" && (
          <>
            <RebalancingAdvisor
              key={selectedAccountId}
              targets={targets}
              composition={composition}
              totalPortfolioValue={currentAllocation.totalValue}
              isLoading={isMutating}
              baseCurrency={baseCurrency}
            />
          </>
        )}
      </div>

      {/* Asset Class Form Dialog - Original Design */}
      {formOpen && (
        <AssetClassFormDialog
          open={formOpen}
          onOpenChange={() => {
            setFormOpen(false);
            setEditingTarget(null);
          }}
          onSubmit={handleFormSubmit}
          existingTargets={targets}
          editingTarget={
            editingTarget ? (targets.find((t) => t.assetClass === editingTarget) ?? null) : null
          }
          isLoading={isMutating}
          availableAssetClasses={availableAssetClasses}
        />
      )}

      {/* Side Panel for Selected Asset Class */}
      {showAssetDetails && selectedAssetClass && (
        <Sheet
          open={showAssetDetails}
          onOpenChange={(open) => {
            setShowAssetDetails(open);
            if (!open) {
              // Clear pending edits when closing panel
              setAssetClassPendingEdits(new Map());
              setIsSavingAllTargets(false);
            }
          }}
        >
          <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>{selectedAssetClass} Allocation</SheetTitle>
            </SheetHeader>

            <div className="space-y-6 py-8">
              {currentAllocation.assetClasses.find(
                (ac) => ac.assetClass === selectedAssetClass,
              ) && (
                <div className="space-y-4">
                  {/* Section 1: Target Bar (Grey, Non-Slider) + Editable Target % */}
                  <div className="bg-muted/30 rounded-lg border p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-sm font-semibold">Allocation Target</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          handleOpenForm(selectedAssetClass);
                        }}
                        className="h-7 w-7 p-0"
                      >
                        ✎
                      </Button>
                    </div>

                    {targets.find((t) => t.assetClass === selectedAssetClass) && (
                      <div className="space-y-3">
                        {/* Actual % */}
                        <div className="mb-2 flex justify-between text-sm">
                          <span className="text-muted-foreground">Actual:</span>
                          <span className="font-semibold">
                            {currentAllocation.assetClasses
                              .find((ac) => ac.assetClass === selectedAssetClass)
                              ?.actualPercent.toFixed(1)}
                            %
                          </span>
                        </div>

                        {/* Actual Progress Bar (Green) */}
                        <div className="bg-muted h-3 overflow-hidden rounded">
                          <div
                            className="h-full bg-green-500"
                            style={{
                              width: `${Math.min(
                                currentAllocation.assetClasses.find(
                                  (ac) => ac.assetClass === selectedAssetClass,
                                )?.actualPercent || 0,
                                100,
                              )}%`,
                            }}
                          />
                        </div>

                        {/* Target % - EDITABLE INLINE */}
                        <div className="mt-4 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Target:</span>
                          <TargetPercentInput
                            value={
                              targets.find((t) => t.assetClass === selectedAssetClass)
                                ?.targetPercent || 0
                            }
                            onSave={async (newPercent: number) => {
                              const target = targets.find(
                                (t) => t.assetClass === selectedAssetClass,
                              );
                              if (target && strategy?.id) {
                                await saveTargetMutation.mutateAsync({
                                  id: target.id,
                                  strategyId: strategy.id,
                                  assetClass: selectedAssetClass,
                                  targetPercent: newPercent,
                                  isLocked: target.isLocked || false,
                                });
                              }
                            }}
                            disabled={isMutating}
                          />
                        </div>

                        {/* Target Progress Bar - Sector Allocation Style */}
                        <div className="bg-secondary relative h-3 flex-1 overflow-hidden rounded">
                          <div
                            className="bg-chart-2 absolute top-0 left-0 h-full rounded transition-all"
                            style={{
                              width: `${Math.min(
                                targets.find((t) => t.assetClass === selectedAssetClass)
                                  ?.targetPercent || 0,
                                100,
                              )}%`,
                            }}
                          />
                          <div className="text-background absolute top-0 left-0 flex h-full items-center px-2 text-xs font-medium">
                            <span className="whitespace-nowrap">
                              Target{" "}
                              {(
                                targets.find((t) => t.assetClass === selectedAssetClass)
                                  ?.targetPercent || 0
                              ).toFixed(0)}
                              %
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Save All Targets Section - Shows when there are pending edits or auto-distribution */}
                  {assetClassPendingEdits.size > 0 && (
                    <div className="bg-primary/5 border-primary/20 space-y-3 rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 text-sm">
                          <p className="font-semibold">Unsaved Changes</p>
                          <p className="text-muted-foreground text-xs">
                            {assetClassPendingEdits.size} target
                            {assetClassPendingEdits.size !== 1 ? "s" : ""} modified (across all
                            sub-classes)
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            onClick={handleSaveAllTargets}
                            disabled={isSavingAllTargets || !totalPercentageValidation.isValid}
                            size="sm"
                            className={!totalPercentageValidation.isValid ? "opacity-50" : ""}
                          >
                            {isSavingAllTargets ? "Saving..." : "Save All Targets"}
                          </Button>
                          {!totalPercentageValidation.isValid &&
                            totalPercentageValidation.error && (
                              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                                {totalPercentageValidation.error}
                              </p>
                            )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Section 2: Sub-Class Breakdown with Holding Targets */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Holdings by Type</h4>
                    {currentAllocation.assetClasses.find(
                      (ac) => ac.assetClass === selectedAssetClass,
                    )?.subClasses &&
                    currentAllocation.assetClasses.find(
                      (ac) => ac.assetClass === selectedAssetClass,
                    )?.subClasses.length! > 0 ? (
                      <div className="space-y-3">
                        {currentAllocation.assetClasses
                          .find((ac) => ac.assetClass === selectedAssetClass)
                          ?.subClasses.map((subClass) => (
                            <details key={subClass.subClass} className="group">
                              <summary className="flex cursor-pointer list-none flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <ChevronDown
                                    size={14}
                                    className={`text-muted-foreground flex-shrink-0 transition-transform group-open:rotate-180`}
                                  />
                                  <p className="flex-1 text-sm font-medium">{subClass.subClass}</p>
                                  <span className="flex-shrink-0 text-sm font-semibold">
                                    {formatCurrencyDisplay(subClass.subClassValue)}
                                  </span>
                                </div>

                                {/* Progress Bar - INSIDE summary, always visible */}
                                <div className="bg-muted h-3 overflow-hidden rounded">
                                  <div
                                    className="h-full bg-orange-500"
                                    style={{
                                      width: `${Math.min(subClass.subClassPercent, 100)}%`,
                                    }}
                                  />
                                </div>
                              </summary>

                              {/* Percentage text and Holdings (only visible when expanded) */}
                              {(subClass.holdings || []).length > 0 && (
                                <div className="hidden space-y-2 pt-2 pl-6 group-open:block">
                                  <span className="text-muted-foreground text-xs">
                                    {subClass.subClassPercent.toFixed(1)}% of {selectedAssetClass}
                                  </span>
                                  <div className="space-y-2">
                                    <HoldingsTargetList
                                      assetClassId={
                                        targets.find((t) => t.assetClass === selectedAssetClass)
                                          ?.id || ""
                                      }
                                      allHoldings={
                                        currentAllocation.assetClasses
                                          .find((ac) => ac.assetClass === selectedAssetClass)
                                          ?.subClasses.flatMap((sc) => sc.holdings || []) || []
                                      }
                                      displayHoldings={subClass.holdings || []}
                                      assetClassValue={
                                        currentAllocation.assetClasses.find(
                                          (ac) => ac.assetClass === selectedAssetClass,
                                        )?.currentValue || 0
                                      }
                                      sharedPendingEdits={assetClassPendingEdits}
                                      onSharedPendingChange={setAssetClassPendingEdits}
                                    />
                                  </div>
                                </div>
                              )}
                            </details>
                          ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs">No sub-classes</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Save as Portfolio Modal */}
      <SaveAsPortfolioModal
        open={showSaveAsPortfolioModal}
        onOpenChange={setShowSaveAsPortfolioModal}
        selectedAccountIds={selectedAccountIds}
      />
    </div>
  );
}
