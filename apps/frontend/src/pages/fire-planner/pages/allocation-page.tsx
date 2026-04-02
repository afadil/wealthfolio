import type { Holding, ActivityDetails } from "@/lib/types";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  formatAmount,
} from "@wealthfolio/ui";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "@wealthfolio/ui/chart";
import { useMemo } from "react";
import type { FireSettings, AllocationHealth } from "../types";

// ─── Local allocation-drift helper (pure UI logic) ───────────────────────────

interface HoldingInput {
  symbol: string;
  name: string;
  marketValue: number;
}

interface ActivityInput {
  symbol: string;
  activityType: string;
  date: string;
}

function checkAllocationDrift(
  holdings: HoldingInput[],
  targetAllocations: Record<string, number>,
  activities: ActivityInput[],
): AllocationHealth[] {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  if (totalValue === 0) return [];

  const today = new Date();

  return Object.entries(targetAllocations)
    .filter(([, target]) => target > 0)
    .map(([symbol, targetWeight]) => {
      const holding = holdings.find((h) => h.symbol === symbol || h.name === symbol);
      const currentValue = holding?.marketValue ?? 0;
      const currentWeight = currentValue / totalValue;
      const drift = currentWeight - targetWeight;

      const buys = activities
        .filter(
          (a) => (a.symbol === symbol || a.symbol === holding?.symbol) && a.activityType === "BUY",
        )
        .map((a) => new Date(a.date).getTime())
        .filter((t) => !isNaN(t));

      const lastBuy = buys.length > 0 ? Math.max(...buys) : null;
      const daysSinceLastBuy = lastBuy
        ? Math.floor((today.getTime() - lastBuy) / (1000 * 60 * 60 * 24))
        : null;

      const status: AllocationHealth["status"] =
        drift < -0.02 ? "underweight" : drift > 0.02 ? "overweight" : "ok";

      return {
        symbol,
        name: holding?.name ?? symbol,
        currentWeight,
        targetWeight,
        drift,
        status,
        currentValue,
        daysSinceLastBuy,
      };
    });
}

interface Props {
  settings: FireSettings;
  holdings: Holding[];
  activities: ActivityDetails[];
  isLoading: boolean;
  onSetupTargets?: () => void;
}

const DRIFT_COLORS = {
  underweight: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  overweight: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  ok: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};

const CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
];

function pct(value: number) {
  return (value * 100).toFixed(1) + "%";
}

export default function AllocationPage({
  settings,
  holdings,
  activities,
  isLoading,
  onSetupTargets,
}: Props) {
  const { targetAllocations, currency } = settings;
  const hasTargets = Object.keys(targetAllocations).length > 0;

  const holdingInputs = useMemo(
    () =>
      holdings
        .filter((h) => h.holdingType !== "cash")
        .map((h) => ({
          symbol: h.instrument?.symbol ?? "",
          name: h.instrument?.name ?? h.instrument?.symbol ?? "",
          marketValue: h.marketValue?.base ?? 0,
        })),
    [holdings],
  );

  const activityInputs = useMemo(
    () =>
      activities.map((a) => ({
        symbol: a.assetSymbol ?? "",
        activityType: a.activityType,
        date: typeof a.date === "string" ? a.date : a.date.toISOString(),
      })),
    [activities],
  );

  const driftData = useMemo(
    () =>
      hasTargets ? checkAllocationDrift(holdingInputs, targetAllocations, activityInputs) : [],
    [holdingInputs, targetAllocations, activityInputs, hasTargets],
  );

  const totalValue = holdingInputs.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);

  // Pie chart data: current vs target
  const currentPieData = holdingInputs
    .filter((h) => (h.marketValue ?? 0) > 0)
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
    .slice(0, 10)
    .map((h) => ({
      name: h.symbol,
      value: Math.round(((h.marketValue ?? 0) / totalValue) * 1000) / 10,
    }));

  const targetPieData = Object.entries(targetAllocations)
    .filter(([, w]) => w > 0)
    .map(([sym, weight]) => ({
      name: sym,
      value: Math.round(weight * 1000) / 10,
    }));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!hasTargets) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground mb-4 text-sm">
              Set your target allocation to enable drift monitoring.
              <br />
              Go to <strong>Settings → Target Allocations</strong>.
            </p>
            {onSetupTargets && (
              <Button variant="outline" size="sm" onClick={onSetupTargets}>
                Go to Settings
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Still show current portfolio composition */}
        {currentPieData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Current Portfolio Composition</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={currentPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, value }: { name?: string; value?: number }) =>
                      `${name ?? ""} ${value ?? 0}%`
                    }
                  >
                    {currentPieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number | undefined) => `${v ?? 0}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Drift Monitor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Allocation Drift Monitor</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {driftData.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No matching holdings found for your target allocations. Check that your target symbols
              match your holding symbols.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="pb-2 text-left">Asset</th>
                  <th className="pb-2 text-right">Current %</th>
                  <th className="pb-2 text-right">Target %</th>
                  <th className="pb-2 text-right">Drift</th>
                  <th className="pb-2 text-center">Status</th>
                  <th className="pb-2 text-right">Value</th>
                  <th className="pb-2 text-right">Days since buy</th>
                  <th className="pb-2 pl-4 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {driftData.map((item) => (
                  <tr key={item.symbol} className="border-b last:border-0">
                    <td className="py-1.5 font-medium">
                      {item.symbol}
                      {item.name !== item.symbol && (
                        <span className="text-muted-foreground ml-1 font-normal">{item.name}</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">{pct(item.currentWeight)}</td>
                    <td className="py-1.5 text-right">{pct(item.targetWeight)}</td>
                    <td
                      className={`py-1.5 text-right font-medium ${
                        item.drift < -0.02
                          ? "text-red-500"
                          : item.drift > 0.02
                            ? "text-yellow-600"
                            : "text-green-600"
                      }`}
                    >
                      {item.drift > 0 ? "+" : ""}
                      {pct(item.drift)}
                    </td>
                    <td className="py-1.5 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DRIFT_COLORS[item.status]}`}
                      >
                        {item.status === "underweight" && "↓ Under"}
                        {item.status === "overweight" && "↑ Over"}
                        {item.status === "ok" && "✓ OK"}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      {formatAmount(item.currentValue, currency)}
                    </td>
                    <td className="py-1.5 text-right">
                      {item.daysSinceLastBuy !== null ? `${item.daysSinceLastBuy}d` : "—"}
                    </td>
                    <td className="py-1.5 pl-4 text-left">
                      {item.status === "underweight" && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
                          Buy
                        </span>
                      )}
                      {item.status === "overweight" && (
                        <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400">
                          Hold
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Side-by-side pie charts */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Current Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {currentPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={currentPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                  >
                    {currentPieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number | undefined) => `${v ?? 0}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground py-6 text-center text-sm">No holdings found</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Target Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {targetPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={targetPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                  >
                    {targetPieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number | undefined) => `${v ?? 0}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No target allocations set
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
