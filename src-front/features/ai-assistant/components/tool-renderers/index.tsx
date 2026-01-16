/**
 * Tool Result Renderer Registry
 *
 * Maps tool names to their deterministic UI components.
 * This enables rich UI rendering for tool results without requiring
 * the model to emit UI JSON.
 */

import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { ValuationChart } from "./valuation-chart";
import { HoldingsTable } from "./holdings-table";
import type { ToolResult } from "../../types";
import type {
  RenderableToolName,
  ValuationPointDto,
  HoldingDto,
  ToolResultMeta,
} from "./types";

// Re-export types
export * from "./types";

/**
 * Props for the ToolResultRenderer component.
 */
interface ToolResultRendererProps {
  toolName: string;
  result: ToolResult;
  /** Base currency for formatting. */
  currency?: string;
}

/**
 * Extracts typed data from a tool result.
 */
function extractData<T>(result: ToolResult): T | null {
  if (!result.success || result.data == null) {
    return null;
  }

  // Tool results come wrapped in { data, meta } envelope from backend
  const payload = result.data as { data?: T } | T;
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return payload.data ?? null;
  }
  return payload as T;
}

/**
 * Extracts metadata from a tool result.
 */
function extractMeta(result: ToolResult): ToolResultMeta | undefined {
  if (!result.success || result.data == null) {
    return result.meta as ToolResultMeta | undefined;
  }

  // Merge envelope meta with result meta
  const payload = result.data as { meta?: ToolResultMeta };
  const envelopeMeta = typeof payload === "object" && payload !== null ? payload.meta : undefined;
  return { ...result.meta, ...envelopeMeta } as ToolResultMeta | undefined;
}

/**
 * Renders a tool result with deterministic rich UI.
 *
 * The renderer is selected based on the tool name. If no specific renderer
 * exists, falls back to a generic JSON display.
 */
export function ToolResultRenderer({ toolName, result, currency = "USD" }: ToolResultRendererProps) {
  // Handle errors
  if (!result.success) {
    return (
      <Card className="border-destructive/50 bg-destructive/5 w-full">
        <CardContent className="flex items-start gap-2 py-3">
          <Icons.AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Tool Error</p>
            <p className="text-muted-foreground text-xs">{result.error ?? "Unknown error"}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const meta = extractMeta(result);

  // Route to specific renderer based on tool name
  switch (toolName as RenderableToolName) {
    case "get_valuations": {
      const data = extractData<ValuationPointDto[]>(result);
      if (data) {
        return <ValuationChart data={data} meta={meta} currency={currency} />;
      }
      break;
    }

    case "get_holdings": {
      const data = extractData<HoldingDto[]>(result);
      if (data) {
        return <HoldingsTable data={data} meta={meta} currency={currency} />;
      }
      break;
    }

    // For tools without rich UI, show a compact summary
    case "get_accounts":
    case "search_activities":
    case "get_dividends":
    case "get_asset_allocation":
    case "get_performance":
    default:
      return <GenericToolResult toolName={toolName} result={result} meta={meta} />;
  }

  // Fallback if data extraction failed
  return <GenericToolResult toolName={toolName} result={result} meta={meta} />;
}

/**
 * Generic tool result display for tools without rich UI.
 */
function GenericToolResult({
  toolName,
  result,
  meta,
}: {
  toolName: string;
  result: ToolResult;
  meta?: ToolResultMeta;
}) {
  const data = extractData<unknown>(result);
  const itemCount = Array.isArray(data) ? data.length : data != null ? 1 : 0;

  return (
    <Card className="w-full">
      <CardContent className="flex items-center justify-between gap-2 py-3">
        <div className="flex items-center gap-2">
          <Icons.CheckCircle className="text-success h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">{formatToolName(toolName)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {meta?.accountScope && meta.accountScope !== "TOTAL" && (
            <Badge variant="outline" className="text-xs">
              {meta.accountScope}
            </Badge>
          )}
          {itemCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </Badge>
          )}
          {meta?.truncated && (
            <Badge variant="secondary" className="text-xs">
              truncated
            </Badge>
          )}
          {meta?.durationMs != null && (
            <span className="text-muted-foreground text-xs">{meta.durationMs}ms</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Format tool name for display.
 */
function formatToolName(toolName: string): string {
  return toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Check if a tool has a rich UI renderer.
 */
export function hasRichRenderer(toolName: string): boolean {
  const richTools: RenderableToolName[] = ["get_valuations", "get_holdings"];
  return richTools.includes(toolName as RenderableToolName);
}
