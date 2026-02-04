import { AssetClassTarget } from "@/lib/types";
import { Button } from "@wealthfolio/ui";
import { Copy, Download } from "lucide-react";
import { useState } from "react";
import { AssetClassComposition } from "../hooks/use-current-allocation";

interface RebalancingAdvisorProps {
  targets: AssetClassTarget[];
  composition: AssetClassComposition[];
  totalPortfolioValue: number;
  isLoading?: boolean;
  baseCurrency?: string; // ← NEW
}

interface AllocationSuggestion {
  assetClass: string;
  targetPercent: number;
  currentPercent: number;
  shortfallPercent: number;
  shortfallAmount: number;
  suggestedBuy: number;
}

export function RebalancingAdvisor({
  targets,
  composition,
  totalPortfolioValue,
  isLoading = false,
  baseCurrency = "USD", // ← NEW: Default to USD
}: RebalancingAdvisorProps) {
  const [availableCash, setAvailableCash] = useState<number>(0);
  const [suggestions, setSuggestions] = useState<AllocationSuggestion[]>([]);

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
    let totalSuggestedAllocation = 0;

    // Calculate shortfall for each asset class
    targets.forEach((target) => {
      const comp = composition.find((c) => c.assetClass === target.assetClass);
      const currentValue = (comp?.actualPercent || 0) * (totalPortfolioValue / 100);
      const targetValue = (target.targetPercent / 100) * newPortfolioTotal;
      const shortfallAmount = Math.max(0, targetValue - currentValue);

      // Track how much we're suggesting to allocate
      totalSuggestedAllocation += shortfallAmount;

      newSuggestions.push({
        assetClass: target.assetClass,
        targetPercent: target.targetPercent,
        currentPercent: comp?.actualPercent || 0,
        shortfallPercent: (shortfallAmount / newPortfolioTotal) * 100,
        shortfallAmount,
        suggestedBuy: shortfallAmount,
      });
    });

    // Now proportionally reduce suggestions if total > availableCash
    // (User can't allocate more than they have)
    if (totalSuggestedAllocation > availableCash + 0.01) {
      const scaleFactor = availableCash / totalSuggestedAllocation;
      newSuggestions.forEach((s) => {
        s.suggestedBuy = s.suggestedBuy * scaleFactor;
        s.shortfallPercent = (s.suggestedBuy / newPortfolioTotal) * 100;
      });
    }

    setSuggestions(newSuggestions);
  };

  const totalSuggested = suggestions.reduce((sum, s) => sum + s.suggestedBuy, 0);
  const remaining = availableCash - totalSuggested;

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

    suggestions.forEach((s) => {
      text += `${s.assetClass}\n`;
      text += `  Target: ${s.targetPercent.toFixed(1)}% | Current: ${s.currentPercent.toFixed(1)}%\n`;
      text += `  Suggested Buy: ${formatCurrency(s.suggestedBuy)}\n\n`;
    });

    if (remaining > 0.01) {
      text += `Remaining (unallocated): ${formatCurrency(remaining)}\n`;
    }

    return text;
  };

  const generateCSV = (): string => {
    let csv = "Asset Class,Target %,Current %,Suggested Buy,Shortfall %\n";
    suggestions.forEach((s) => {
      csv += `${s.assetClass},${s.targetPercent.toFixed(1)},${s.currentPercent.toFixed(1)},${formatCurrency(s.suggestedBuy)},${s.shortfallPercent.toFixed(1)}\n`;
    });
    return csv;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Rebalancing Suggestions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter available cash to see how to allocate it to reach your targets.
        </p>
      </div>

      {/* Input Section */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground">Available Cash to Invest</label>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm font-medium text-muted-foreground">
              {baseCurrency === "USD" ? "$" : baseCurrency}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={availableCash}
              onChange={(e) => setAvailableCash(parseFloat(e.target.value) || 0)}
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
            <div className="text-sm text-muted-foreground">
              New Portfolio: {formatCurrency(totalPortfolioValue + availableCash)}
            </div>
          </div>

          {/* Suggestions Table */}
          <div className="space-y-3">
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
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(suggestion.suggestedBuy)}
                  </span>
                </div>

                {suggestion.suggestedBuy > 0 && (
                  <div className="text-xs text-muted-foreground pt-1 border-t border-border/30">
                    {(() => {
                      const newPercent = ((suggestion.currentPercent * totalPortfolioValue + suggestion.suggestedBuy) / (totalPortfolioValue + availableCash)) * 100;
                      return `Will adjust ${suggestion.assetClass} to ${newPercent.toFixed(1)}%`;
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="border-t border-border pt-3 space-y-2">
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
          </div>

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
      {suggestions.length === 0 && availableCash > 0 && (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Enter your available cash above and click "Calculate Suggestions"
          </p>
        </div>
      )}
    </div>
  );
}
