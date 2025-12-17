import type { ActivityDetails } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangesSummary, LocalTransaction, TransactionChangeState } from "./types";

/**
 * Generates a unique temporary ID for new transactions
 */
export const generateTempActivityId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp-${crypto.randomUUID()}`;
  }
  return `temp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Checks if an ID represents a temporary (unsaved) transaction
 */
export const isTempId = (id: string): boolean => {
  return id.startsWith("temp-");
};

interface UseActivityGridStateOptions {
  activities: ActivityDetails[];
}

interface UseActivityGridStateReturn {
  /** Server-provided transactions normalized with IDs */
  serverTransactions: ActivityDetails[];
  /** Local state of transactions including drafts and modifications */
  localTransactions: LocalTransaction[];
  /** Update local transactions state */
  setLocalTransactions: React.Dispatch<React.SetStateAction<LocalTransaction[]>>;
  /** Set of IDs for transactions that have been modified */
  dirtyTransactionIds: Set<string>;
  /** Update dirty transaction IDs */
  setDirtyTransactionIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Set of IDs for transactions pending deletion */
  pendingDeleteIds: Set<string>;
  /** Update pending delete IDs */
  setPendingDeleteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Whether there are any unsaved changes */
  hasUnsavedChanges: boolean;
  /** Summary of changes for UI display */
  changesSummary: ChangesSummary;
  /** Mark a transaction as dirty (modified) */
  markDirty: (id: string) => void;
  /** Mark multiple transactions as dirty */
  markDirtyBatch: (ids: string[]) => void;
  /** Mark a transaction for deletion */
  markForDeletion: (id: string, isNew: boolean) => void;
  /** Mark multiple transactions for deletion */
  markForDeletionBatch: (transactions: { id: string; isNew: boolean }[]) => void;
  /** Clear a transaction from dirty state */
  clearDirty: (id: string) => void;
  /** Reset all change tracking state */
  resetChangeState: () => void;
  /** Get current change state snapshot */
  getChangeState: () => TransactionChangeState;
}

/**
 * Hook to manage activity grid state with optimistic updates
 * Provides reliable change tracking for creates, updates, and deletes
 */
export const useActivityGridState = ({
  activities,
}: UseActivityGridStateOptions): UseActivityGridStateReturn => {
  // Normalize server transactions to ensure all have valid IDs
  const serverTransactions = useMemo(
    () =>
      activities.map((activity) => {
        const trimmedId = typeof activity.id === "string" ? activity.id.trim() : "";
        if (trimmedId.length > 0) {
          return activity;
        }
        return { ...activity, id: generateTempActivityId() };
      }),
    [activities],
  );

  // Local state for transactions displayed in the grid
  const [localTransactions, setLocalTransactions] =
    useState<LocalTransaction[]>(serverTransactions);

  // Track modified transaction IDs
  const [dirtyTransactionIds, setDirtyTransactionIds] = useState<Set<string>>(new Set());

  // Track transactions pending deletion
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());

  // Ref to access current dirty state without stale closures
  const dirtyTransactionIdsRef = useRef(dirtyTransactionIds);
  useEffect(() => {
    dirtyTransactionIdsRef.current = dirtyTransactionIds;
  }, [dirtyTransactionIds]);

  // Only sync local state from server if there are no unsaved changes
  useEffect(() => {
    if (
      dirtyTransactionIds.size === 0 &&
      pendingDeleteIds.size === 0 &&
      !localTransactions.some((transaction) => transaction.isNew)
    ) {
      setLocalTransactions(serverTransactions);
    }
    // Otherwise, preserve local state (pending changes)
    // This ensures deletes/edits persist until Save/Cancel
    // and toolbar can show correct pending state
  }, [serverTransactions]);

  // Mark a single transaction as dirty
  const markDirty = useCallback((id: string) => {
    setDirtyTransactionIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Mark multiple transactions as dirty
  const markDirtyBatch = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setDirtyTransactionIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // Mark a transaction for deletion
  const markForDeletion = useCallback((id: string, isNew: boolean) => {
    // Remove from local transactions
    setLocalTransactions((prev) => prev.filter((t) => t.id !== id));

    // Remove from dirty set
    setDirtyTransactionIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    // Only add to pending deletes if it's an existing (persisted) transaction
    if (!isNew) {
      setPendingDeleteIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  }, []);

  // Mark multiple transactions for deletion
  const markForDeletionBatch = useCallback((transactions: { id: string; isNew: boolean }[]) => {
    if (transactions.length === 0) return;

    const idsToDelete = new Set(transactions.map((t) => t.id));
    const existingIdsToDelete = transactions.filter((t) => !t.isNew).map((t) => t.id);

    // Remove from local transactions
    setLocalTransactions((prev) => prev.filter((t) => !idsToDelete.has(t.id)));

    // Remove from dirty set
    setDirtyTransactionIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of idsToDelete) {
        if (next.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Add existing transactions to pending deletes
    if (existingIdsToDelete.length > 0) {
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const id of existingIdsToDelete) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, []);

  // Clear dirty state for a transaction
  const clearDirty = useCallback((id: string) => {
    setDirtyTransactionIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Reset all change tracking state
  const resetChangeState = useCallback(() => {
    setDirtyTransactionIds(new Set());
    setPendingDeleteIds(new Set());
  }, []);

  // Get current change state snapshot
  const getChangeState = useCallback((): TransactionChangeState => {
    return {
      dirtyIds: new Set(dirtyTransactionIds),
      pendingDeleteIds: new Set(pendingDeleteIds),
    };
  }, [dirtyTransactionIds, pendingDeleteIds]);

  // Calculate if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    return (
      dirtyTransactionIds.size > 0 ||
      pendingDeleteIds.size > 0 ||
      localTransactions.some((transaction) => transaction.isNew)
    );
  }, [dirtyTransactionIds.size, localTransactions, pendingDeleteIds.size]);

  // Calculate changes summary for UI
  const changesSummary = useMemo((): ChangesSummary => {
    const newCount = localTransactions.filter(
      (t) => t.isNew && dirtyTransactionIds.has(t.id),
    ).length;
    const updatedCount = localTransactions.filter(
      (t) => !t.isNew && dirtyTransactionIds.has(t.id),
    ).length;
    const deletedCount = pendingDeleteIds.size;

    return {
      newCount,
      updatedCount,
      deletedCount,
      totalPendingChanges: dirtyTransactionIds.size + pendingDeleteIds.size,
    };
  }, [localTransactions, dirtyTransactionIds, pendingDeleteIds.size]);

  return {
    serverTransactions,
    localTransactions,
    setLocalTransactions,
    dirtyTransactionIds,
    setDirtyTransactionIds,
    pendingDeleteIds,
    setPendingDeleteIds,
    hasUnsavedChanges,
    changesSummary,
    markDirty,
    markDirtyBatch,
    markForDeletion,
    markForDeletionBatch,
    clearDirty,
    resetChangeState,
    getChangeState,
  };
};
