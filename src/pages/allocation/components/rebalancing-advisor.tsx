import { getHoldingTargets } from "@/commands/rebalancing";
import { QueryKeys } from "@/lib/query-keys";
import { AssetClassTarget, HoldingTarget } from "@/lib/types";
import { useQueries } from "@tanstack/react-query";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@wealthfolio/ui";
import { ChevronDown, Copy, Download } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssetClassComposition } from "../hooks/use-current-allocation";

interface RebalancingAdvisorProps {
  targets: AssetClassTarget[];
  composition: AssetClassComposition[];
  totalPortfolioValue: number;
  isLoading?: boolean;
  baseCurrency?: string;
}

interface AllocationSuggestion {
  assetClass: string;
  targetPercent: number;
  currentPercent: number;
  shortfallPercent: number;
  shortfallAmount: number;
  suggestedBuy: number;
}

interface HoldingSuggestion {
  assetId: string;
  symbol: string;
  displayName: string;
  assetClass: string;
  targetPortfolioPercent: number; // Cascaded: holding% × asset_class%
  targetPercentOfClass: number; // % of asset class (original target)
  currentValue: number;
  currentPortfolioPercent: number;
  shortfallAmount: number;
  suggestedBuy: number;
  isLocked: boolean;
  currentPrice: number;
  currentQuantity: number;
}

