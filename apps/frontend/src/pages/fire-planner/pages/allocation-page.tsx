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
import { Trans, useTranslation } from "react-i18next";
import type { FireSettings } from "../types";
import { checkAllocationDrift } from "../lib/fire-math";

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
  const { t } = useTranslation();
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
              <Trans i18nKey="fire_planner.alloc.empty_hint" components={{ 0: <strong /> }} />
            </p>
            {onSetupTargets && (
              <Button variant="outline" size="sm" onClick={onSetupTargets}>
                {t("fire_planner.alloc.go_settings")}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Still show current portfolio composition */}
        {currentPieData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("fire_planner.alloc.current_composition")}</CardTitle>
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
          <CardTitle className="text-sm">{t("fire_planner.alloc.drift_title")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {driftData.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("fire_planner.alloc.no_matching")}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="pb-2 text-left">{t("fire_planner.alloc.th_asset")}</th>
                  <th className="pb-2 text-right">{t("fire_planner.alloc.th_current_pct")}</th>
                  <th className="pb-2 text-right">{t("fire_planner.alloc.th_target_pct")}</th>
                  <th className="pb-2 text-right">{t("fire_planner.alloc.th_drift")}</th>
                  <th className="pb-2 text-center">{t("fire_planner.alloc.th_status")}</th>
                  <th className="pb-2 text-right">{t("fire_planner.alloc.th_value")}</th>
                  <th className="pb-2 text-right">{t("fire_planner.alloc.th_days_since_buy")}</th>
                  <th className="pb-2 pl-4 text-left">{t("fire_planner.alloc.th_action")}</th>
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
                        {item.status === "underweight" && t("fire_planner.alloc.status_under")}
                        {item.status === "overweight" && t("fire_planner.alloc.status_over")}
                        {item.status === "ok" && t("fire_planner.alloc.status_ok")}
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
                          {t("fire_planner.alloc.action_buy")}
                        </span>
                      )}
                      {item.status === "overweight" && (
                        <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400">
                          {t("fire_planner.alloc.action_hold")}
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
            <CardTitle className="text-sm">{t("fire_planner.alloc.current_alloc")}</CardTitle>
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
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t("fire_planner.alloc.no_holdings")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("fire_planner.alloc.target_alloc")}</CardTitle>
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
                {t("fire_planner.alloc.no_targets")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
