// Re-export all recharts components for addons
// This avoids naming conflicts with UI components like Label and Tooltip
export * from "recharts";

// Also re-export our custom chart components
export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
} from "./components/ui/chart";

export type { ChartConfig } from "./components/ui/chart";
