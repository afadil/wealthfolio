import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { formatAmount } from "@wealthfolio/ui";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";

import type { Account, PortfolioTarget, DeviationReport, RebalancingPlan } from "@/lib/types";
import { calculateRebalancingPlan } from "@/adapters";
import { AccountSelector } from "@/components/account-selector";

interface RebalancingTabProps {
  selectedAccount: Account;
  onAccountChange: (account: Account) => void;
  activeTarget: PortfolioTarget | null;
  deviationReport: DeviationReport | null;
  baseCurrency: string;
}

export function RebalancingTab({
  selectedAccount,
  onAccountChange,
  activeTarget,
  deviationReport,
  baseCurrency,
}: RebalancingTabProps) {
  // Persist state per account in sessionStorage (cleared when browser closes)
  const storageKey = `rebalancing-${selectedAccount.id}`;

  // Initialize with current account's stored data
  const [availableCash, setAvailableCash] = useState<string>(() => {
    return sessionStorage.getItem(`${storageKey}-cash`) || "";
  });

  const [plan, setPlan] = useState<RebalancingPlan | null>(() => {
    const stored = sessionStorage.getItem(`${storageKey}-plan`);
    return stored ? (JSON.parse(stored) as RebalancingPlan) : null;
  });

  const [isCalculating, setIsCalculating] = useState(false);
  const [viewMode, setViewMode] = useState<"overview" | "detailed">("detailed");
  const [showZeroShares, setShowZeroShares] = useState(false);

  // Track previous account to detect changes
  const [prevAccountId, setPrevAccountId] = useState(selectedAccount.id);

  // When account changes, load that account's data
  useEffect(() => {
    if (selectedAccount.id !== prevAccountId) {
      // Account changed - load new account's data
      const storedCash = sessionStorage.getItem(`${storageKey}-cash`);
      const storedPlan = sessionStorage.getItem(`${storageKey}-plan`);

      setAvailableCash(storedCash || "");
      setPlan(storedPlan ? (JSON.parse(storedPlan) as RebalancingPlan) : null);
      setPrevAccountId(selectedAccount.id);

      // Clear old accounts' data from sessionStorage
      const keys = Object.keys(sessionStorage);
      keys.forEach((key) => {
        if (key.startsWith("rebalancing-") && !key.startsWith(storageKey)) {
          sessionStorage.removeItem(key);
        }
      });
    }
  }, [selectedAccount.id, prevAccountId, storageKey]);

  // Persist to sessionStorage when values change
  useEffect(() => {
    if (availableCash) {
      sessionStorage.setItem(`${storageKey}-cash`, availableCash);
    } else {
      sessionStorage.removeItem(`${storageKey}-cash`);
    }
  }, [availableCash, storageKey]);

  useEffect(() => {
    if (plan) {
      sessionStorage.setItem(`${storageKey}-plan`, JSON.stringify(plan));
    } else {
      sessionStorage.removeItem(`${storageKey}-plan`);
    }
  }, [plan, storageKey]);

  const handleCalculate = async () => {
    if (!activeTarget || !availableCash || parseFloat(availableCash) <= 0) {
      return;
    }

    setIsCalculating(true);
    try {
      const result = await calculateRebalancingPlan({
        targetId: activeTarget.id,
        availableCash: parseFloat(availableCash),
        baseCurrency,
      });
      setPlan(result);
    } catch (error) {
      console.error("Failed to calculate rebalancing plan:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  // Input sanitization helper
  const handleCashInputChange = (value: string) => {
    // Strip non-numeric characters except decimal point
    let sanitized = value.replace(/[^\d.]/g, "");

    // Ensure only one decimal point
    const parts = sanitized.split(".");
    if (parts.length > 2) {
      sanitized = parts[0] + "." + parts.slice(1).join("");
    }

    // Limit to 2 decimal places
    if (parts.length === 2 && parts[1].length > 2) {
      sanitized = parts[0] + "." + parts[1].substring(0, 2);
    }

    // Remove leading zeros (except for "0." cases)
    if (sanitized.length > 1 && sanitized.startsWith("0") && !sanitized.startsWith("0.")) {
      sanitized = sanitized.replace(/^0+/, "");
    }

    setAvailableCash(sanitized);
  };

  // Copy recommendations to clipboard as formatted text
  const handleCopyToClipboard = async () => {
    if (!plan) return;

    const lines: string[] = [];
    lines.push("=== REBALANCING RECOMMENDATIONS ===\n");

    // Group by category
    groupedRecommendations
      .filter((group) => {
        // Exclude Cash categories
        const isCashCategory =
          group.categoryId === "CASH" || group.categoryId === "CASH_BANK_DEPOSITS";
        if (isCashCategory) return false;

        const totalShares = group.recommendations.reduce((sum, r) => sum + r.shares, 0);
        return showZeroShares || totalShares > 0;
      })
      .forEach((group) => {
        lines.push(`\n${group.categoryName}:`);
        lines.push(`Total: ${formatAmount(group.totalAmount, baseCurrency)}`);

        group.recommendations
          .filter((rec) => showZeroShares || rec.shares > 0)
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .forEach((rec) => {
            const symbol = rec.symbol;
            const name = rec.name || rec.symbol;
            const shares = rec.shares.toFixed(0);
            const price = formatAmount(rec.pricePerShare, baseCurrency);
            const amount = formatAmount(rec.totalAmount, baseCurrency);

            if (rec.shares > 0) {
              lines.push(`  BUY ${shares} shares of ${name} (${symbol}) at ${price} = ${amount}`);
            } else {
              lines.push(`  ${name} (${symbol}): Already at/above target (0 shares)`);
            }
          });

        if (group.residualAmount > 0.01) {
          lines.push(
            `  Residual (can't buy whole shares): ${formatAmount(group.residualAmount, baseCurrency)}`,
          );
        }
      });

    lines.push(`\n\n=== SUMMARY ===`);
    lines.push(`Total Allocated: ${formatAmount(plan.totalAllocated, baseCurrency)}`);
    if (plan.remainingCash > 0.01) {
      lines.push(`Remaining: ${formatAmount(plan.remainingCash, baseCurrency)}`);
    }

    const text = lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: "Rebalancing recommendations have been copied to your clipboard.",
      });
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      // Fallback for older browsers
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        toast({
          title: "Copied to clipboard",
          description: "Rebalancing recommendations have been copied to your clipboard.",
        });
      } catch (_fallbackErr) {
        toast({
          title: "Copy failed",
          description: "Unable to copy to clipboard. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Download recommendations as CSV
  const handleDownloadCSV = () => {
    if (!plan) return;

    const rows: string[][] = [];

    // CSV Headers
    rows.push(["Category", "Symbol", "Name", "Action", "Shares", "Price", "Amount"]);

    // Data rows
    groupedRecommendations
      .filter((group) => {
        // Exclude Cash categories
        const isCashCategory =
          group.categoryId === "CASH" || group.categoryId === "CASH_BANK_DEPOSITS";
        if (isCashCategory) return false;

        const totalShares = group.recommendations.reduce((sum, r) => sum + r.shares, 0);
        return showZeroShares || totalShares > 0;
      })
      .forEach((group) => {
        group.recommendations
          .filter((rec) => showZeroShares || rec.shares > 0)
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .forEach((rec) => {
            rows.push([
              group.categoryName,
              rec.symbol,
              rec.name || rec.symbol,
              "BUY",
              rec.shares.toFixed(0),
              rec.pricePerShare.toFixed(2),
              rec.totalAmount.toFixed(2),
            ]);
          });
      });

    // Convert to CSV string
    const csvContent = rows
      .map((row) =>
        row
          .map((cell) => {
            // Escape cells containing comma, quote, or newline
            if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
              return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
          })
          .join(","),
      )
      .join("\n");

    // Create blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${new Date().toISOString().split("T")[0]}-rebalancing-suggestions.csv`,
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "CSV downloaded",
      description: "Rebalancing recommendations have been exported to CSV.",
    });
  };

  // Calculate category-level summaries using budgets from backend
  const categorySummaries = useMemo(() => {
    if (!plan || !deviationReport) return [];

    const summaries = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        targetPercent: number;
        currentPercent: number;
        suggestedBuy: number;
        newPercent: number;
        budget: number;
      }
    >();

    // Initialize from deviation report
    for (const deviation of deviationReport.deviations) {
      summaries.set(deviation.categoryId, {
        categoryId: deviation.categoryId,
        categoryName: deviation.categoryName,
        targetPercent: deviation.targetPercent,
        currentPercent: deviation.currentPercent,
        suggestedBuy: 0,
        newPercent: deviation.currentPercent,
        budget: 0,
      });
    }

    // Add budgets from backend
    for (const categoryBudget of plan.categoryBudgets) {
      const summary = summaries.get(categoryBudget.categoryId);
      if (summary) {
        summary.budget = categoryBudget.budget;
      }
    }

    // Add actual spending from recommendations
    for (const rec of plan.recommendations) {
      const summary = summaries.get(rec.categoryId);
      if (summary) {
        summary.suggestedBuy += rec.totalAmount;
      }
    }

    // Calculate new percentages
    const newTotalValue = deviationReport.totalValue + plan.totalAllocated;
    for (const summary of summaries.values()) {
      const deviation = deviationReport.deviations.find((d) => d.categoryId === summary.categoryId);
      if (deviation) {
        const newValue = deviation.currentValue + summary.suggestedBuy;
        summary.newPercent = newTotalValue > 0 ? (newValue / newTotalValue) * 100 : 0;
      }
    }

    return Array.from(summaries.values());
  }, [plan, deviationReport]);

  // Group recommendations by category (don't filter here - filter in render)
  const groupedRecommendations = useMemo(() => {
    if (!plan || !deviationReport) return [];

    const groups = new Map<string, typeof plan.recommendations>();

    for (const rec of plan.recommendations) {
      if (!groups.has(rec.categoryId)) {
        groups.set(rec.categoryId, []);
      }
      groups.get(rec.categoryId)!.push(rec);
    }

    return Array.from(groups.entries()).map(([categoryId, recommendations]) => {
      const totalAmount = recommendations.reduce((sum, r) => sum + r.totalAmount, 0);

      // Get budget for this category from categorySummaries
      const categoryBudget =
        categorySummaries.find((s) => s.categoryId === categoryId)?.budget || 0;

      // Residual = budget - actual spent
      const residualAmount = Math.max(0, categoryBudget - totalAmount);

      // Get color from deviation report
      const deviation = deviationReport.deviations.find((d) => d.categoryId === categoryId);
      const categoryColor = deviation?.color || "#888888";

      return {
        categoryId,
        categoryName: recommendations[0]?.categoryName || categoryId,
        categoryColor,
        recommendations: recommendations, // Keep ALL recommendations
        totalAmount,
        residualAmount,
      };
    });
  }, [plan, categorySummaries, deviationReport]);

  const newPortfolioValue = deviationReport
    ? deviationReport.totalValue + (plan?.totalAllocated || 0)
    : 0;

  // Check if we have a valid target with actual allocations
  const hasValidTarget = activeTarget && deviationReport && deviationReport.deviations.length > 0;

  if (!hasValidTarget) {
    return (
      <>
        {/* Account selector - Desktop */}
        <div className="pointer-events-auto fixed right-2 top-4 z-20 hidden md:block lg:right-4">
          <AccountSelector
            selectedAccount={selectedAccount}
            setSelectedAccount={onAccountChange}
            variant="dropdown"
            includePortfolio={true}
            className="h-9"
          />
        </div>
        {/* Account selector - Mobile */}
        <div className="mb-4 flex justify-end md:hidden">
          <AccountSelector
            selectedAccount={selectedAccount}
            setSelectedAccount={onAccountChange}
            variant="dropdown"
            includePortfolio={true}
            className="h-9"
          />
        </div>

        <div className="border-muted-foreground/30 bg-muted/20 rounded-lg border border-dashed p-8 text-center">
          <h3 className="mb-2 text-lg font-semibold">No allocation targets set</h3>
          <p className="text-muted-foreground text-sm">
            Go to the &apos;Allocation Overview&apos; tab to create allocation targets first, then
            return here to get rebalancing suggestions.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Account selector - Desktop */}
      <div className="pointer-events-auto fixed right-2 top-4 z-20 hidden md:block lg:right-4">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={onAccountChange}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>
      {/* Account selector - Mobile */}
      <div className="mb-4 flex justify-end md:hidden">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={onAccountChange}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Rebalancing Suggestions</h2>
            <p className="text-muted-foreground text-sm">
              Enter the cash amount you want to invest and get buy recommendations to reach your
              target allocation.
            </p>
          </div>
          {deviationReport && (
            <div className="text-right">
              <p className="text-muted-foreground text-sm">Current Portfolio Value</p>
              <p className="text-lg font-semibold">
                {formatAmount(deviationReport.totalValue, baseCurrency)}
              </p>
            </div>
          )}
        </div>

        {/* Input Section */}
        <div className="border-border bg-card space-y-4 rounded-lg border p-4">
          <div>
            <label htmlFor="available-cash" className="mb-3 block text-sm font-semibold">
              Available Cash to Invest
            </label>
            <div className="flex gap-2">
              <span className="text-muted-foreground flex items-center text-sm">
                {baseCurrency === "USD" ? "$" : baseCurrency}
              </span>
              <input
                id="available-cash"
                type="text"
                inputMode="decimal"
                value={availableCash}
                onChange={(e) => handleCashInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCalculate();
                  }
                }}
                placeholder="0.00"
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <Button
            onClick={handleCalculate}
            disabled={isCalculating || !availableCash || parseFloat(availableCash) <= 0}
            className="w-full"
          >
            {isCalculating ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Calculating...
              </>
            ) : (
              "Calculate Suggestions"
            )}
          </Button>
        </div>

        {/* Results Section - Allocation Plan */}
        {plan && plan.recommendations.length > 0 && (
          <div className="border-border bg-card space-y-4 rounded-lg border p-4">
            {/* Allocation Plan Header with View Toggle */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Allocation Plan</h3>
              {groupedRecommendations.some((g) => g.recommendations.length > 0) && (
                <div className="border-border bg-muted/30 inline-flex rounded-md border p-0.5">
                  <button
                    onClick={() => setViewMode("overview")}
                    className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                      viewMode === "overview"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setViewMode("detailed")}
                    className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                      viewMode === "detailed"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Detailed
                  </button>
                </div>
              )}
            </div>

            {/* Asset Class Cards - Always visible */}
            <div className="space-y-3">
              {categorySummaries.map((summary) => {
                const deviation = deviationReport?.deviations.find(
                  (d) => d.categoryId === summary.categoryId,
                );
                const categoryColor = deviation?.color || "#888888";

                // Check if category has holdings but no targets configured
                // Exclude Cash categories since they don't support holding-level targets
                const categoryGroup = groupedRecommendations.find(
                  (g) => g.categoryId === summary.categoryId,
                );
                const isCategoryLevelOnly =
                  categoryGroup?.recommendations.length === 1 &&
                  categoryGroup.recommendations[0].assetId === summary.categoryId &&
                  categoryGroup.recommendations[0].shares === 0;
                const isCashCategory =
                  summary.categoryId === "CASH" || summary.categoryId === "CASH_BANK_DEPOSITS";
                const hasHoldingsWithoutTargets =
                  summary.budget > 0 && isCategoryLevelOnly && !isCashCategory;

                return (
                  <div
                    key={summary.categoryId}
                    className="border-border/50 bg-muted/30 space-y-2 rounded-md border border-l-4 p-3"
                    style={{ borderLeftColor: categoryColor }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{summary.categoryName}</span>
                      <span className="text-muted-foreground text-sm">
                        {summary.targetPercent.toFixed(1)}% target
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current:</span>
                      <span>{summary.currentPercent.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Suggested Buy:</span>
                      <span className="text-success font-semibold">
                        {formatAmount(summary.suggestedBuy, baseCurrency)}
                      </span>
                    </div>
                    {hasHoldingsWithoutTargets && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                        <Icons.Info className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Configure holding targets in Overview tab for detailed suggestions
                        </span>
                      </div>
                    )}
                    <div className="text-muted-foreground flex justify-end text-xs">
                      Will adjust to {summary.newPercent.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary Section */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Total Allocated:</span>
                <span className="font-bold">{formatAmount(plan.totalAllocated, baseCurrency)}</span>
              </div>
              {plan.remainingCash > 0.01 && (
                <div className="flex justify-between">
                  <span className="text-sm">Remaining:</span>
                  <span className="font-bold text-orange-600 dark:text-orange-400">
                    {formatAmount(plan.remainingCash, baseCurrency)}
                  </span>
                </div>
              )}
              {plan.additionalCashNeeded > 0.01 && (
                <div className="flex justify-between">
                  <span className="text-sm">Additional cash needed:</span>
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    {formatAmount(plan.additionalCashNeeded, baseCurrency)}
                  </span>
                </div>
              )}
              <div className="text-muted-foreground flex justify-end text-xs">
                New portfolio amount: {formatAmount(newPortfolioValue, baseCurrency)}
              </div>
            </div>

            {/* Holding-Level Suggestions - Separate Section */}
            {viewMode === "detailed" &&
              groupedRecommendations.some((g) => g.recommendations.length > 0) && (
                <div className="border-border space-y-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold">
                        Holding-Level Suggestions (
                        {groupedRecommendations.reduce(
                          (sum, g) => sum + g.recommendations.length,
                          0,
                        )}
                        )
                      </h4>
                      <p className="text-muted-foreground text-xs">
                        Detailed per-holding buy suggestions based on cascading percentages
                      </p>
                    </div>
                    <button
                      onClick={() => setShowZeroShares(!showZeroShares)}
                      className={`rounded p-2 transition-colors ${
                        showZeroShares
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                      title={
                        showZeroShares ? "Hide zero-share holdings" : "Show zero-share holdings"
                      }
                    >
                      {showZeroShares ? (
                        <Icons.Eye className="h-4 w-4" />
                      ) : (
                        <Icons.EyeOff className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {groupedRecommendations
                    .filter((group) => {
                      // Exclude Cash categories - they don't support holding-level targets
                      const isCashCategory =
                        group.categoryId === "CASH" || group.categoryId === "CASH_BANK_DEPOSITS";
                      if (isCashCategory) return false;

                      // Filter out asset classes with 0 total shares unless toggle is on
                      const totalShares = group.recommendations.reduce(
                        (sum, r) => sum + r.shares,
                        0,
                      );
                      return showZeroShares || totalShares > 0;
                    })
                    .map((group) => (
                      <Collapsible key={group.categoryId} defaultOpen>
                        <div
                          className="border-border/50 bg-muted/20 space-y-2 rounded-md border border-l-4 p-3"
                          style={{ borderLeftColor: group.categoryColor }}
                        >
                          <CollapsibleTrigger className="group flex w-full items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Icons.ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                              <span className="font-semibold">{group.categoryName}</span>
                            </div>
                            <span className="text-success font-semibold">
                              Total: {formatAmount(group.totalAmount, baseCurrency)}
                            </span>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-1">
                            {group.recommendations
                              .filter((rec) => showZeroShares || rec.shares > 0)
                              .sort((a, b) => b.totalAmount - a.totalAmount)
                              .map((rec, idx) => (
                                <div
                                  key={`${rec.assetId}-${idx}`}
                                  className="bg-background/50 space-y-1 rounded px-2 py-1.5"
                                >
                                  <div className="grid grid-cols-[1fr_170px_80px] items-center gap-2 text-xs">
                                    <Link
                                      to={`/holdings/${encodeURIComponent(rec.assetId)}`}
                                      className="text-foreground truncate font-medium hover:underline"
                                    >
                                      {rec.name || rec.symbol}{" "}
                                      {rec.name && (
                                        <span className="text-muted-foreground">
                                          ({rec.symbol})
                                        </span>
                                      )}
                                    </Link>
                                    <span className="text-muted-foreground whitespace-nowrap font-mono text-[10px]">
                                      Shares: {rec.shares.toFixed(0)} ×{" "}
                                      {formatAmount(rec.pricePerShare, baseCurrency)}
                                    </span>
                                    <span className="text-success text-right font-semibold">
                                      {formatAmount(rec.totalAmount, baseCurrency)}
                                    </span>
                                  </div>
                                  <div className="text-muted-foreground flex items-center justify-between text-[10px]">
                                    <span className="truncate">
                                      Target: {rec.targetPercentOfClass.toFixed(1)}% of{" "}
                                      {group.categoryName}
                                    </span>
                                    <span className="ml-2 whitespace-nowrap">
                                      {rec.currentPercentOfClass.toFixed(1)}% →{" "}
                                      {rec.targetPercentOfClass.toFixed(1)}% of {group.categoryName}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            {/* Category residual at the end */}
                            {group.residualAmount > 0.01 && (
                              <p className="text-muted-foreground mt-2 text-xs italic">
                                Residual (can&apos;t buy whole shares):{" "}
                                {formatAmount(group.residualAmount, baseCurrency)}
                              </p>
                            )}
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}
                </div>
              )}

            {/* Export Buttons */}
            <div className="border-border flex gap-2 border-t pt-2">
              <Button variant="outline" onClick={handleCopyToClipboard} disabled={!plan}>
                <Icons.Copy className="mr-2 h-4 w-4" />
                Copy Text
              </Button>
              <Button variant="outline" onClick={handleDownloadCSV} disabled={!plan}>
                <Icons.Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
