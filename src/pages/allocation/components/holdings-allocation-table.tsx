import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import { TickerAvatar } from "@/components/ticker-avatar";
import { toast } from "@/components/ui/use-toast";
import { Button, Input } from "@wealthfolio/ui";
import type { AssetClassTarget, Holding, HoldingTarget } from "@/lib/types";
import type { CurrentAllocation, HoldingsBySubClass } from "../hooks/use-current-allocation";
import type { ColumnDef } from "@tanstack/react-table";
import { Lock, LockOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHoldingTargetMutations } from "../hooks";
import { calculateAutoDistribution } from "../lib/auto-distribution";
import { useAllocationSettings } from "@/hooks/useAllocationSettings";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Status of a holding target
export type HoldingTargetStatus =
  | "set" // User explicitly saved this target
  | "locked" // Target is locked
  | "auto" // Auto-distributed (preview mode only)
  | "pending" // Pending edit in strict mode (not yet saved)
  | "needs-value" // Needs a value to reach 100% in strict mode
  | "none"; // No target set

// Type for the flattened holding data with allocation info
export interface HoldingWithAllocation {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  assetClass: string;
  assetClassId: string; // The asset class target ID (for saving)
  assetSubclass: string;
  currentValue: number;
  currentPortfolioPercent: number;
  currentPercentOfClass: number; // Current % within asset class
  targetPercentOfClass: number | null;
  pendingTargetPercent: number | null; // Pending edit value (strict mode)
  targetPortfolioPercent: number | null;
  deviation: number | null;
  isLocked: boolean;
  isAutoDistributed: boolean; // Whether this is a calculated preview (preview mode)
  isPending: boolean; // Whether this has a pending edit (strict mode)
  needsValue: boolean; // Whether this needs a value to reach 100% (strict mode)
  status: HoldingTargetStatus;
  holdingTarget: HoldingTarget | null;
  holding: Holding;
  assetClassValue: number; // Total value of the asset class
}

// Pending edit for strict mode
interface PendingEdit {
  assetId: string;
  assetClassId: string;
  value: number; // -1 means delete
  existingTarget: HoldingTarget | null;
  isDelete: boolean;
}

interface HoldingsAllocationTableProps {
  currentAllocation: CurrentAllocation;
  assetClassTargets: AssetClassTarget[];
  holdingTargets: HoldingTarget[];
  onNavigateToOverview: () => void;
}

// Calculate cascaded portfolio percent from holding target and asset class target
function calculateCascadedPercent(
  targetPercentOfClass: number | null,
  assetClassTarget: AssetClassTarget | undefined,
): number | null {
  if (targetPercentOfClass === null || !assetClassTarget) return null;
  return (targetPercentOfClass / 100) * assetClassTarget.targetPercent;
}