export function RebalancingAdvisor({
  targets,
  composition,
  totalPortfolioValue,
  isLoading = false,
  baseCurrency = "USD",
}: RebalancingAdvisorProps) {
  const [availableCash, setAvailableCash] = useState<number>(0);
  const [suggestions, setSuggestions] = useState<AllocationSuggestion[]>([]);
  const [holdingSuggestions, setHoldingSuggestions] = useState<HoldingSuggestion[]>([]);
  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('detailed');
  const [expandedAssetClasses, setExpandedAssetClasses] = useState<Record<string, boolean>>({});
  const [showZeroShareHoldings, setShowZeroShareHoldings] = useState(false);
  const navigate = useNavigate();

  // Fetch holding targets for all asset classes that have targets
  // Use useQueries to safely fetch multiple queries with dynamic length
  // This ensures stable hook calls even when targets array length changes
  const holdingTargetQueries = useQueries({
    queries: targets.map((target) => ({
      queryKey: [QueryKeys.HOLDING_TARGETS, target.id],
      queryFn: async () => {
        if (!target.id) {
          return [];
        }
        return getHoldingTargets(target.id);
      },
      enabled: !!target.id,
    })),
  });

  // Format currency helper using baseCurrency
  const formatCurrency = (value: number): string => {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: baseCurrency,
    });
  };

  const handleCalculate = () => {
    if (availableCash <= 0) {
      alert("Please enter an amount greater than 0");
      return;
    }

    const newPortfolioTotal = totalPortfolioValue + availableCash;
    const newSuggestions: AllocationSuggestion[] = [];
    const newHoldingSuggestions: HoldingSuggestion[] = [];
    let totalSuggestedAllocation = 0;

    // First, calculate asset class level suggestions
    targets.forEach((target) => {
      const comp = composition.find((c) => c.assetClass === target.assetClass);
      const currentValue = (comp?.actualPercent || 0) * (totalPortfolioValue / 100);
      const targetValue = (target.targetPercent / 100) * newPortfolioTotal;
      const shortfallAmount = Math.max(0, targetValue - currentValue);

      totalSuggestedAllocation += shortfallAmount;

      newSuggestions.push({
        assetClass: target.assetClass,
        targetPercent: target.targetPercent,
        currentPercent: comp?.actualPercent || 0,
        shortfallPercent: (shortfallAmount / newPortfolioTotal) * 100,
        shortfallAmount,
        suggestedBuy: shortfallAmount, // Will be updated below if needed
      });
    });

    // If total shortfall < available cash, we have extra cash
    // If total shortfall > available cash, we need to scale down
    // Only allocate to asset classes that are BELOW target (shortfall > 0)
    const assetClassesNeedingCash = newSuggestions.filter(s => s.shortfallAmount > 0);
    const totalShortfallForBelowTarget = assetClassesNeedingCash.reduce((sum, s) => sum + s.shortfallAmount, 0);

    if (totalShortfallForBelowTarget > 0) {
      if (totalShortfallForBelowTarget > availableCash) {
        // Not enough cash to fill all shortfalls, scale down proportionally
        const scaleFactor = availableCash / totalShortfallForBelowTarget;
        newSuggestions.forEach((s) => {
          if (s.shortfallAmount > 0) {
            s.suggestedBuy = s.shortfallAmount * scaleFactor;
          }
        });
      }
      // else: enough cash to fill shortfalls, keep suggestedBuy = shortfallAmount
    }

    // Then, calculate per-holding suggestions if holding targets exist
    targets.forEach((target, index) => {
      const holdingTargetsData = holdingTargetQueries[index]?.data || [];
      if (holdingTargetsData.length === 0) return;

      const comp = composition.find((c) => c.assetClass === target.assetClass);
      if (!comp) return;

      // Calculate cascading percentages for each holding
      holdingTargetsData.forEach((holdingTarget: HoldingTarget) => {
        // Find the holding in composition data
        const holding = comp.subClasses
          .flatMap((sc) => sc.holdings || [])
          .find((h) => h.instrument?.id === holdingTarget.assetId);

        if (!holding) return; // Skip if holding not found

        // Cascading percentage: holding% × asset_class%
        const targetPortfolioPercent =
          (holdingTarget.targetPercentOfClass * target.targetPercent) / 100;

        const currentValue = holding.marketValue?.base || 0;
        const currentPortfolioPercent = (currentValue / totalPortfolioValue) * 100;

        // Calculate shortfall for rebalancing
        const targetValue = (targetPortfolioPercent / 100) * newPortfolioTotal;
        const shortfallAmount = Math.max(0, targetValue - currentValue);

        newHoldingSuggestions.push({
          assetId: holdingTarget.assetId,
          symbol: holding.instrument?.symbol || '',
          displayName: holding.instrument?.name || holding.instrument?.symbol || 'Unknown',
          assetClass: target.assetClass,
          targetPortfolioPercent,
          targetPercentOfClass: holdingTarget.targetPercentOfClass,
          currentValue,
          currentPortfolioPercent,
          shortfallAmount,
          suggestedBuy: shortfallAmount,
          isLocked: holdingTarget.isLocked,
          currentPrice: holding.price || 0,
          currentQuantity: holding.quantity || 0,
        });
      });
    });

    // Scale holding suggestions to match their asset class allocation
    // For each asset class, distribute its suggestedBuy among its holdings proportionally
    newSuggestions.forEach((assetClassSuggestion) => {
      const classHoldings = newHoldingSuggestions.filter(
        (h) => h.assetClass === assetClassSuggestion.assetClass
      );

      if (classHoldings.length === 0) return;

      const classTotalShortfall = classHoldings.reduce((sum, h) => sum + h.shortfallAmount, 0);

      if (classTotalShortfall > 0) {
        // Distribute asset class allocation among holdings proportionally
        const classBudget = assetClassSuggestion.suggestedBuy;
        classHoldings.forEach((h) => {
          h.suggestedBuy = (h.shortfallAmount / classTotalShortfall) * classBudget;
        });
      }
    });

    // OPTIMIZATION: Maximize cash usage with whole shares PER ASSET CLASS
    // After proportional distribution, optimize by buying additional shares
    // Respect asset class budgets - don't cross boundaries
    if (newHoldingSuggestions.length > 0) {
      // Process each asset class independently
      newSuggestions.forEach((assetClassSuggestion) => {
        const classHoldings = newHoldingSuggestions.filter(
          (h) => h.assetClass === assetClassSuggestion.assetClass
        );

        if (classHoldings.length === 0) return;

        // Create holdings with shares for this asset class
        const holdingsWithShares = classHoldings.map((h) => ({
          holding: h,
          sharesToBuy: h.currentPrice > 0 ? Math.floor(h.suggestedBuy / h.currentPrice) : 0,
          actualCost: 0,
        }));

        holdingsWithShares.forEach((h) => {
          h.actualCost = h.sharesToBuy * h.holding.currentPrice;
        });

        // Calculate cash used and remaining for THIS asset class
        let classSpent = holdingsWithShares.reduce((sum, h) => sum + h.actualCost, 0);
        let classRemainingCash = assetClassSuggestion.suggestedBuy - classSpent;

        // Optimized share allocation within THIS asset class only
        const buyableHoldings = holdingsWithShares.filter((h) => h.holding.currentPrice > 0);

        while (classRemainingCash > 0 && buyableHoldings.length > 0) {
          let bestHolding = null;
          let bestScore = -Infinity;

          // For each holding in this class, calculate improvement
          for (const h of buyableHoldings) {
            const sharePrice = h.holding.currentPrice;

            // Can we afford 1 more share with THIS CLASS's budget?
            if (sharePrice > classRemainingCash) continue;

            // Calculate current gap from target (lower is better)
            const currentValue = h.holding.currentValue + h.actualCost;
            const newPortfolioTotal = totalPortfolioValue + availableCash;
            const currentPercent = (currentValue / newPortfolioTotal) * 100;
            const gapBefore = Math.abs(h.holding.targetPortfolioPercent - currentPercent);

            // Calculate gap after buying 1 more share
            const newValue = currentValue + sharePrice;
            const newPercent = (newValue / newPortfolioTotal) * 100;
            const gapAfter = Math.abs(h.holding.targetPortfolioPercent - newPercent);

            // Improvement = reduction in gap
            const improvement = gapBefore - gapAfter;

            // Score = improvement per euro spent (efficiency)
            const score = improvement / sharePrice;

            if (score > bestScore) {
              bestScore = score;
              bestHolding = h;
            }
          }

          // Buy 1 share of the best holding in this class
          if (bestHolding) {
            bestHolding.sharesToBuy += 1;
            bestHolding.actualCost = bestHolding.sharesToBuy * bestHolding.holding.currentPrice;
            classSpent = holdingsWithShares.reduce((sum, h) => sum + h.actualCost, 0);
            classRemainingCash = assetClassSuggestion.suggestedBuy - classSpent;
          } else {
            // No affordable shares left in this class
            break;
          }
        }

        // Update holding suggestions with optimized values for this class
        holdingsWithShares.forEach(({ holding, sharesToBuy, actualCost }) => {
          holding.suggestedBuy = actualCost;
          holding.currentQuantity = sharesToBuy;
        });
      });
    }

    setSuggestions(newSuggestions);
    setHoldingSuggestions(newHoldingSuggestions);
  };

  // Calculate total allocated: sum of holdings + asset classes without holdings
  const totalSuggested = suggestions.reduce((sum, s) => {
    // For this asset class, get holdings total
    const classHoldings = holdingSuggestions.filter(h => h.assetClass === s.assetClass);
    const holdingsTotal = classHoldings.reduce((hSum, h) => hSum + h.suggestedBuy, 0);

    // If asset class has holdings, use holdings total; otherwise use asset class suggestedBuy
    return sum + (classHoldings.length > 0 ? holdingsTotal : s.suggestedBuy);
  }, 0);
  const remaining = availableCash - totalSuggested;

  // Calculate total needed to reach all targets (before scaling)
  const totalNeeded = suggestions.reduce((sum, s) => sum + s.shortfallAmount, 0);
  const cashShortfall = totalNeeded - availableCash;

  const handleCopyText = () => {
    const text = generateSuggestionText();
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const handleExportCSV = () => {
    const csv = generateCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rebalancing-suggestions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateSuggestionText = (): string => {
    let text = `Rebalancing Suggestions\n`;
    text += `Available Cash: ${formatCurrency(availableCash)}\n`;
    text += `New Portfolio Total: ${formatCurrency(totalPortfolioValue + availableCash)}\n\n`;

    text += `=== Asset Class Level ===\n\n`;
    suggestions.forEach((s) => {
      text += `${s.assetClass}\n`;
      text += `  Target: ${s.targetPercent.toFixed(1)}% | Current: ${s.currentPercent.toFixed(1)}%\n`;
      text += `  Suggested Buy: ${formatCurrency(s.suggestedBuy)}\n\n`;
    });

    if (holdingSuggestions.length > 0) {
      text += `\n=== Holding Level ===\n\n`;
      Array.from(new Set(holdingSuggestions.map((h) => h.assetClass))).forEach((assetClass) => {
        const classHoldings = holdingSuggestions.filter((h) => h.assetClass === assetClass);
        text += `${assetClass}:\n`;
        classHoldings
          .sort((a, b) => b.suggestedBuy - a.suggestedBuy)
          .forEach((h) => {
            text += `  ${h.symbol}: ${formatCurrency(h.suggestedBuy)} (${h.currentPortfolioPercent.toFixed(1)}% → ${h.targetPortfolioPercent.toFixed(1)}%)\n`;
          });
        text += `\n`;
      });
    }

    if (remaining > 0.01) {
      text += `Remaining (unallocated): ${formatCurrency(remaining)}\n`;
    }

    return text;
  };

  const generateCSV = (): string => {
    let csv = "Type,Asset Class,Symbol,Target %,Current %,Suggested Buy,Shortfall %\n";

    // Asset class level
    suggestions.forEach((s) => {
      csv += `Asset Class,${s.assetClass},,${s.targetPercent.toFixed(1)},${s.currentPercent.toFixed(1)},${formatCurrency(s.suggestedBuy)},${s.shortfallPercent.toFixed(1)}\n`;
    });

    // Holding level
    if (holdingSuggestions.length > 0) {
      holdingSuggestions
        .sort((a, b) => a.assetClass.localeCompare(b.assetClass) || b.suggestedBuy - a.suggestedBuy)
        .forEach((h) => {
          csv += `Holding,${h.assetClass},${h.symbol},${h.targetPortfolioPercent.toFixed(1)},${h.currentPortfolioPercent.toFixed(1)},${formatCurrency(h.suggestedBuy)},\n`;
        });
    }

    return csv;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Rebalancing Suggestions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Enter available cash to see how to allocate it to reach your targets.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Current Portfolio Value</div>
          <div className="text-lg font-semibold text-foreground">
            {formatCurrency(totalPortfolioValue)}
          </div>
        </div>
      </div>

      {/* Empty State: No targets */}
      {targets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-8 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">No allocation targets set</p>
          <p className="text-sm text-muted-foreground">
            Go to the "Allocation Overview" tab to create allocation targets first, then you can use the rebalancing calculator.
          </p>
        </div>
      ) : (
        <>
          {/* Input Section */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground">Available Cash to Invest</label>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm font-medium text-muted-foreground">
              {baseCurrency === "USD" ? "$" : baseCurrency}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={availableCash === 0 ? '' : availableCash}
              onChange={(e) => {
                // Remove any non-numeric characters except decimal point
                const sanitized = e.target.value.replace(/[^0-9.]/g, '');
                // Remove leading zeros (but keep "0" if it's just "0" or "0.X")
                const cleaned = sanitized.replace(/^0+(?=\d)/, '');
                // Limit to 2 decimal places
                const limited = cleaned.includes('.')
                  ? cleaned.split('.')[0] + '.' + cleaned.split('.')[1].substring(0, 2)
                  : cleaned;
                setAvailableCash(parseFloat(limited) || 0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCalculate();
                }
              }}
              disabled={isLoading}
              placeholder="0.00"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleCalculate}
            disabled={availableCash <= 0 || isLoading}
            className="flex-1"
          >
            Calculate Suggestions
          </Button>
        </div>
      </div>

      {/* Results Section */}
      {suggestions.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Allocation Plan</h3>
            {/* View Mode Segmented Control */}
            {holdingSuggestions.length > 0 && (
              <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
                <button
                  onClick={() => setViewMode('overview')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    viewMode === 'overview'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setViewMode('detailed')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    viewMode === 'detailed'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Detailed
                </button>              </div>
            )}
          </div>

          {/* Suggestions Table */}          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.assetClass}
                className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-foreground">{suggestion.assetClass}</h4>
                  <div className="text-sm text-muted-foreground">
                    {suggestion.targetPercent.toFixed(1)}% target
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current:</span>
                  <span className="font-medium">{suggestion.currentPercent.toFixed(1)}%</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Suggested Buy:</span>
                  <div className="text-right">
                    <div className="font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(suggestion.suggestedBuy)}
                    </div>
                    {suggestion.suggestedBuy > 0 && (() => {
                      const currentValue = (suggestion.currentPercent / 100) * totalPortfolioValue;

                      // Get actual amount being allocated (holdings total or asset class suggested buy)
                      const classHoldings = holdingSuggestions.filter(h => h.assetClass === suggestion.assetClass);
                      const actualAllocation = classHoldings.length > 0
                        ? classHoldings.reduce((sum, h) => sum + h.suggestedBuy, 0)
                        : suggestion.suggestedBuy;

                      const newValue = currentValue + actualAllocation;
                      const newTotal = totalPortfolioValue + availableCash;
                      const newPercent = (newValue / newTotal) * 100;
                      return (
                        <div className="text-xs text-muted-foreground">
                          Will adjust to {newPercent.toFixed(1)}%
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="border-t border-border pt-3 space-y-2">
            {/* Total Allocated - full width */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Total Allocated:</span>
              <span className="text-sm font-semibold">
                {formatCurrency(totalSuggested)}
              </span>
            </div>
            {remaining > 0.01 && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Remaining:</span>
                <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                  {formatCurrency(remaining)}
                </span>
              </div>
            )}
            {cashShortfall > 0.01 && (
              <div className="flex items-center justify-between pt-1 border-t border-border/30">
                <span className="text-xs text-muted-foreground">Additional cash needed to reach targets:</span>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {formatCurrency(cashShortfall)}
                </span>
              </div>
            )}
            {/* New Portfolio Amount - bottom right */}
            <div className="flex items-center justify-end pt-1">
              <div className="text-xs text-muted-foreground">
                New portfolio amount: {formatCurrency(totalPortfolioValue + availableCash)}
              </div>
            </div>
          </div>

          {/* Holding-Level Suggestions */}
          {holdingSuggestions.length > 0 && viewMode === 'detailed' && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Holding-Level Suggestions ({holdingSuggestions.length})
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Detailed per-holding buy suggestions based on cascading percentages
                  </p>
                </div>
                {/* Show/Hide Zero Holdings Toggle */}
                <button
                  onClick={() => setShowZeroShareHoldings(!showZeroShareHoldings)}
                  className={`p-2 rounded-md transition-colors ${
                    showZeroShareHoldings
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                  title={showZeroShareHoldings ? 'Hide zero-share holdings' : 'Show zero-share holdings'}
                >
                  {showZeroShareHoldings ? (
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="space-y-2">
                {/* Group by asset class - filter out classes with 0 total shares unless toggle is on */}
                {Array.from(new Set(holdingSuggestions.map((h) => h.assetClass)))
                  .filter((assetClass) => {
                    const classHoldings = holdingSuggestions.filter((h) => h.assetClass === assetClass);
                    const totalShares = classHoldings.reduce((sum, h) => sum + (h.currentQuantity || 0), 0);
                    return showZeroShareHoldings || totalShares > 0;
                  })
                  .map((assetClass) => {
                      const classHoldings = holdingSuggestions.filter(
                        (h) => h.assetClass === assetClass
                      );
                      const classTotal = classHoldings.reduce((sum, h) => sum + h.suggestedBuy, 0);

                      // Get asset class suggestion for "Will adjust to X%" calculation
                      const assetClassSuggestion = suggestions.find((s) => s.assetClass === assetClass);

                      const isExpanded = expandedAssetClasses[assetClass] ?? true;

                      return (
                        <Collapsible
                          key={assetClass}
                          open={isExpanded}
                          onOpenChange={(open) => {
                            setExpandedAssetClasses(prev => ({ ...prev, [assetClass]: open }));
                          }}
                        >
                          <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
                            <CollapsibleTrigger className="w-full pb-1 border-b border-border/30">
                              <div className="flex items-center justify-between hover:opacity-80">
                                <div className="flex items-center gap-2">
                                  <ChevronDown
                                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                                      isExpanded ? 'rotate-180' : ''
                                    }`}
                                  />
                                  <span className="text-sm font-semibold text-foreground">
                                    {assetClass}
                                  </span>
                                </div>
                                <span className="text-xs font-medium text-muted-foreground">
                                  Total: {formatCurrency(classTotal)}
                                </span>
                              </div>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              {classHoldings
                                .filter(holding => showZeroShareHoldings || holding.currentQuantity > 0) // Hide individual zero-share holdings
                                .sort((a, b) => b.suggestedBuy - a.suggestedBuy) // Largest gaps first
                                .map((holding) => {
                              // currentQuantity now stores optimized shares to buy after allocation optimization
                              const sharesToBuy = holding.currentQuantity || 0;
                              const actualCost = holding.suggestedBuy; // Already optimized

                              return (
                              <div
                                key={holding.assetId}
                                className="bg-background/50 rounded px-2 py-1.5 space-y-1"
                              >
                                <div className="grid grid-cols-[1fr_170px_80px] gap-2 items-center text-xs">
                                  <button
                                    onClick={() => {
                                      if (holding.symbol) {
                                        navigate(`/holdings/${holding.symbol}`);
                                      }
                                    }}
                                    className="font-medium text-foreground truncate flex items-center gap-1 hover:underline text-left min-w-0"
                                  >
                                    {holding.displayName} ({holding.symbol})
                                  </button>
                                  {holding.currentPrice > 0 ? (
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap font-mono">
                                      Shares: {sharesToBuy} × {formatCurrency(holding.currentPrice)}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground font-mono">No price</span>
                                  )}
                                  <span className="font-semibold text-green-600 dark:text-green-400 text-right">
                                    {formatCurrency(actualCost)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                  <div className="truncate">
                                    Target: {holding.targetPercentOfClass.toFixed(1)}% of {holding.assetClass}
                                  </div>
                                  <div className="ml-2 whitespace-nowrap" title="Asset class % before → after purchase">
                                    {(() => {
                                      // Calculate current % of asset class
                                      const assetClassComp = composition.find(c => c.assetClass === holding.assetClass);
                                      const assetClassCurrentValue = assetClassComp ? (assetClassComp.actualPercent / 100) * totalPortfolioValue : 0;
                                      const currentPercentOfClass = assetClassCurrentValue > 0 ? (holding.currentValue / assetClassCurrentValue) * 100 : 0;

                                      // Calculate new % of asset class after purchase
                                      const assetClassNewValue = assetClassCurrentValue + (() => {
                                        const classHoldings = holdingSuggestions.filter(h => h.assetClass === holding.assetClass);
                                        return classHoldings.reduce((sum, h) => sum + h.suggestedBuy, 0);
                                      })();
                                      const newValue = holding.currentValue + actualCost;
                                      const newPercentOfClass = assetClassNewValue > 0 ? (newValue / assetClassNewValue) * 100 : 0;

                                      return `${currentPercentOfClass.toFixed(1)}% → ${newPercentOfClass.toFixed(1)}% of ${holding.assetClass}`;
                                    })()}
                                  </div>
                                </div>
                              </div>
                            );
                            })}

                              {/* Show residual - leftover cash that can't buy whole shares */}
                              {(() => {
                                const residual = assetClassSuggestion ? assetClassSuggestion.suggestedBuy - classTotal : 0;
                                return Math.abs(residual) > 0.01 ? (
                                  <div className="pt-1 border-t border-border/30 flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground">
                                      Residual (can't buy whole shares):
                                    </span>
                                    <span className="font-medium text-muted-foreground">
                                      {formatCurrency(residual)}
                                    </span>
                                  </div>
                                ) : null;
                              })()}
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
              </div>
            </div>
          )}

          {/* Export Buttons */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyText}
              className="flex items-center gap-2"
            >
              <Copy className="h-4 w-4" />
              Copy Text
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {suggestions.length === 0 && availableCash > 0 && targets.length > 0 && (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Enter your available cash above and click "Calculate Suggestions"
          </p>
        </div>
      )}
        </>
      )}
    </div>
  );
}
