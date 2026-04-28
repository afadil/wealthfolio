import { useState, useMemo, useEffect, Fragment } from "react";
import { Link } from "react-router-dom";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { formatAmount } from "@wealthfolio/ui";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { cn } from "@wealthfolio/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";

import type { Account, PortfolioTarget, DeviationReport, RebalancingPlan } from "@/lib/types";
import { calculateRebalancingPlan } from "@/adapters";
import { AccountSelector } from "@/components/account-selector";

type SortKey = "class" | "asset" | "action" | "shares" | "price" | "amount";
type SortDir = "asc" | "desc";

interface RebalancingTabProps {
  selectedAccount: Account;
  onAccountChange: (account: Account) => void;
  activeTarget: PortfolioTarget | null;
  deviationReport: DeviationReport | null;
  baseCurrency: string;
}

// indicator | class | asset | action | shares | price | amount
const TRADE_TABLE_COLS = "28px 120px 1fr 72px 72px 88px 104px";

export function RebalancingTab({
  selectedAccount,
  onAccountChange,
  activeTarget,
  deviationReport,
  baseCurrency,
}: RebalancingTabProps) {
  const storageKey = `rebalancing-${selectedAccount.id}`;

  const [availableCash, setAvailableCash] = useState<string>(() => {
    return sessionStorage.getItem(`${storageKey}-cash`) || "";
  });

  const [plan, setPlan] = useState<RebalancingPlan | null>(() => {
    const stored = sessionStorage.getItem(`${storageKey}-plan`);
    return stored ? (JSON.parse(stored) as RebalancingPlan) : null;
  });

  const [isCalculating, setIsCalculating] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [showZeroShares, setShowZeroShares] = useState(false);
  const [calculatedAt, setCalculatedAt] = useState<number | null>(() => {
    const stored = sessionStorage.getItem(`${storageKey}-calculatedAt`);
    return stored ? parseInt(stored) : null;
  });
  const [prevAccountId, setPrevAccountId] = useState(selectedAccount.id);

  useEffect(() => {
    if (selectedAccount.id !== prevAccountId) {
      const storedCash = sessionStorage.getItem(`${storageKey}-cash`);
      const storedPlan = sessionStorage.getItem(`${storageKey}-plan`);
      const storedCalcAt = sessionStorage.getItem(`${storageKey}-calculatedAt`);
      setAvailableCash(storedCash || "");
      setPlan(storedPlan ? (JSON.parse(storedPlan) as RebalancingPlan) : null);
      setCalculatedAt(storedCalcAt ? parseInt(storedCalcAt) : null);
      setPrevAccountId(selectedAccount.id);
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith("rebalancing-") && !key.startsWith(storageKey)) {
          sessionStorage.removeItem(key);
        }
      });
    }
  }, [selectedAccount.id, prevAccountId, storageKey]);

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

  useEffect(() => {
    if (calculatedAt) {
      sessionStorage.setItem(`${storageKey}-calculatedAt`, calculatedAt.toString());
    } else {
      sessionStorage.removeItem(`${storageKey}-calculatedAt`);
    }
  }, [calculatedAt, storageKey]);

  const handleCalculate = async () => {
    if (!activeTarget || !availableCash || parseFloat(availableCash) <= 0) return;
    setIsCalculating(true);
    try {
      const result = await calculateRebalancingPlan({
        targetId: activeTarget.id,
        availableCash: parseFloat(availableCash),
        baseCurrency,
      });
      setPlan(result);
      setCalculatedAt(Date.now());
    } catch (error) {
      console.error("Failed to calculate rebalancing plan:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleCashInputChange = (value: string) => {
    let sanitized = value.replace(/[^\d.]/g, "");
    const parts = sanitized.split(".");
    if (parts.length > 2) sanitized = parts[0] + "." + parts.slice(1).join("");
    if (parts.length === 2 && parts[1].length > 2)
      sanitized = parts[0] + "." + parts[1].substring(0, 2);
    if (sanitized.length > 1 && sanitized.startsWith("0") && !sanitized.startsWith("0."))
      sanitized = sanitized.replace(/^0+/, "");
    setAvailableCash(sanitized);
  };

  const categorySummaries = useMemo(() => {
    if (!plan || !deviationReport) return [];

    const summaries = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        color: string;
        currentPercent: number;
        suggestedBuy: number;
        newPercent: number;
        budget: number;
        hasNoHoldingTargets: boolean;
        hasPartialHoldingTargets: boolean;
      }
    >();

    for (const d of deviationReport.deviations) {
      summaries.set(d.categoryId, {
        categoryId: d.categoryId,
        categoryName: d.categoryName,
        color: d.color,
        currentPercent: d.currentPercent,
        suggestedBuy: 0,
        newPercent: d.currentPercent,
        budget: 0,
        hasNoHoldingTargets: false,
        hasPartialHoldingTargets: false,
      });
    }

    for (const cb of plan.categoryBudgets) {
      const s = summaries.get(cb.categoryId);
      if (s) {
        s.budget = cb.budget;
        s.hasPartialHoldingTargets = cb.hasPartialTargets;
      }
    }

    for (const rec of plan.recommendations) {
      if (rec.action === "SELL") continue;
      const s = summaries.get(rec.categoryId);
      if (s) s.suggestedBuy += rec.totalAmount;
    }

    const newTotal = deviationReport.totalValue + plan.totalAllocated;
    for (const s of summaries.values()) {
      const dev = deviationReport.deviations.find((d) => d.categoryId === s.categoryId);
      if (dev) {
        s.newPercent = newTotal > 0 ? ((dev.currentValue + s.suggestedBuy) / newTotal) * 100 : 0;
      }
      // Category-level placeholder: backend emits a single rec with assetId === categoryId
      const isCash = s.categoryId === "CASH" || s.categoryId === "CASH_BANK_DEPOSITS";
      if (!isCash && s.budget > 0) {
        const categoryRecs = plan.recommendations.filter(
          (r) => r.categoryId === s.categoryId && r.action !== "SELL",
        );
        s.hasNoHoldingTargets =
          categoryRecs.length === 1 && categoryRecs[0].assetId === categoryRecs[0].categoryId;
      }
    }

    return Array.from(summaries.values()).filter((s) => s.budget > 0);
  }, [plan, deviationReport]);

  const flatRows = useMemo(() => {
    if (!plan) return [];
    const rows = [...plan.recommendations];
    if (!sortKey) return rows;
    return rows.sort((a, b) => {
      if (sortKey === "class") {
        const cmp = a.categoryName.localeCompare(b.categoryName);
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (sortKey === "asset") {
        const cmp = a.symbol.localeCompare(b.symbol);
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (sortKey === "action") {
        const cmp = a.action.localeCompare(b.action);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const av =
        sortKey === "amount" ? a.totalAmount : sortKey === "shares" ? a.shares : a.pricePerShare;
      const bv =
        sortKey === "amount" ? b.totalAmount : sortKey === "shares" ? b.shares : b.pricePerShare;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [plan, sortKey, sortDir]);

  // Hide zero-share BUY rows by default (budget too small for 1 full share)
  // BUT always keep category-level budget rows visible so the total adds up
  const visibleRows = useMemo(() => {
    if (showZeroShares) return flatRows;
    return flatRows.filter((r) => {
      if (r.shares > 0 || r.action === "SELL") return true;
      // Category-level rec (assetId === categoryId): always show, it contributes to Total Deployed
      const isCategoryLevel =
        r.assetId === r.categoryId &&
        r.categoryId !== "CASH" &&
        r.categoryId !== "CASH_BANK_DEPOSITS";
      return isCategoryLevel;
    });
  }, [flatRows, showZeroShares]);

  const handleSortColumn = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "desc") {
        setSortDir("asc");
      } else {
        setSortKey(null);
        setSortDir("desc");
      }
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const cashOverweight = useMemo(() => {
    if (!plan) return 0;
    const cashDev = deviationReport?.deviations.find(
      (d) => d.categoryId === "CASH" || d.categoryId === "CASH_BANK_DEPOSITS",
    );
    return cashDev && cashDev.deviationPercent > 0
      ? Math.max(0, cashDev.currentValue - cashDev.targetValue)
      : 0;
  }, [plan, deviationReport]);

  const totalResidual = useMemo(() => {
    if (!plan) return 0;
    return plan.recommendations
      .filter((r) => r.action !== "SELL")
      .reduce((sum, r) => sum + r.residualAmount, 0);
  }, [plan]);

  const newPortfolioValue = deviationReport
    ? deviationReport.totalValue + (plan?.totalAllocated ?? 0)
    : 0;

  const handleCopyToClipboard = async () => {
    if (!plan) return;
    const lines: string[] = ["TRADE LIST\n"];
    for (const rec of flatRows) {
      if (rec.shares === 0 && rec.action !== "SELL") continue;
      const sign = rec.action === "SELL" ? "−" : "+";
      lines.push(
        `${rec.action} ${rec.shares.toFixed(0)} shares of ${rec.name || rec.symbol} (${rec.symbol}) at ${formatAmount(rec.pricePerShare, baseCurrency)} = ${sign}${formatAmount(rec.totalAmount, baseCurrency)}`,
      );
      lines.push(`  [${rec.categoryName}]`);
    }
    lines.push(`\nSUMMARY`);
    lines.push(`Total Deployed: ${formatAmount(plan.totalAllocated, baseCurrency)}`);
    if (plan.remainingCash > 0.01)
      lines.push(`Remaining: ${formatAmount(plan.remainingCash, baseCurrency)}`);
    lines.push(`New Portfolio: ${formatAmount(newPortfolioValue, baseCurrency)}`);

    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast({ title: "Copied to clipboard" });
      } catch {
        toast({ title: "Copy failed", variant: "destructive" });
      }
    }
  };

  const handleDownloadCSV = () => {
    if (!plan) return;
    const rows: string[][] = [
      ["Category", "Symbol", "Name", "Action", "Shares", "Price", "Amount"],
    ];
    for (const rec of flatRows) {
      rows.push([
        rec.categoryName,
        rec.symbol,
        rec.name || rec.symbol,
        rec.action,
        rec.shares.toFixed(0),
        rec.pricePerShare.toFixed(2),
        rec.totalAmount.toFixed(2),
      ]);
    }
    const csvContent = rows
      .map((row) =>
        row
          .map((cell) =>
            cell.includes(",") || cell.includes('"') || cell.includes("\n")
              ? `"${cell.replace(/"/g, '""')}"`
              : cell,
          )
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `${new Date().toISOString().split("T")[0]}-rebalancing.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "CSV downloaded" });
  };

  const hasValidTarget = activeTarget && deviationReport && deviationReport.deviations.length > 0;

  const accountSelector = (
    <>
      <div className="pointer-events-auto fixed right-2 top-4 z-20 hidden md:block lg:right-4">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={onAccountChange}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>
      <div className="mb-4 flex justify-end md:hidden">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={onAccountChange}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>
    </>
  );

  if (!hasValidTarget) {
    return (
      <>
        {accountSelector}
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
      {accountSelector}

      {/* ── TOP HEADER STRIP (mirrors HealthStrip in Overview) ── */}
      <div className="mb-4 flex items-stretch divide-x overflow-hidden rounded-lg border">
        <div className="w-[320px] shrink-0 px-4 py-3">
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
            Portfolio Value
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {formatAmount(deviationReport.totalValue, baseCurrency)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">total</p>
        </div>
        <div className="flex flex-1 flex-col justify-center px-4 py-3">
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
            Rebalance Mode
          </p>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                activeTarget.rebalanceMode === "buy_and_sell"
                  ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  : "bg-green-500/10 text-green-600 dark:text-green-400",
              )}
            >
              {activeTarget.rebalanceMode === "buy_only" ? "Buy only" : "Buy & Sell"}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {activeTarget.rebalanceMode === "buy_and_sell"
              ? "Overweight positions will be sold and proceeds redeployed"
              : "Only purchases will be suggested"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 overflow-hidden rounded-lg border md:grid-cols-[320px_1fr]">
        {/* ── LEFT PANEL ── */}
        <div className="flex flex-col border-b md:border-b-0 md:border-r">
          {/* Allocation context table */}
          <div className="px-5 py-4">
            <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider">
              Current Allocation
            </p>
            <table className="w-full">
              <thead>
                <tr>
                  {["Class", "Actual", "Target", "Drift"].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "text-muted-foreground pb-1.5 text-[10px] font-medium",
                        i === 0 ? "text-left" : "text-right",
                        i < 3 ? "pr-2" : "",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deviationReport.deviations.map((d) => {
                  const abs = Math.abs(d.deviationPercent);
                  const driftColor =
                    abs < 1
                      ? "text-green-600 dark:text-green-400"
                      : abs < 5
                        ? "text-yellow-600 dark:text-yellow-500"
                        : "text-red-600 dark:text-red-400";
                  return (
                    <tr key={d.categoryId} className="border-t">
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-sm"
                            style={{ backgroundColor: d.color }}
                          />
                          <span className="text-sm font-medium">{d.categoryName}</span>
                        </div>
                      </td>
                      <td className="pr-2 text-right font-mono text-xs">
                        {d.currentPercent.toFixed(1)}%
                      </td>
                      <td className="text-muted-foreground pr-2 text-right font-mono text-xs">
                        {d.targetPercent.toFixed(1)}%
                      </td>
                      <td className={cn("text-right font-mono text-xs font-semibold", driftColor)}>
                        {d.deviationPercent > 0 ? "+" : ""}
                        {d.deviationPercent.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cash overweight note */}
          {cashOverweight > 0.01 && (
            <div className="mx-5 mb-4 rounded-md border border-yellow-500/25 bg-yellow-500/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-yellow-600 dark:text-yellow-500">
                Cash overweight
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold">
                {formatAmount(cashOverweight, baseCurrency)} above target
              </p>
              <p className="text-muted-foreground mt-1 text-xs">Consider redeploying gradually</p>
            </div>
          )}

          <div className="flex-1" />

          {/* Cash input + calculate */}
          <div className="border-t px-5 py-4">
            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
              {activeTarget.rebalanceMode === "buy_and_sell"
                ? "Additional Cash to Invest"
                : "Available Cash"}
            </p>
            <div className="mb-3 flex overflow-hidden rounded-md border">
              <span className="bg-muted text-muted-foreground flex items-center border-r px-3 font-mono text-xs">
                {baseCurrency}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={availableCash}
                onChange={(e) => handleCashInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCalculate();
                }}
                placeholder="0.00"
                className="bg-background flex-1 px-3 py-2.5 font-mono text-base font-bold outline-none"
              />
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
              ) : plan ? (
                "Recalculate"
              ) : (
                "Calculate Suggestions"
              )}
            </Button>
            {calculatedAt && (
              <p className="text-muted-foreground/50 mt-2 text-center font-mono text-[10px]">
                Calculated at{" "}
                {new Date(calculatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex min-w-0 flex-col">
          {/* Header */}
          <div className="flex items-center border-b px-5 py-4">
            <h3 className="font-semibold">Trade List</h3>
            {plan && (
              <span className="text-muted-foreground ml-2 text-sm">
                · {visibleRows.length} orders
                {!showZeroShares && flatRows.length > visibleRows.length && (
                  <span className="ml-1 opacity-60">
                    ({flatRows.length - visibleRows.length} hidden)
                  </span>
                )}
              </span>
            )}
            {plan && (
              <button
                onClick={() => setShowZeroShares((v) => !v)}
                className={cn(
                  "ml-auto rounded p-1.5 transition-colors",
                  showZeroShares
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={
                  showZeroShares
                    ? "Hide suggestions with 0 shares"
                    : "Show all suggestions (including 0 shares)"
                }
              >
                {showZeroShares ? (
                  <Icons.Eye className="h-4 w-4" />
                ) : (
                  <Icons.EyeOff className="h-4 w-4" />
                )}
              </button>
            )}
          </div>

          {!plan ? (
            <div className="flex min-h-[400px] flex-1 flex-col items-center justify-center gap-2 text-center">
              <Icons.ArrowLeftRight className="text-muted-foreground h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                Enter cash and calculate to see trade list
              </p>
            </div>
          ) : (
            <>
              {/* Category summary strip */}
              {categorySummaries.length > 0 && (
                <div className="border-b px-5 py-3">
                  <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider">
                    Allocation Changes
                  </p>
                  {/* Flat grid: dot | name | current→after (right) | spacer | to invest (right) */}
                  <div
                    className="grid items-center gap-x-4 gap-y-2"
                    style={{ gridTemplateColumns: "8px auto 160px 1fr auto" }}
                  >
                    {/* Column headers */}
                    <div />
                    <div className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                      Class
                    </div>
                    <div className="text-muted-foreground text-right text-[10px] font-medium uppercase tracking-wider">
                      Current → After
                    </div>
                    <div />
                    <div className="text-muted-foreground text-right text-[10px] font-medium uppercase tracking-wider">
                      To Invest
                    </div>

                    {/* Data rows */}
                    {categorySummaries.map((s) => (
                      <Fragment key={s.categoryId}>
                        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">{s.categoryName}</span>
                          {s.hasNoHoldingTargets && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Icons.Info className="h-3 w-3 text-orange-600 dark:text-orange-500" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>
                                  No holding-level targets — budget is reserved but no specific
                                  trades can be suggested. Configure holding targets in the Overview
                                  tab.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {s.hasPartialHoldingTargets && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Icons.Info className="h-3 w-3 text-yellow-600 dark:text-yellow-500" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>
                                  Some holdings in this class have no target set — the rebalancing
                                  budget is concentrated on targeted holdings only. Untargeted
                                  holdings are excluded.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="text-muted-foreground text-right font-mono text-xs">
                          {s.currentPercent.toFixed(1)}%<span className="mx-1">→</span>
                          <span style={{ color: s.color }} className="font-semibold">
                            {s.newPercent.toFixed(1)}%
                          </span>
                        </div>
                        <div />
                        <div className="text-right font-mono font-bold text-green-600 dark:text-green-400">
                          +{formatAmount(s.budget, baseCurrency)}
                        </div>
                      </Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* Sortable column headers */}
              <div
                className="bg-background sticky top-0 z-10 grid items-center border-b px-5 py-3"
                style={{ gridTemplateColumns: TRADE_TABLE_COLS }}
              >
                <div />
                {(
                  [
                    { key: "class" as SortKey, label: "Class", align: "left", colClass: "" },
                    { key: "asset" as SortKey, label: "Asset", align: "left", colClass: "" },
                    {
                      key: "action" as SortKey,
                      label: "Action",
                      align: "center",
                      colClass: "pr-6",
                    },
                    { key: "shares" as SortKey, label: "Shares", align: "center", colClass: "" },
                    { key: "price" as SortKey, label: "Price", align: "right", colClass: "" },
                    { key: "amount" as SortKey, label: "Amount", align: "right", colClass: "" },
                  ] as Array<{
                    key: SortKey;
                    label: string;
                    align: string;
                    noSort?: boolean;
                    colClass: string;
                  }>
                ).map((col) =>
                  col.noSort ? (
                    <div
                      key={col.label}
                      className={cn(
                        "text-muted-foreground text-xs font-medium uppercase tracking-wider",
                        col.align === "center" && "text-center",
                        col.align === "right" && "text-right",
                        col.colClass,
                      )}
                    >
                      {col.label}
                    </div>
                  ) : (
                    <button
                      key={col.key + col.label}
                      onClick={() => handleSortColumn(col.key)}
                      className={cn(
                        "flex items-center gap-1 text-xs font-medium uppercase tracking-wider",
                        col.align === "right"
                          ? "justify-end"
                          : col.align === "center"
                            ? "justify-center"
                            : "justify-start",
                        sortKey === col.key
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                        col.colClass,
                      )}
                    >
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === "desc" ? (
                          <Icons.ChevronDown className="h-3 w-3" />
                        ) : (
                          <Icons.ChevronUp className="h-3 w-3" />
                        )
                      ) : (
                        <Icons.ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ),
                )}
              </div>

              {/* Trade rows */}
              {visibleRows.map((rec, idx) => {
                const isSell = rec.action === "SELL";
                const isCash = rec.categoryId === "CASH" || rec.categoryId === "CASH_BANK_DEPOSITS";
                // Category-level rec: assetId === categoryId, no holding targets configured
                const isCategoryLevel = !isCash && rec.assetId === rec.categoryId;

                const badgeLabel = isCategoryLevel
                  ? "BUDGET"
                  : isCash
                    ? isSell
                      ? "DEPLOY"
                      : "SAVE"
                    : rec.action;
                const badgeClass = isCategoryLevel
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-500"
                  : isCash
                    ? "bg-muted text-muted-foreground"
                    : isSell
                      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                      : "bg-green-500/10 text-green-600 dark:text-green-400";
                const indicatorClass = isCategoryLevel
                  ? "bg-amber-500/60"
                  : isCash
                    ? "bg-muted-foreground/40"
                    : isSell
                      ? "bg-orange-500"
                      : "bg-green-500";
                const amountColor = isCategoryLevel
                  ? "text-amber-600 dark:text-amber-500"
                  : isCash
                    ? "text-muted-foreground"
                    : isSell
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-green-600 dark:text-green-400";
                const dev = deviationReport.deviations.find((d) => d.categoryId === rec.categoryId);
                const catColor = dev?.color ?? "#888888";
                const isHovered = hoveredAssetId === rec.assetId;
                const isDimmed = hoveredAssetId !== null && hoveredAssetId !== rec.assetId;

                return (
                  <div
                    key={`${rec.assetId}-${idx}`}
                    className={cn(
                      "grid items-center border-b px-5 py-3 transition-all",
                      isDimmed ? "opacity-40" : "opacity-100",
                      isHovered ? "bg-black/[.03] dark:bg-white/[.03]" : "",
                    )}
                    style={{ gridTemplateColumns: TRADE_TABLE_COLS }}
                    onMouseEnter={() => setHoveredAssetId(rec.assetId)}
                    onMouseLeave={() => setHoveredAssetId(null)}
                  >
                    {/* Indicator bar */}
                    <div className={cn("h-5 w-0.5 rounded-full", indicatorClass)} />

                    {/* Class */}
                    <div className="flex items-center gap-2 overflow-hidden pr-3">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: catColor }}
                      />
                      <span className="text-muted-foreground truncate text-xs">
                        {rec.categoryName}
                      </span>
                    </div>

                    {/* Asset — symbol + name + class % sub-line */}
                    <div className="flex min-w-0 flex-col justify-center gap-0.5 pr-2">
                      <Link
                        to={`/holdings/${encodeURIComponent(rec.assetId)}`}
                        className="flex min-w-0 items-center gap-1.5 hover:underline"
                      >
                        <span className="shrink-0 font-mono text-xs font-bold">{rec.symbol}</span>
                        <span className="text-muted-foreground truncate text-xs">
                          {rec.name || ""}
                        </span>
                      </Link>
                      {isCategoryLevel ? (
                        <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70">
                          No holding targets set — budget reserved but no specific trades can be
                          suggested. Configure holding targets in the Overview tab.
                        </p>
                      ) : (
                        !isCash &&
                        rec.targetPercentOfClass > 0 && (
                          <p className="text-muted-foreground/60 font-mono text-[10px]">
                            {rec.currentPercentOfClass.toFixed(1)}%<span className="mx-1">→</span>
                            {rec.targetPercentOfClass.toFixed(1)}%
                            <span className="ml-1 opacity-50">within class</span>
                          </p>
                        )
                      )}
                    </div>

                    {/* Action badge — same pr-6 as header to stay aligned */}
                    <div className="flex items-center justify-center pr-6">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          badgeClass,
                        )}
                      >
                        {badgeLabel}
                      </span>
                    </div>

                    {/* Shares */}
                    <div className="text-muted-foreground text-center font-mono text-sm font-semibold">
                      {isCategoryLevel ? "—" : rec.shares.toFixed(0)}
                    </div>

                    {/* Price */}
                    <div className="text-muted-foreground text-right font-mono text-sm">
                      {isCategoryLevel ? "—" : formatAmount(rec.pricePerShare, baseCurrency)}
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                      <p className={cn("font-mono text-sm font-bold", amountColor)}>
                        {isSell && !isCash ? "−" : "+"}
                        {formatAmount(rec.totalAmount, baseCurrency)}
                      </p>
                      {rec.residualAmount > 0.01 && (
                        <p className="text-muted-foreground font-mono text-[10px]">
                          +{formatAmount(rec.residualAmount, baseCurrency)} res.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Buy & Sell circuit — only shown when sells fund the buys */}
              {activeTarget.rebalanceMode === "buy_and_sell" && plan.totalSellAmount > 0.01 && (
                <div className="flex items-center gap-2 border-t border-dashed px-5 py-2.5 text-xs">
                  <span className="text-muted-foreground">Sell proceeds</span>
                  <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">
                    {formatAmount(plan.totalSellAmount, baseCurrency)}
                  </span>
                  <span className="text-muted-foreground">+</span>
                  <span className="text-muted-foreground">new cash</span>
                  <span className="font-mono font-semibold">
                    {formatAmount(plan.availableCash, baseCurrency)}
                  </span>
                  <span className="text-muted-foreground">=</span>
                  <span className="text-muted-foreground">available</span>
                  <span className="font-mono font-semibold">
                    {formatAmount(plan.totalSellAmount + plan.availableCash, baseCurrency)}
                  </span>
                </div>
              )}

              {/* Footer stats */}
              <div className="flex flex-wrap items-center gap-8 border-t px-5 py-4">
                <div>
                  <p className="text-muted-foreground mb-0.5 text-xs uppercase tracking-wider">
                    Total Deployed
                  </p>
                  <p className="font-mono text-base font-bold">
                    {formatAmount(plan.totalAllocated, baseCurrency)}
                  </p>
                </div>
                {plan.remainingCash > 0.01 && (
                  <div>
                    <p className="text-muted-foreground mb-0.5 text-xs uppercase tracking-wider">
                      Remaining
                    </p>
                    <p className="font-mono text-base font-bold text-orange-600 dark:text-orange-400">
                      {formatAmount(plan.remainingCash, baseCurrency)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground mb-0.5 text-xs uppercase tracking-wider">
                    New Portfolio
                  </p>
                  <p className="text-muted-foreground font-mono text-base font-bold">
                    {formatAmount(newPortfolioValue, baseCurrency)}
                  </p>
                </div>
                {totalResidual > 0.01 && (
                  <div>
                    <p className="text-muted-foreground mb-0.5 text-xs uppercase tracking-wider">
                      Undeployable
                    </p>
                    <p className="text-muted-foreground font-mono text-base font-bold">
                      {formatAmount(totalResidual, baseCurrency)}
                    </p>
                  </div>
                )}
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
                    <Icons.Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadCSV}>
                    <Icons.Download className="mr-1.5 h-3.5 w-3.5" />
                    CSV
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
