import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { EmptyPlaceholder } from "@wealthfolio/ui";

import type { Account, PortfolioTarget, DeviationReport, RebalancingPlan } from "@/lib/types";
import { calculateRebalancingPlan } from "@/adapters";
import { formatCurrency } from "@/lib/utils";

interface RebalancingTabProps {
  selectedAccount: Account;
  activeTarget: PortfolioTarget | null;
  deviationReport: DeviationReport | null;
  baseCurrency: string;
}

export function RebalancingTab({
  selectedAccount,
  activeTarget,
  deviationReport,
  baseCurrency,
}: RebalancingTabProps) {
  const [availableCash, setAvailableCash] = useState<string>("");
  const [plan, setPlan] = useState<RebalancingPlan | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [viewMode, setViewMode] = useState<"overview" | "detailed">("overview");
  const [showZeroShares, setShowZeroShares] = useState(false);

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

  // Group recommendations by category
  const groupedRecommendations = useMemo(() => {
    if (!plan) return [];

    const groups = new Map<string, typeof plan.recommendations>();

    for (const rec of plan.recommendations) {
      if (!groups.has(rec.categoryId)) {
        groups.set(rec.categoryId, []);
      }
      groups.get(rec.categoryId)!.push(rec);
    }

    return Array.from(groups.entries()).map(([categoryId, recommendations]) => ({
      categoryId,
      categoryName: recommendations[0]?.categoryName || categoryId,
      recommendations: showZeroShares
        ? recommendations
        : recommendations.filter((r) => r.shares > 0),
    }));
  }, [plan, showZeroShares]);

  // Calculate category-level summaries for overview
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
      });
    }

    // Add suggested buys from recommendations
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

  if (!activeTarget) {
    return (
      <div className="flex items-center justify-center py-16">
        <EmptyPlaceholder
          icon={<Icons.Target className="text-muted-foreground h-10 w-10" />}
          title="No Active Target"
          description="Create or activate a target allocation to use the rebalancing advisor."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>Rebalancing Calculator</CardTitle>
          {deviationReport && (
            <p className="text-muted-foreground text-sm">
              Current Portfolio Value: {formatCurrency(deviationReport.totalValue, baseCurrency)}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="available-cash">Available Cash to Invest</Label>
            <div className="flex gap-2">
              <Input
                id="available-cash"
                type="number"
                min="0"
                step="100"
                value={availableCash}
                onChange={(e) => setAvailableCash(e.target.value)}
                placeholder="Enter amount"
                className="flex-1"
              />
              <Button
                onClick={handleCalculate}
                disabled={isCalculating || !availableCash || parseFloat(availableCash) <= 0}
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
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      {plan && (
        <>
          {/* View Mode Toggle */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="detailed">Detailed</TabsTrigger>
              </TabsList>

              {viewMode === "detailed" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showZeroShares}
                    onChange={(e) => setShowZeroShares(e.target.checked)}
                    className="rounded"
                  />
                  Show zero-share holdings
                </label>
              )}
            </div>

            {/* Overview Mode */}
            <TabsContent value="overview" className="space-y-4">
              {categorySummaries.map((summary) => (
                <Card key={summary.categoryId}>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{summary.categoryName}</h3>
                        <span className="text-muted-foreground text-sm">
                          Target {summary.targetPercent.toFixed(1)}%
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Current</p>
                          <p className="font-medium">{summary.currentPercent.toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Suggested Buy</p>
                          <p className="font-medium">
                            {formatCurrency(summary.suggestedBuy, baseCurrency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">New</p>
                          <p className="font-medium">{summary.newPercent.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* Detailed Mode */}
            <TabsContent value="detailed" className="space-y-4">
              {groupedRecommendations.map((group) => (
                <Card key={group.categoryId}>
                  <CardHeader>
                    <CardTitle className="text-base">{group.categoryName}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {group.recommendations.map((rec, idx) => (
                        <div
                          key={`${rec.assetId}-${idx}`}
                          className="flex items-center justify-between border-b py-2 last:border-0"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{rec.symbol}</p>
                            {rec.name && (
                              <p className="text-muted-foreground text-sm">{rec.name}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-medium">
                              {rec.shares.toFixed(0)} shares ×{" "}
                              {formatCurrency(rec.pricePerShare, baseCurrency)}
                            </p>
                            <p className="text-muted-foreground text-sm">
                              = {formatCurrency(rec.totalAmount, baseCurrency)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>

          {/* Summary Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <p className="text-muted-foreground text-sm">Total Allocated</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(plan.totalAllocated, baseCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Remaining Cash</p>
                  <p className="text-lg font-semibold text-orange-600">
                    {formatCurrency(plan.remainingCash, baseCurrency)}
                  </p>
                </div>
                {plan.additionalCashNeeded > 0 && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-sm">Additional Cash Needed</p>
                    <p className="text-lg font-semibold text-yellow-600">
                      {formatCurrency(plan.additionalCashNeeded, baseCurrency)}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Export Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                // TODO: Implement copy to clipboard
                console.log("Copy to clipboard");
              }}
            >
              <Icons.Copy className="mr-2 h-4 w-4" />
              Copy as Text
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // TODO: Implement CSV download
                console.log("Download CSV");
              }}
            >
              <Icons.Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
