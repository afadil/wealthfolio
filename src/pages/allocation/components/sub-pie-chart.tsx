import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Holding, HoldingTarget } from "@/lib/types";

interface SubPieChartProps {
  holdingTargets: HoldingTarget[];
  holdings: Holding[];
  assetClassName: string;
}

export function SubPieChart({ holdingTargets, holdings }: SubPieChartProps) {
  // Prepare data
  const data = holdingTargets.map((target) => {
    const holding = holdings.find((h) => h.id === target.assetId);
    return {
      name: holding?.instrument?.symbol || "Unknown",
      value: target.targetPercentOfClass,
      displayName: holding?.instrument?.name || holding?.instrument?.symbol || "Unknown",
    };
  });

  // Green color palette (lighter to darker) - consistent with asset class colors
  const COLORS = [
    "#86efac", // green-300
    "#4ade80", // green-400
    "#22c55e", // green-500
    "#16a34a", // green-600
    "#15803d", // green-700
    "#166534", // green-800
    "#14532d", // green-900
  ];

  // Empty state
  if (data.length === 0) {
    return (
      <div className="text-muted-foreground py-4 text-center text-sm">
        Set holding targets to see breakdown
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => `${Number(value).toFixed(1)}%`}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(_value, entry: any) =>
              `${entry.payload.name} (${entry.payload.value.toFixed(1)}%)`
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