// Transform holdings data to flat table format with allocation info and auto-distribution
function transformHoldingsToTableData(
  currentAllocation: CurrentAllocation,
  assetClassTargets: AssetClassTarget[],
  holdingTargets: HoldingTarget[],
  isStrictMode: boolean,
  pendingEdits: Map<string, PendingEdit>,
): HoldingWithAllocation[] {
  const result: HoldingWithAllocation[] = [];

  for (const assetClass of currentAllocation.assetClasses) {
    const assetClassTarget = assetClassTargets.find((t) => t.assetClass === assetClass.assetClass);

    // Get all holdings for this asset class for auto-distribution calculation
    const allHoldingsInClass = assetClass.subClasses.flatMap(
      (sc: HoldingsBySubClass) => sc.holdings,
    );
    const holdingTargetsForClass = assetClassTarget
      ? holdingTargets.filter((ht) => ht.assetClassId === assetClassTarget.id)
      : [];

    // Calculate auto-distribution for this asset class (only in preview mode)
    const hasAnyTargets = holdingTargetsForClass.length > 0;
    const shouldAutoDistribute = hasAnyTargets && !isStrictMode;

    const distribution = shouldAutoDistribute
      ? calculateAutoDistribution(
          allHoldingsInClass,
          holdingTargetsForClass,
          new Map(), // No pending edits in table view for preview mode
          assetClass.currentValue,
        )
      : null;

    // In strict mode, check if this asset class has any pending edits or saved targets
    // If so, holdings without targets need values
    const hasPendingEditsForClass = Array.from(pendingEdits.values()).some(
      (edit) => edit.assetClassId === assetClassTarget?.id,
    );
    const classHasTargetsOrEdits = hasAnyTargets || hasPendingEditsForClass;

    for (const subClass of assetClass.subClasses) {
      for (const holding of subClass.holdings) {
        const assetId = holding.instrument?.id || "";
        const holdingTarget = holdingTargets.find((t) => t.assetId === assetId);

        // Check for pending edit
        const pendingEdit = pendingEdits.get(assetId);
        const isPendingDelete = pendingEdit?.isDelete === true;
        const isPending = pendingEdit !== undefined && !isPendingDelete;
        const pendingTargetPercent = isPending ? (pendingEdit?.value ?? null) : null;

        // Get auto-distributed value if available (preview mode)
        const distributedHolding = distribution?.holdings.find((h) => h.assetId === assetId);
        const isAutoDistributed = distributedHolding ? !distributedHolding.isUserSet : false;

        // Use pending value, then auto-distributed value, then saved target
        const targetPercentOfClass = isPending
          ? pendingTargetPercent
          : distributedHolding
            ? (distributedHolding.targetPercent ?? null)
            : (holdingTarget?.targetPercentOfClass ?? null);

        const targetPortfolioPercent = calculateCascadedPercent(
          targetPercentOfClass,
          assetClassTarget,
        );

        const currentPercent =
          currentAllocation.totalValue > 0
            ? ((holding.marketValue?.base || 0) / currentAllocation.totalValue) * 100
            : 0;

        const currentPercentOfClass =
          assetClass.currentValue > 0
            ? ((holding.marketValue?.base || 0) / assetClass.currentValue) * 100
            : 0;

        const deviation =
          targetPortfolioPercent !== null ? currentPercent - targetPortfolioPercent : null;

        // In strict mode, check if this holding needs a value
        // A holding needs a value if:
        // - It has no saved target and no pending edit, OR
        // - It has a pending delete (we're removing its target)
        const needsValue =
          isStrictMode &&
          classHasTargetsOrEdits &&
          ((!holdingTarget && !isPending) || isPendingDelete) &&
          !holding.instrument?.symbol?.startsWith("$CASH");

        // Determine status
        let status: HoldingTargetStatus = "none";
        if (holdingTarget?.isLocked) {
          status = "locked";
        } else if (isPending) {
          status = "pending";
        } else if (holdingTarget) {
          status = "set";
        } else if (isAutoDistributed) {
          status = "auto";
        } else if (needsValue) {
          status = "needs-value";
        }

        result.push({
          id: holding.id,
          assetId,
          symbol: holding.instrument?.symbol || "$CASH",
          name: holding.instrument?.name || holding.instrument?.symbol || "Cash",
          assetClass: assetClass.assetClass,
          assetClassId: assetClassTarget?.id || "",
          assetSubclass: holding.instrument?.assetSubclass || subClass.subClass,
          currentValue: holding.marketValue?.base || 0,
          currentPortfolioPercent: currentPercent,
          currentPercentOfClass,
          targetPercentOfClass,
          pendingTargetPercent,
          targetPortfolioPercent,
          deviation,
          isLocked: holdingTarget?.isLocked ?? false,
          isAutoDistributed,
          isPending,
          needsValue,
          status,
          holdingTarget: holdingTarget ?? null,
          holding,
          assetClassValue: assetClass.currentValue,
        });
      }
    }
  }

  return result.sort((a, b) => b.currentValue - a.currentValue);
}

