import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { useState } from "react";

import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";

/**
 * Type guard to check if result has wrapped format with meta
 */
function hasResultMeta(result: unknown): result is { data: unknown; meta: Record<string, unknown> } {
  return (
    typeof result === "object" &&
    result !== null &&
    "data" in result &&
    "meta" in result &&
    typeof (result as { meta: unknown }).meta === "object"
  );
}

export const ToolFallback: ToolCallMessagePartComponent = ({ toolName, argsText, result, status }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const isCancelled = status?.type === "incomplete" && status.reason === "cancelled";
  const cancelledReason =
    isCancelled && status.error
      ? typeof status.error === "string"
        ? status.error
        : JSON.stringify(status.error)
      : null;

  // Extract actual result data and metadata
  const hasMeta = hasResultMeta(result);
  const resultData = hasMeta ? result.data : result;
  const isTruncated = hasMeta && result.meta.truncated === true;

  return (
    <div
      className={cn(
        "aui-tool-fallback-root flex w-full flex-col gap-3 rounded-lg border py-3",
        isCancelled && "border-muted-foreground/30 bg-muted/30",
      )}
    >
      <div className="aui-tool-fallback-header flex items-center gap-2 px-4">
        {isCancelled ? (
          <Icons.XCircle className="aui-tool-fallback-icon text-muted-foreground size-4" />
        ) : (
          <Icons.Check className="aui-tool-fallback-icon size-4" />
        )}
        <p className={cn("aui-tool-fallback-title grow", isCancelled && "text-muted-foreground line-through")}>
          {isCancelled ? "Cancelled tool: " : "Used tool: "}
          <b>{toolName}</b>
        </p>
        {isTruncated && (
          <Badge variant="secondary" className="text-muted-foreground gap-1 text-xs">
            <Icons.AlertTriangle className="size-3" />
            Result truncated
          </Badge>
        )}
        <Button onClick={() => setIsCollapsed(!isCollapsed)}>
          {isCollapsed ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
        </Button>
      </div>
      {!isCollapsed && (
        <div className="aui-tool-fallback-content flex flex-col gap-2 border-t pt-2">
          {cancelledReason && (
            <div className="aui-tool-fallback-cancelled-root px-4">
              <p className="aui-tool-fallback-cancelled-header text-muted-foreground font-semibold">
                Cancelled reason:
              </p>
              <p className="aui-tool-fallback-cancelled-reason text-muted-foreground">{cancelledReason}</p>
            </div>
          )}
          <div className={cn("aui-tool-fallback-args-root px-4", isCancelled && "opacity-60")}>
            <pre className="aui-tool-fallback-args-value whitespace-pre-wrap">{argsText}</pre>
          </div>
          {!isCancelled && resultData !== undefined && (
            <div className="aui-tool-fallback-result-root border-t border-dashed px-4 pt-2">
              <div className="aui-tool-fallback-result-header flex items-center gap-2">
                <p className="font-semibold">Result:</p>
                {isTruncated && (
                  <span className="text-muted-foreground text-xs">(showing partial data)</span>
                )}
              </div>
              <pre className="aui-tool-fallback-result-content whitespace-pre-wrap">
                {typeof resultData === "string" ? resultData : JSON.stringify(resultData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
