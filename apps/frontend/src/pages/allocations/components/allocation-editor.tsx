import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

import { getTaxonomy } from "@/adapters";
import { useTargetAllocations } from "@/hooks/use-portfolio-targets";
import type { TaxonomyCategory, NewTargetAllocation } from "@/lib/types";
import { useTargetMutations } from "../use-target-mutations";
import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";

interface AllocationEditorProps {
  targetId: string;
  taxonomyId: string;
}

interface CategoryRow {
  categoryId: string;
  name: string;
  color: string;
  targetPercent: number;
  isLocked: boolean;
}

export function AllocationEditor({ targetId, taxonomyId }: AllocationEditorProps) {
  const { allocations, isLoading: allocationsLoading } = useTargetAllocations(targetId);
  const { upsertAllocationMutation } = useTargetMutations();

  const { data: taxonomyData, isLoading: taxonomyLoading } = useQuery({
    queryKey: [QueryKeys.TAXONOMY, taxonomyId],
    queryFn: () => getTaxonomy(taxonomyId),
    enabled: !!taxonomyId,
  });

  const topLevelCategories = useMemo(() => {
    if (!taxonomyData?.categories) return [];
    return taxonomyData.categories
      .filter((c: TaxonomyCategory) => !c.parentId)
      .sort((a: TaxonomyCategory, b: TaxonomyCategory) => a.sortOrder - b.sortOrder);
  }, [taxonomyData]);

  const [rows, setRows] = useState<CategoryRow[]>([]);

  // Build rows from categories + existing allocations
  useEffect(() => {
    if (topLevelCategories.length === 0) return;

    const allocMap = new Map(allocations.map((a) => [a.categoryId, a]));

    const newRows = topLevelCategories.map((cat: TaxonomyCategory) => {
      const existing = allocMap.get(cat.id);
      return {
        categoryId: cat.id,
        name: cat.name,
        color: cat.color,
        targetPercent: existing ? existing.targetPercent / 100 : 0,
        isLocked: existing?.isLocked ?? false,
      };
    });

    setRows(newRows);
  }, [topLevelCategories, allocations]);

  const totalPercent = useMemo(() => rows.reduce((sum, r) => sum + r.targetPercent, 0), [rows]);

  const updateRow = useCallback((categoryId: string, field: "targetPercent" | "isLocked", value: number | boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.categoryId === categoryId ? { ...r, [field]: value } : r)),
    );
  }, []);

  const handleSave = useCallback(() => {
    const toSave = rows.filter((r) => r.targetPercent > 0 || allocations.some((a) => a.categoryId === r.categoryId));

    for (const row of toSave) {
      const allocation: NewTargetAllocation = {
        targetId,
        categoryId: row.categoryId,
        targetPercent: Math.round(row.targetPercent * 100),
        isLocked: row.isLocked,
      };
      upsertAllocationMutation.mutate(allocation);
    }
  }, [rows, targetId, allocations, upsertAllocationMutation]);

  if (allocationsLoading || taxonomyLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const isOverAllocated = totalPercent > 100;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[auto_1fr_80px_50px] items-center gap-x-3 gap-y-2 text-sm">
        <div className="text-muted-foreground font-medium">Color</div>
        <div className="text-muted-foreground font-medium">Category</div>
        <div className="text-muted-foreground text-right font-medium">Target %</div>
        <div className="text-muted-foreground text-center font-medium">Lock</div>

        {rows.map((row) => (
          <div key={row.categoryId} className="col-span-4 grid grid-cols-subgrid items-center">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <div className="truncate">{row.name}</div>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              className="h-8 text-right"
              value={row.targetPercent || ""}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                updateRow(row.categoryId, "targetPercent", Math.max(0, Math.min(100, val)));
              }}
            />
            <div className="flex justify-center">
              <Switch
                checked={row.isLocked}
                onCheckedChange={(checked) => updateRow(row.categoryId, "isLocked", checked)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <div className="text-sm font-medium">
          Total:{" "}
          <span className={isOverAllocated ? "text-destructive" : ""}>
            {totalPercent.toFixed(2)}%
          </span>
          {isOverAllocated && (
            <span className="text-destructive ml-2 text-xs">Exceeds 100%</span>
          )}
        </div>
        <Button size="sm" onClick={handleSave} disabled={upsertAllocationMutation.isPending}>
          <Icons.Check className="mr-1 h-4 w-4" />
          Save Allocations
        </Button>
      </div>
    </div>
  );
}
