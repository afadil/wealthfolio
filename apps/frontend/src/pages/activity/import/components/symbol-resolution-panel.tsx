import { useMemo, useState } from "react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import TickerSearchInput from "@/components/ticker-search";
import type { SymbolSearchResult } from "@/lib/types";
import type { DraftActivity } from "../context";

interface SymbolResolutionPanelProps {
  drafts: DraftActivity[];
  onApplyMappings: (mappings: Record<string, SymbolSearchResult>) => void;
}

interface UnresolvedSymbol {
  csvSymbol: string;
  affectedCount: number;
}

export function SymbolResolutionPanel({ drafts, onApplyMappings }: SymbolResolutionPanelProps) {
  const [mappings, setMappings] = useState<Record<string, SymbolSearchResult>>({});

  const unresolvedSymbols = useMemo<UnresolvedSymbol[]>(() => {
    const symbolMap = new Map<string, number>();
    for (const draft of drafts) {
      if (draft.errors.symbol && draft.symbol) {
        symbolMap.set(draft.symbol, (symbolMap.get(draft.symbol) || 0) + 1);
      }
    }
    return Array.from(symbolMap.entries())
      .map(([csvSymbol, count]) => ({ csvSymbol, affectedCount: count }))
      .sort((a, b) => b.affectedCount - a.affectedCount);
  }, [drafts]);

  if (unresolvedSymbols.length === 0) return null;

  const resolvedCount = unresolvedSymbols.filter((s) => mappings[s.csvSymbol]).length;
  const totalAffectedRows = unresolvedSymbols.reduce((sum, s) => sum + s.affectedCount, 0);

  return (
    <div className="bg-warning/5 border-warning/20 rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icons.AlertTriangle className="text-warning h-4 w-4" />
        <h3 className="text-sm font-medium">
          {unresolvedSymbols.length} unrecognized{" "}
          {unresolvedSymbols.length === 1 ? "symbol" : "symbols"} affecting {totalAffectedRows} rows
        </h3>
      </div>
      <p className="text-muted-foreground mb-3 text-xs">
        Search and map these symbols to the correct ticker, then apply.
      </p>

      <div className="space-y-2">
        {unresolvedSymbols.map(({ csvSymbol, affectedCount }) => (
          <div key={csvSymbol} className="flex items-center gap-3">
            <code className="bg-muted w-28 shrink-0 truncate rounded px-1.5 py-0.5 text-xs font-semibold">
              {csvSymbol}
            </code>
            <span className="text-muted-foreground w-16 shrink-0 text-xs">
              {affectedCount} {affectedCount === 1 ? "row" : "rows"}
            </span>
            <div className="min-w-0 flex-1">
              <TickerSearchInput
                defaultValue={csvSymbol}
                placeholder={`Search for ${csvSymbol}...`}
                onSelectResult={(_symbol, result) => {
                  if (result) {
                    setMappings((prev) => ({ ...prev, [csvSymbol]: result }));
                  }
                }}
                className="h-8 text-xs"
              />
            </div>
            {mappings[csvSymbol] && <Icons.CheckCircle className="text-success h-4 w-4 shrink-0" />}
          </div>
        ))}
      </div>

      {resolvedCount > 0 && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => onApplyMappings(mappings)}>
            Apply {resolvedCount} {resolvedCount === 1 ? "mapping" : "mappings"}
          </Button>
        </div>
      )}
    </div>
  );
}