// Editable cell component for Target % (Class)
function EditableTargetCell({
  row,
  onEdit,
  onToggleLock,
  isStrictMode,
}: {
  row: HoldingWithAllocation;
  onEdit: (
    assetId: string,
    assetClassId: string,
    value: number,
    existingTarget: HoldingTarget | null,
  ) => void;
  onToggleLock: (holdingTarget: HoldingTarget) => void;
  isStrictMode: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Display value: pending value takes precedence
  const displayPercent = row.isPending ? row.pendingTargetPercent : row.targetPercentOfClass;
  const hasNoAssetClassTarget = !row.assetClassId;
  const isCashHolding = row.symbol.startsWith("$CASH");

  const handleStartEdit = () => {
    if (row.isLocked || hasNoAssetClassTarget || isCashHolding) return;
    setInputValue(displayPercent?.toFixed(1) || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    const trimmedValue = inputValue.trim();

    // If field is empty, signal a reset/delete
    if (trimmedValue === "") {
      onEdit(row.assetId, row.assetClassId, -1, row.holdingTarget); // -1 signals delete
      setIsEditing(false);
      return;
    }

    const numValue = parseFloat(trimmedValue);

    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      toast({
        title: "Invalid value",
        description: "Please enter a value between 0 and 100, or leave empty to reset",
        variant: "destructive",
      });
      setIsEditing(false);
      return;
    }

    // Don't save if value hasn't changed from saved target
    const savedValue = row.holdingTarget?.targetPercentOfClass ?? null;
    if (savedValue !== null && Math.abs(numValue - savedValue) < 0.01) {
      setIsEditing(false);
      return;
    }

    onEdit(row.assetId, row.assetClassId, numValue, row.holdingTarget);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  const handleLockClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (row.holdingTarget) {
      onToggleLock(row.holdingTarget);
    }
  };

  // No asset class target set or cash holding - show disabled state
  if (hasNoAssetClassTarget || isCashHolding) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-muted-foreground text-sm">-</span>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="h-7 w-16 text-right text-sm"
          autoFocus
        />
        <span className="text-sm">%</span>
      </div>
    );
  }

  // Determine styling based on status
  const needsRedHighlight = isStrictMode && row.needsValue;
  const isPendingValue = row.isPending;

  return (
    <div className="flex items-center justify-end gap-2">
      {/* Lock/Unlock button - only show if there's a saved target */}
      {row.holdingTarget && (
        <button
          type="button"
          onClick={handleLockClick}
          className={`rounded p-1 transition-colors ${
            row.isLocked
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          title={row.isLocked ? "Unlock target" : "Lock target"}
        >
          {row.isLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* Target value - clickable to edit */}
      <button
        type="button"
        onClick={handleStartEdit}
        disabled={row.isLocked}
        className={`min-w-[50px] rounded px-2 py-0.5 text-right transition-colors ${
          row.isLocked
            ? "text-muted-foreground cursor-not-allowed"
            : needsRedHighlight
              ? "cursor-pointer border border-red-400 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-600 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950"
              : isPendingValue
                ? "cursor-pointer bg-orange-50 text-orange-700 italic dark:bg-orange-950/50 dark:text-orange-300"
                : row.isAutoDistributed
                  ? "text-muted-foreground hover:text-foreground cursor-pointer italic"
                  : "hover:text-primary cursor-pointer"
        }`}
        title={
          row.isLocked
            ? "Unlock to edit"
            : needsRedHighlight
              ? "Set a target value to complete allocation"
              : isPendingValue
                ? "Pending (will save when total reaches 100%)"
                : row.isAutoDistributed
                  ? "Auto-distributed (click to set manually)"
                  : "Click to edit"
        }
      >
        {displayPercent !== null ? `${displayPercent.toFixed(1)}%` : "-"}
      </button>
    </div>
  );
}

// Column definitions for the holdings allocation table
function getColumns(
  navigate: ReturnType<typeof useNavigate>,
  onEditTarget: (
    assetId: string,
    assetClassId: string,
    value: number,
    existingTarget: HoldingTarget | null,
  ) => void,
  onToggleLock: (holdingTarget: HoldingTarget) => void,
  isStrictMode: boolean,
): ColumnDef<HoldingWithAllocation>[] {
  return [
    {
      id: "symbol",
      accessorKey: "symbol",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Symbol" />,
      cell: ({ row }) => {
        const symbol = row.original.symbol;
        const displaySymbol = symbol.startsWith("$CASH") ? symbol.split("-")[0] : symbol;
        const avatarSymbol = symbol.startsWith("$CASH") ? "$CASH" : symbol;
        const isCash = symbol.startsWith("$CASH");

        const content = (
          <div className="flex items-center gap-2">
            <TickerAvatar symbol={avatarSymbol} className="h-8 w-8" />
            <span className="font-medium">{displaySymbol}</span>
          </div>
        );

        if (isCash) {
          return content;
        }

        return (
          <button
            type="button"
            className="hover:underline focus:outline-none"
            onClick={() =>
              navigate(`/holdings/${encodeURIComponent(symbol)}`, {
                state: { holding: row.original.holding },
              })
            }
          >
            {content}
          </button>
        );
      },
      filterFn: (row, _columnId, filterValue) => {
        const searchTerm = (filterValue as string).toLowerCase();
        const symbol = row.original.symbol.toLowerCase();
        const name = row.original.name.toLowerCase();
        return symbol.includes(searchTerm) || name.includes(searchTerm);
      },
      enableHiding: false,
    },
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="text-muted-foreground max-w-[200px] truncate text-sm">
          {row.original.name}
        </div>
      ),
    },
    {
      id: "assetClass",
      accessorKey: "assetClass",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Asset Class" />,
      cell: ({ row }) => <span className="text-sm">{row.original.assetClass}</span>,
      filterFn: (row, _id, value) => {
        return (value as string[]).includes(row.getValue("assetClass") as string);
      },
    },
    {
      id: "assetSubclass",
      accessorKey: "assetSubclass",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{row.original.assetSubclass}</span>
      ),
      filterFn: (row, _id, value) => {
        return (value as string[]).includes(row.getValue("assetSubclass") as string);
      },
    },
    {
      id: "currentValue",
      accessorKey: "currentValue",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Value" className="justify-end text-right" />
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium">
          {row.original.currentValue.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
        </div>
      ),
    },
    {
      id: "targetPercentOfClass",
      accessorFn: (row) => row.targetPercentOfClass,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Target % (Class)"
          className="justify-end text-right"
        />
      ),
      cell: ({ row }) => (
        <EditableTargetCell
          row={row.original}
          onEdit={onEditTarget}
          onToggleLock={onToggleLock}
          isStrictMode={isStrictMode}
        />
      ),
    },
    {
      id: "targetPortfolioPercent",
      accessorFn: (row) => row.targetPortfolioPercent,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Target % (Total)"
          className="justify-end text-right"
        />
      ),
      cell: ({ row }) => {
        const cascaded = row.original.targetPortfolioPercent;
        const isAutoDistributed = row.original.isAutoDistributed;
        const isPending = row.original.isPending;
        return (
          <div
            className={`text-right ${
              isPending
                ? "text-orange-700 italic dark:text-orange-300"
                : isAutoDistributed
                  ? "text-muted-foreground italic"
                  : ""
            }`}
          >
            {cascaded !== null ? `${cascaded.toFixed(1)}%` : "-"}
          </div>
        );
      },
    },
    {
      id: "currentPortfolioPercent",
      accessorKey: "currentPortfolioPercent",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Current %"
          className="justify-end text-right"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right">{row.original.currentPortfolioPercent.toFixed(1)}%</div>
      ),
    },
    {
      id: "deviation",
      accessorFn: (row) => row.deviation,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Deviation"
          className="justify-end text-right"
        />
      ),
      cell: ({ row }) => {
        const deviation = row.original.deviation;
        if (deviation === null) {
          return <div className="text-muted-foreground text-right">-</div>;
        }

        const absDeviation = Math.abs(deviation);
        let colorClass = "text-muted-foreground"; // On target (within ±0.5%)

        if (absDeviation >= 0.5) {
          if (deviation < 0) {
            // Under-allocated (current < target)
            colorClass = "text-red-600 dark:text-red-400";
          } else {
            // Over-allocated (current > target)
            colorClass = "text-success";
          }
        }

        return (
          <div className={`text-right font-medium ${colorClass}`}>
            {deviation > 0 ? "+" : ""}
            {deviation.toFixed(1)}%
          </div>
        );
      },
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" className="justify-center" />
      ),
      cell: ({ row }) => {
        const status = row.original.status;

        return (
          <div className="flex justify-center">
            {status === "locked" ? (
              <span className="text-muted-foreground text-xs">Locked</span>
            ) : status === "auto" ? (
              <span className="text-muted-foreground text-xs italic">Auto</span>
            ) : status === "pending" ? (
              <span className="text-xs text-orange-600 italic dark:text-orange-400">Pending</span>
            ) : status === "needs-value" ? (
              <span className="text-xs text-red-600 dark:text-red-400">Required</span>
            ) : status === "set" ? (
              <span className="text-muted-foreground text-xs">Set</span>
            ) : null}
          </div>
        );
      },
      filterFn: (row, _id, value) => {
        const status = row.original.status;
        if ((value as string[]).includes("locked") && status === "locked") return true;
        if ((value as string[]).includes("unlocked") && status !== "locked") return true;
        return false;
      },
    },
  ];
}

export function HoldingsAllocationTable({
  currentAllocation,
  assetClassTargets,
  holdingTargets,
  onNavigateToOverview,
}: HoldingsAllocationTableProps) {
  const navigate = useNavigate();
  const { settings: allocationSettings } = useAllocationSettings();
  const isStrictMode = allocationSettings.holdingTargetMode === "strict";
  const { saveTargetMutation, deleteTargetMutation, toggleLockMutation } =
    useHoldingTargetMutations();

  // Pending edits for strict mode (not saved until total = 100%)
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());

  // Dialog state for unsaved changes warning
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  // Dialog state for reset confirmation
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Track current filters for context-aware reset
  const [currentFilters, setCurrentFilters] = useState<{ id: string; value: unknown }[]>([]);

  // Check if there are any pending edits
  const hasPendingEdits = pendingEdits.size > 0;

  // Handle edit (in strict mode, add to pending; in preview mode, save immediately)
  // value of -1 signals a delete/reset
  const handleEdit = useCallback(
    async (
      assetId: string,
      assetClassId: string,
      value: number,
      existingTarget: HoldingTarget | null,
    ) => {
      const isDelete = value < 0;

      if (isStrictMode) {
        if (isDelete) {
          if (existingTarget) {
            // Mark as pending delete - will be deleted when total reaches 100%
            setPendingEdits((prev) => {
              const next = new Map(prev);
              next.set(assetId, {
                assetId,
                assetClassId,
                value: -1,
                existingTarget,
                isDelete: true,
              });
              return next;
            });
          } else {
            // No saved target, just remove from pending edits
            setPendingEdits((prev) => {
              const next = new Map(prev);
              next.delete(assetId);
              return next;
            });
          }
        } else {
          // In strict mode, add to pending edits
          setPendingEdits((prev) => {
            const next = new Map(prev);
            next.set(assetId, { assetId, assetClassId, value, existingTarget, isDelete: false });
            return next;
          });
        }
      } else {
        // In preview mode, save or delete immediately
        if (isDelete && existingTarget) {
          // Delete the target
          await deleteTargetMutation.mutateAsync({
            id: existingTarget.id,
            assetClassId: existingTarget.assetClassId,
          });
        } else if (!isDelete) {
          await saveTargetMutation.mutateAsync({
            id: existingTarget?.id,
            assetClassId,
            assetId,
            targetPercentOfClass: value,
            isLocked: existingTarget?.isLocked ?? false,
          });
        }
      }
    },
    [isStrictMode, saveTargetMutation, deleteTargetMutation],
  );

  // Callback to toggle lock
  const handleToggleLock = useCallback(
    (holdingTarget: HoldingTarget) => {
      toggleLockMutation.mutate({
        id: holdingTarget.id,
        assetClassId: holdingTarget.assetClassId,
        holdingName: holdingTarget.assetId,
      });
    },
    [toggleLockMutation],
  );

  const tableData = useMemo(
    () =>
      transformHoldingsToTableData(
        currentAllocation,
        assetClassTargets,
        holdingTargets,
        isStrictMode,
        pendingEdits,
      ),
    [currentAllocation, assetClassTargets, holdingTargets, isStrictMode, pendingEdits],
  );

  // Calculate validation state for each asset class
  const { validationWarnings, canSave, hasHoldingsNeedingValues } = useMemo(() => {
    const warnings: {
      assetClass: string;
      assetClassId: string;
      total: number;
      remaining: number;
    }[] = [];
    const pendingByClass = new Map<string, PendingEdit[]>();

    // Group pending edits by asset class
    for (const edit of pendingEdits.values()) {
      const existing = pendingByClass.get(edit.assetClassId) || [];
      existing.push(edit);
      pendingByClass.set(edit.assetClassId, existing);
    }

    // Calculate totals for each asset class with pending edits
    for (const [assetClassId, edits] of pendingByClass) {
      // Find the asset class name
      const assetClassName =
        tableData.find((h) => h.assetClassId === assetClassId)?.assetClass || "";

      // Calculate total: saved targets + pending edits
      let total = 0;
      const holdingsInClass = tableData.filter((h) => h.assetClassId === assetClassId);

      for (const holding of holdingsInClass) {
        const pendingEdit = edits.find((e) => e.assetId === holding.assetId);
        if (pendingEdit) {
          // Don't add value for pending deletes
          if (!pendingEdit.isDelete) {
            total += pendingEdit.value;
          }
          // If it's a pending delete, we don't count the saved target either
        } else if (holding.holdingTarget) {
          total += holding.holdingTarget.targetPercentOfClass;
        }
      }

      const remaining = 100 - total;
      if (Math.abs(remaining) > 0.1) {
        warnings.push({ assetClass: assetClassName, assetClassId, total, remaining });
      }
    }

    // Check if there are holdings that need values (for "Fill Remaining" button)
    const hasHoldingsNeedingValues = tableData.some((h) => h.needsValue);

    return {
      validationWarnings: warnings,
      canSave: warnings.length === 0 && pendingEdits.size > 0,
      hasHoldingsNeedingValues,
    };
  }, [tableData, pendingEdits]);

  // Track if we're currently auto-saving
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  // Save all pending edits (including deletes)
  const saveAllPendingEdits = useCallback(async () => {
    if (pendingEdits.size === 0) return;

    setIsAutoSaving(true);
    try {
      const editCount = pendingEdits.size;
      for (const edit of pendingEdits.values()) {
        if (edit.isDelete && edit.existingTarget) {
          // Delete the target
          await deleteTargetMutation.mutateAsync({
            id: edit.existingTarget.id,
            assetClassId: edit.existingTarget.assetClassId,
          });
        } else if (!edit.isDelete) {
          // Save the target
          await saveTargetMutation.mutateAsync({
            id: edit.existingTarget?.id,
            assetClassId: edit.assetClassId,
            assetId: edit.assetId,
            targetPercentOfClass: edit.value,
            isLocked: edit.existingTarget?.isLocked ?? false,
          });
        }
      }
      setPendingEdits(new Map());
      toast({
        title: "Targets saved",
        description: `${editCount} holding target${editCount > 1 ? "s" : ""} updated successfully`,
      });
    } catch (error) {
      // Error handling is done in the mutation
    } finally {
      setIsAutoSaving(false);
    }
  }, [pendingEdits, saveTargetMutation, deleteTargetMutation]);

  // Auto-save when total reaches 100% in strict mode
  useEffect(() => {
    if (canSave && !isAutoSaving) {
      saveAllPendingEdits();
    }
  }, [canSave, isAutoSaving, saveAllPendingEdits]);

  // Discard all pending edits
  const handleDiscardAll = useCallback(() => {
    setPendingEdits(new Map());
    toast({
      title: "Changes discarded",
      description: "All pending changes have been discarded",
    });
  }, []);

  // Fill remaining holdings with auto-distributed values
  const handleFillRemaining = useCallback(() => {
    // For each asset class with pending edits/targets, calculate remaining and distribute
    const newPendingEdits = new Map(pendingEdits);

    // Group by asset class
    const assetClassIds = new Set<string>();
    for (const edit of pendingEdits.values()) {
      assetClassIds.add(edit.assetClassId);
    }
    // Also include asset classes with existing targets
    for (const holding of tableData) {
      if (holding.holdingTarget && holding.assetClassId) {
        assetClassIds.add(holding.assetClassId);
      }
    }

    for (const assetClassId of assetClassIds) {
      const holdingsInClass = tableData.filter(
        (h) => h.assetClassId === assetClassId && !h.symbol.startsWith("$CASH"),
      );

      // Calculate current total (saved + pending)
      let currentTotal = 0;
      const unsetHoldings: HoldingWithAllocation[] = [];
      let unsetTotalValue = 0;

      for (const holding of holdingsInClass) {
        const pendingEdit = pendingEdits.get(holding.assetId);
        if (pendingEdit) {
          currentTotal += pendingEdit.value;
        } else if (holding.holdingTarget) {
          currentTotal += holding.holdingTarget.targetPercentOfClass;
        } else {
          // This holding needs a value
          unsetHoldings.push(holding);
          unsetTotalValue += holding.currentValue;
        }
      }

      const remaining = 100 - currentTotal;

      // Distribute remaining among unset holdings proportionally by value
      if (remaining > 0 && unsetHoldings.length > 0) {
        for (const holding of unsetHoldings) {
          const proportion =
            unsetTotalValue > 0 ? holding.currentValue / unsetTotalValue : 1 / unsetHoldings.length;
          const value = Math.round(remaining * proportion * 10) / 10; // Round to 1 decimal
          newPendingEdits.set(holding.assetId, {
            assetId: holding.assetId,
            assetClassId: holding.assetClassId,
            value,
            existingTarget: holding.holdingTarget,
            isDelete: false,
          });
        }
      }
    }

    setPendingEdits(newPendingEdits);
  }, [pendingEdits, tableData]);

  // Handle leave confirmation
  const handleConfirmLeave = useCallback(() => {
    setPendingEdits(new Map());
    setShowLeaveDialog(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  }, [pendingNavigation]);

  const handleCancelLeave = useCallback(() => {
    setShowLeaveDialog(false);
    setPendingNavigation(null);
  }, []);

  // Get filtered holdings with targets for context-aware reset
  const { holdingsToReset, resetButtonText } = useMemo(() => {
    // Get filter values
    const assetClassFilter = currentFilters.find((f) => f.id === "assetClass")?.value as
      | string[]
      | undefined;
    const typeFilter = currentFilters.find((f) => f.id === "assetSubclass")?.value as
      | string[]
      | undefined;
    const statusFilter = currentFilters.find((f) => f.id === "status")?.value as
      | string[]
      | undefined;

    // Filter holdings that have targets
    let filtered = tableData.filter((h) => h.holdingTarget !== null);

    // Apply asset class filter
    if (assetClassFilter && assetClassFilter.length > 0) {
      filtered = filtered.filter((h) => assetClassFilter.includes(h.assetClass));
    }

    // Apply type filter
    if (typeFilter && typeFilter.length > 0) {
      filtered = filtered.filter((h) => typeFilter.includes(h.assetSubclass));
    }

    // Apply status filter (locked/unlocked)
    if (statusFilter && statusFilter.length > 0) {
      filtered = filtered.filter((h) => {
        if (statusFilter.includes("locked") && h.status === "locked") return true;
        if (statusFilter.includes("unlocked") && h.status !== "locked") return true;
        return false;
      });
    }

    // Generate button text based on active filters
    let buttonText = "Reset All Targets";
    const filterParts: string[] = [];

    if (assetClassFilter && assetClassFilter.length > 0) {
      if (assetClassFilter.length === 1) {
        filterParts.push(assetClassFilter[0]);
      } else {
        filterParts.push(`${assetClassFilter.length} Asset Classes`);
      }
    }

    if (typeFilter && typeFilter.length > 0) {
      if (typeFilter.length === 1) {
        filterParts.push(typeFilter[0]);
      } else {
        filterParts.push(`${typeFilter.length} Types`);
      }
    }

    if (statusFilter && statusFilter.length > 0) {
      if (statusFilter.includes("locked") && !statusFilter.includes("unlocked")) {
        filterParts.push("Locked");
      } else if (statusFilter.includes("unlocked") && !statusFilter.includes("locked")) {
        filterParts.push("Unlocked");
      }
    }

    if (filterParts.length > 0) {
      buttonText = `Reset ${filterParts.join(" / ")} Targets`;
    }

    return { holdingsToReset: filtered, resetButtonText: buttonText };
  }, [tableData, currentFilters]);

  // Handle reset filtered targets
  const handleResetAll = useCallback(async () => {
    setIsResetting(true);
    try {
      // First discard any pending edits for holdings being reset
      setPendingEdits((prev) => {
        const next = new Map(prev);
        for (const holding of holdingsToReset) {
          next.delete(holding.assetId);
        }
        return next;
      });

      // Delete filtered holding targets
      for (const holding of holdingsToReset) {
        if (holding.holdingTarget) {
          await deleteTargetMutation.mutateAsync({
            id: holding.holdingTarget.id,
            assetClassId: holding.holdingTarget.assetClassId,
          });
        }
      }
      toast({
        title: "Targets reset",
        description: `${holdingsToReset.length} holding target${holdingsToReset.length > 1 ? "s" : ""} removed`,
      });
    } catch (error) {
      // Error handling is done in the mutation
    } finally {
      setIsResetting(false);
      setShowResetDialog(false);
    }
  }, [holdingsToReset, deleteTargetMutation]);

  // Intercept navigation when there are pending edits
  useEffect(() => {
    if (!hasPendingEdits) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasPendingEdits]);

  const columns = useMemo(
    () => getColumns(navigate, handleEdit, handleToggleLock, isStrictMode),
    [navigate, handleEdit, handleToggleLock, isStrictMode],
  );

  // Build filter options from data
  const assetClassOptions = useMemo(() => {
    const uniqueClasses = new Set(tableData.map((h) => h.assetClass));
    return Array.from(uniqueClasses).map((c) => ({
      label: c,
      value: c,
    }));
  }, [tableData]);

  const typeOptions = useMemo(() => {
    const uniqueTypes = new Set(tableData.map((h) => h.assetSubclass));
    return Array.from(uniqueTypes).map((t) => ({
      label: t,
      value: t,
    }));
  }, [tableData]);

  const lockStatusOptions = [
    { label: "Locked", value: "locked" },
    { label: "Unlocked", value: "unlocked" },
  ];

  const filters = [
    {
      id: "assetClass",
      title: "Asset Class",
      options: assetClassOptions,
    },
    {
      id: "assetSubclass",
      title: "Type",
      options: typeOptions,
    },
    {
      id: "status",
      title: "Lock Status",
      options: lockStatusOptions,
    },
  ];

  // Empty state
  if (tableData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <p className="text-muted-foreground mb-4 text-sm">
          No holdings found. Add holdings to your portfolio to see allocation data.
        </p>
        <Button variant="outline" onClick={onNavigateToOverview}>
          Go to Allocation Overview
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pending edits banner for strict mode */}
      {isStrictMode && hasPendingEdits && (
        <div className="bg-muted/50 rounded-lg border-l-4 border-l-red-600 p-3 dark:border-l-red-400">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 text-red-600 dark:text-red-400">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-foreground text-sm font-medium">
                  Set targets for all holdings to reach 100%
                </p>
                {validationWarnings.length > 0 && (
                  <ul className="text-muted-foreground mt-1 text-sm">
                    {validationWarnings.map((warning) => (
                      <li key={warning.assetClassId}>
                        <span className="font-medium">{warning.assetClass}</span>:{" "}
                        {warning.total.toFixed(1)}%
                        {warning.remaining > 0
                          ? ` (${warning.remaining.toFixed(1)}% remaining)`
                          : ` (${Math.abs(warning.remaining).toFixed(1)}% over)`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {hasHoldingsNeedingValues && (
                <Button variant="outline" size="sm" onClick={handleFillRemaining}>
                  Fill Remaining
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleDiscardAll}>
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}

      <DataTable
        data={tableData}
        columns={columns}
        searchBy="symbol"
        filters={filters}
        showColumnToggle={true}
        storageKey="allocation-holdings-table"
        defaultColumnVisibility={{
          name: false,
        }}
        defaultSorting={[{ id: "currentValue", desc: true }]}
        scrollable={true}
        onFilterChange={setCurrentFilters}
        toolbarActions={
          holdingsToReset.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResetDialog(true)}
              disabled={isResetting}
            >
              {resetButtonText}
            </Button>
          ) : null
        }
      />

      {/* Leave confirmation dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have pending changes that haven't been saved. If you leave now, these changes will
              be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelLeave}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLeave}>Discard & Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset confirmation dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{resetButtonText}</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {holdingsToReset.length} holding target
              {holdingsToReset.length > 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetAll}
              disabled={isResetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isResetting ? "Resetting..." : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default HoldingsAllocationTable;
