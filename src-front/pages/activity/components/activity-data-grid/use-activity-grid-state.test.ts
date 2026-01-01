import { ActivityType } from "@/lib/constants";
import type { ActivityDetails } from "@/lib/types";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useActivityGridState } from "./use-activity-grid-state";

// Helper to create mock activity data
const createMockActivity = (overrides: Partial<ActivityDetails> = {}): ActivityDetails => ({
  id: `activity-${Math.random().toString(36).substring(7)}`,
  activityType: ActivityType.BUY,
  date: new Date("2024-01-15T10:00:00Z"),
  quantity: 10,
  unitPrice: 100,
  amount: 1000,
  fee: 5,
  currency: "USD",
  needsReview: false,
  comment: "",
  createdAt: new Date("2024-01-15T10:00:00Z"),
  assetId: "AAPL",
  updatedAt: new Date("2024-01-15T10:00:00Z"),
  accountId: "account-1",
  accountName: "Test Account",
  accountCurrency: "USD",
  assetSymbol: "AAPL",
  assetName: "Apple Inc.",
  ...overrides,
});

describe("useActivityGridState", () => {
  describe("initialization", () => {
    it("should initialize with activities from props", () => {
      const activities = [createMockActivity({ id: "act-1" }), createMockActivity({ id: "act-2" })];

      const { result } = renderHook(() => useActivityGridState({ activities }));

      expect(result.current.localTransactions).toHaveLength(2);
      expect(result.current.localTransactions[0].id).toBe("act-1");
      expect(result.current.localTransactions[1].id).toBe("act-2");
    });

    it("should generate temp IDs for activities without valid IDs", () => {
      const activities = [createMockActivity({ id: "" }), createMockActivity({ id: "   " })];

      const { result } = renderHook(() => useActivityGridState({ activities }));

      expect(result.current.localTransactions[0].id).toMatch(/^temp-/);
      expect(result.current.localTransactions[1].id).toMatch(/^temp-/);
    });

    it("should initialize with empty dirty and pending delete sets", () => {
      const activities = [createMockActivity()];

      const { result } = renderHook(() => useActivityGridState({ activities }));

      expect(result.current.dirtyTransactionIds.size).toBe(0);
      expect(result.current.pendingDeleteIds.size).toBe(0);
    });

    it("should initialize hasUnsavedChanges as false", () => {
      const activities = [createMockActivity()];

      const { result } = renderHook(() => useActivityGridState({ activities }));

      expect(result.current.hasUnsavedChanges).toBe(false);
    });
  });

  describe("markDirty", () => {
    it("should mark a transaction as dirty", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markDirty("act-1");
      });

      expect(result.current.dirtyTransactionIds.has("act-1")).toBe(true);
      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("should not duplicate dirty IDs when marking same transaction twice", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markDirty("act-1");
        result.current.markDirty("act-1");
      });

      expect(result.current.dirtyTransactionIds.size).toBe(1);
    });
  });

  describe("markDirtyBatch", () => {
    it("should mark multiple transactions as dirty", () => {
      const activities = [
        createMockActivity({ id: "act-1" }),
        createMockActivity({ id: "act-2" }),
        createMockActivity({ id: "act-3" }),
      ];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markDirtyBatch(["act-1", "act-2"]);
      });

      expect(result.current.dirtyTransactionIds.has("act-1")).toBe(true);
      expect(result.current.dirtyTransactionIds.has("act-2")).toBe(true);
      expect(result.current.dirtyTransactionIds.has("act-3")).toBe(false);
    });

    it("should handle empty array gracefully", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markDirtyBatch([]);
      });

      expect(result.current.dirtyTransactionIds.size).toBe(0);
    });
  });

  describe("markForDeletion", () => {
    it("should remove new transaction from local state without adding to pendingDeleteIds", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      // Simulate adding a new transaction
      act(() => {
        result.current.setLocalTransactions((prev) => [
          ...prev,
          { ...createMockActivity({ id: "temp-new" }), isNew: true },
        ]);
        result.current.markDirty("temp-new");
      });

      expect(result.current.localTransactions).toHaveLength(2);

      act(() => {
        result.current.markForDeletion("temp-new", true);
      });

      expect(result.current.localTransactions).toHaveLength(1);
      expect(result.current.pendingDeleteIds.has("temp-new")).toBe(false);
    });

    it("should add existing transaction to pendingDeleteIds", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markForDeletion("act-1", false);
      });

      expect(result.current.pendingDeleteIds.has("act-1")).toBe(true);
      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("should remove from dirty set when marking for deletion", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markDirty("act-1");
      });

      expect(result.current.dirtyTransactionIds.has("act-1")).toBe(true);

      act(() => {
        result.current.markForDeletion("act-1", false);
      });

      expect(result.current.dirtyTransactionIds.has("act-1")).toBe(false);
    });
  });

  describe("markForDeletionBatch", () => {
    it("should handle batch deletion of mixed new and existing transactions", () => {
      const activities = [createMockActivity({ id: "act-1" }), createMockActivity({ id: "act-2" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      // Add a new transaction
      act(() => {
        result.current.setLocalTransactions((prev) => [
          ...prev,
          { ...createMockActivity({ id: "temp-new" }), isNew: true },
        ]);
      });

      act(() => {
        result.current.markForDeletionBatch([
          { id: "act-1", isNew: false },
          { id: "temp-new", isNew: true },
        ]);
      });

      expect(result.current.localTransactions).toHaveLength(1);
      expect(result.current.pendingDeleteIds.has("act-1")).toBe(true);
      expect(result.current.pendingDeleteIds.has("temp-new")).toBe(false);
    });
  });

  describe("clearDirty", () => {
    it("should remove a transaction from dirty set", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markDirty("act-1");
      });

      expect(result.current.dirtyTransactionIds.has("act-1")).toBe(true);

      act(() => {
        result.current.clearDirty("act-1");
      });

      expect(result.current.dirtyTransactionIds.has("act-1")).toBe(false);
    });
  });

  describe("resetChangeState", () => {
    it("should clear all dirty and pending delete IDs", () => {
      const activities = [createMockActivity({ id: "act-1" }), createMockActivity({ id: "act-2" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markDirty("act-1");
        result.current.markForDeletion("act-2", false);
      });

      expect(result.current.hasUnsavedChanges).toBe(true);

      act(() => {
        result.current.resetChangeState();
      });

      expect(result.current.dirtyTransactionIds.size).toBe(0);
      expect(result.current.pendingDeleteIds.size).toBe(0);
    });
  });

  describe("changesSummary", () => {
    it("should correctly count new transactions", () => {
      const activities: ActivityDetails[] = [];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.setLocalTransactions([
          { ...createMockActivity({ id: "temp-1" }), isNew: true },
          { ...createMockActivity({ id: "temp-2" }), isNew: true },
        ]);
        result.current.markDirtyBatch(["temp-1", "temp-2"]);
      });

      expect(result.current.changesSummary.newCount).toBe(2);
      expect(result.current.changesSummary.updatedCount).toBe(0);
      expect(result.current.changesSummary.deletedCount).toBe(0);
    });

    it("should correctly count updated transactions", () => {
      const activities = [createMockActivity({ id: "act-1" }), createMockActivity({ id: "act-2" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markDirty("act-1");
      });

      expect(result.current.changesSummary.newCount).toBe(0);
      expect(result.current.changesSummary.updatedCount).toBe(1);
    });

    it("should correctly count deleted transactions", () => {
      const activities = [createMockActivity({ id: "act-1" }), createMockActivity({ id: "act-2" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markForDeletion("act-1", false);
        result.current.markForDeletion("act-2", false);
      });

      expect(result.current.changesSummary.deletedCount).toBe(2);
      expect(result.current.changesSummary.totalPendingChanges).toBe(2);
    });
  });

  describe("getChangeState", () => {
    it("should return a snapshot of the current change state", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markDirty("act-1");
      });

      const snapshot = result.current.getChangeState();

      expect(snapshot.dirtyIds.has("act-1")).toBe(true);
      expect(snapshot.pendingDeleteIds.size).toBe(0);

      // Verify it's a copy, not the same reference
      act(() => {
        result.current.clearDirty("act-1");
      });

      expect(snapshot.dirtyIds.has("act-1")).toBe(true);
      expect(result.current.dirtyTransactionIds.has("act-1")).toBe(false);
    });
  });

  describe("server sync", () => {
    it("should preserve dirty changes when server data updates", () => {
      const initialActivities = [createMockActivity({ id: "act-1", quantity: 10 })];
      const { result, rerender } = renderHook(
        ({ activities }) => useActivityGridState({ activities }),
        { initialProps: { activities: initialActivities } },
      );

      // Mark as dirty with local changes
      act(() => {
        result.current.setLocalTransactions((prev) =>
          prev.map((t) => (t.id === "act-1" ? { ...t, quantity: 20 } : t)),
        );
        result.current.markDirty("act-1");
      });

      expect(result.current.localTransactions[0].quantity).toBe(20);

      // Simulate server update
      const updatedActivities = [createMockActivity({ id: "act-1", quantity: 15 })];
      rerender({ activities: updatedActivities });

      // Local dirty changes should be preserved
      expect(result.current.localTransactions[0].quantity).toBe(20);
    });

    it("should update non-dirty transactions from server", () => {
      const initialActivities = [
        createMockActivity({ id: "act-1", quantity: 10 }),
        createMockActivity({ id: "act-2", quantity: 5 }),
      ];
      const { result, rerender } = renderHook(
        ({ activities }) => useActivityGridState({ activities }),
        { initialProps: { activities: initialActivities } },
      );

      // Mark only act-1 as dirty
      act(() => {
        result.current.setLocalTransactions((prev) =>
          prev.map((t) => (t.id === "act-1" ? { ...t, quantity: 20 } : t)),
        );
        result.current.markDirty("act-1");
      });

      // Simulate server update for both
      const updatedActivities = [
        createMockActivity({ id: "act-1", quantity: 15 }),
        createMockActivity({ id: "act-2", quantity: 8 }),
      ];
      rerender({ activities: updatedActivities });

      // act-1 should keep local value (dirty)
      expect(result.current.localTransactions.find((t) => t.id === "act-1")?.quantity).toBe(20);
      // act-2 should update from server (not dirty)
      expect(result.current.localTransactions.find((t) => t.id === "act-2")?.quantity).toBe(8);
    });

    it("should preserve new (draft) transactions across server updates", () => {
      const initialActivities = [createMockActivity({ id: "act-1" })];
      const { result, rerender } = renderHook(
        ({ activities }) => useActivityGridState({ activities }),
        { initialProps: { activities: initialActivities } },
      );

      // Add a new draft transaction
      act(() => {
        result.current.setLocalTransactions((prev) => [
          ...prev,
          { ...createMockActivity({ id: "temp-new" }), isNew: true },
        ]);
      });

      expect(result.current.localTransactions).toHaveLength(2);

      // Simulate server update
      const updatedActivities = [createMockActivity({ id: "act-1" })];
      rerender({ activities: updatedActivities });

      // Draft should be preserved
      expect(result.current.localTransactions).toHaveLength(2);
      expect(result.current.localTransactions.find((t) => t.id === "temp-new")).toBeDefined();
    });
  });

  describe("deletion state management", () => {
    it("should track deleted transaction in pendingDeleteIds", () => {
      const activities = [
        createMockActivity({ id: "act-1" }),
        createMockActivity({ id: "act-2" }),
        createMockActivity({ id: "act-3" }),
      ];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markForDeletion("act-2", false);
      });

      expect(result.current.pendingDeleteIds.size).toBe(1);
      expect(result.current.pendingDeleteIds.has("act-2")).toBe(true);
      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("should remove existing transaction from local state when marked for deletion", () => {
      const activities = [createMockActivity({ id: "act-1" }), createMockActivity({ id: "act-2" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markForDeletion("act-1", false);
      });

      // Transaction should be removed from local state
      expect(result.current.localTransactions).toHaveLength(1);
      expect(result.current.localTransactions.find((t) => t.id === "act-1")).toBeUndefined();
      // But should be marked for deletion (for server sync)
      expect(result.current.pendingDeleteIds.has("act-1")).toBe(true);
    });

    it("should immediately remove new transaction from local state when deleted", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      // Add a new transaction
      act(() => {
        result.current.setLocalTransactions((prev) => [
          ...prev,
          { ...createMockActivity({ id: "temp-new" }), isNew: true },
        ]);
        result.current.markDirty("temp-new");
      });

      expect(result.current.localTransactions).toHaveLength(2);

      // Delete the new transaction
      act(() => {
        result.current.markForDeletion("temp-new", true);
      });

      // New transaction should be removed immediately
      expect(result.current.localTransactions).toHaveLength(1);
      expect(result.current.localTransactions.find((t) => t.id === "temp-new")).toBeUndefined();
      // Should NOT be in pendingDeleteIds (nothing to delete from server)
      expect(result.current.pendingDeleteIds.has("temp-new")).toBe(false);
    });

    it("should handle deleting multiple transactions at once", () => {
      const activities = [
        createMockActivity({ id: "act-1" }),
        createMockActivity({ id: "act-2" }),
        createMockActivity({ id: "act-3" }),
      ];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markForDeletionBatch([
          { id: "act-1", isNew: false },
          { id: "act-3", isNew: false },
        ]);
      });

      expect(result.current.pendingDeleteIds.size).toBe(2);
      expect(result.current.pendingDeleteIds.has("act-1")).toBe(true);
      expect(result.current.pendingDeleteIds.has("act-3")).toBe(true);
      expect(result.current.pendingDeleteIds.has("act-2")).toBe(false);
    });

    it("should remove dirty flag when transaction is marked for deletion", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      // First make the transaction dirty
      act(() => {
        result.current.markDirty("act-1");
      });

      expect(result.current.dirtyTransactionIds.has("act-1")).toBe(true);

      // Then delete it
      act(() => {
        result.current.markForDeletion("act-1", false);
      });

      // Should no longer be dirty (deletion takes precedence)
      expect(result.current.dirtyTransactionIds.has("act-1")).toBe(false);
      expect(result.current.pendingDeleteIds.has("act-1")).toBe(true);
    });

    it("should correctly count deletions in changesSummary", () => {
      const activities = [
        createMockActivity({ id: "act-1" }),
        createMockActivity({ id: "act-2" }),
        createMockActivity({ id: "act-3" }),
      ];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markForDeletion("act-1", false);
        result.current.markForDeletion("act-2", false);
      });

      expect(result.current.changesSummary.deletedCount).toBe(2);
      expect(result.current.changesSummary.newCount).toBe(0);
      expect(result.current.changesSummary.updatedCount).toBe(0);
      expect(result.current.changesSummary.totalPendingChanges).toBe(2);
    });

    it("should handle mixed changes: new, updated, and deleted", () => {
      const activities = [
        createMockActivity({ id: "act-1" }),
        createMockActivity({ id: "act-2" }),
        createMockActivity({ id: "act-3" }),
      ];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        // Add a new transaction
        result.current.setLocalTransactions((prev) => [
          ...prev,
          { ...createMockActivity({ id: "temp-new" }), isNew: true },
        ]);
        result.current.markDirty("temp-new");

        // Update an existing one
        result.current.markDirty("act-1");

        // Delete another
        result.current.markForDeletion("act-2", false);
      });

      expect(result.current.changesSummary.newCount).toBe(1);
      expect(result.current.changesSummary.updatedCount).toBe(1);
      expect(result.current.changesSummary.deletedCount).toBe(1);
      expect(result.current.changesSummary.totalPendingChanges).toBe(3);
    });

    it("should clear pending deletions on resetChangeState", () => {
      const activities = [createMockActivity({ id: "act-1" }), createMockActivity({ id: "act-2" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markForDeletion("act-1", false);
        result.current.markForDeletion("act-2", false);
      });

      expect(result.current.pendingDeleteIds.size).toBe(2);

      act(() => {
        result.current.resetChangeState();
      });

      expect(result.current.pendingDeleteIds.size).toBe(0);
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it("should preserve pending deletions across server updates", () => {
      const initialActivities = [
        createMockActivity({ id: "act-1" }),
        createMockActivity({ id: "act-2" }),
      ];
      const { result, rerender } = renderHook(
        ({ activities }) => useActivityGridState({ activities }),
        { initialProps: { activities: initialActivities } },
      );

      // Mark for deletion
      act(() => {
        result.current.markForDeletion("act-1", false);
      });

      expect(result.current.pendingDeleteIds.has("act-1")).toBe(true);

      // Simulate server update (maybe other data changed)
      const updatedActivities = [
        createMockActivity({ id: "act-1", quantity: 999 }),
        createMockActivity({ id: "act-2", quantity: 888 }),
      ];
      rerender({ activities: updatedActivities });

      // Pending deletion should be preserved
      expect(result.current.pendingDeleteIds.has("act-1")).toBe(true);
    });

    it("should include pending delete IDs in getChangeState snapshot", () => {
      const activities = [createMockActivity({ id: "act-1" }), createMockActivity({ id: "act-2" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      act(() => {
        result.current.markForDeletion("act-1", false);
      });

      const snapshot = result.current.getChangeState();

      expect(snapshot.pendingDeleteIds.has("act-1")).toBe(true);
      expect(snapshot.pendingDeleteIds.size).toBe(1);

      // Verify it's a copy
      act(() => {
        result.current.resetChangeState();
      });

      expect(snapshot.pendingDeleteIds.has("act-1")).toBe(true);
      expect(result.current.pendingDeleteIds.size).toBe(0);
    });
  });

  describe("selection and batch operations", () => {
    it("should handle batch deletion of selected items", () => {
      const activities = [
        createMockActivity({ id: "act-1" }),
        createMockActivity({ id: "act-2" }),
        createMockActivity({ id: "act-3" }),
        createMockActivity({ id: "act-4" }),
      ];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      // Simulate selecting and deleting multiple items
      const selectedIds = ["act-1", "act-3", "act-4"];

      act(() => {
        result.current.markForDeletionBatch(selectedIds.map((id) => ({ id, isNew: false })));
      });

      expect(result.current.pendingDeleteIds.size).toBe(3);
      expect(result.current.changesSummary.deletedCount).toBe(3);
    });

    it("should handle batch dirty marking for selected items", () => {
      const activities = [
        createMockActivity({ id: "act-1" }),
        createMockActivity({ id: "act-2" }),
        createMockActivity({ id: "act-3" }),
      ];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      const selectedIds = ["act-1", "act-2"];

      act(() => {
        result.current.markDirtyBatch(selectedIds);
      });

      expect(result.current.dirtyTransactionIds.size).toBe(2);
      expect(result.current.changesSummary.updatedCount).toBe(2);
    });

    it("should correctly handle batch deletion with mix of new and existing items", () => {
      const activities = [createMockActivity({ id: "act-1" })];
      const { result } = renderHook(() => useActivityGridState({ activities }));

      // Add new transactions
      act(() => {
        result.current.setLocalTransactions((prev) => [
          ...prev,
          { ...createMockActivity({ id: "temp-1" }), isNew: true },
          { ...createMockActivity({ id: "temp-2" }), isNew: true },
        ]);
        result.current.markDirtyBatch(["temp-1", "temp-2"]);
      });

      expect(result.current.localTransactions).toHaveLength(3);

      // Delete a mix of new and existing
      act(() => {
        result.current.markForDeletionBatch([
          { id: "act-1", isNew: false },
          { id: "temp-1", isNew: true },
        ]);
      });

      // Only temp-2 should remain (act-1 and temp-1 were deleted)
      expect(result.current.localTransactions).toHaveLength(1);
      expect(result.current.localTransactions[0].id).toBe("temp-2");
      expect(result.current.localTransactions.find((t) => t.id === "temp-1")).toBeUndefined();
      expect(result.current.pendingDeleteIds.has("act-1")).toBe(true);
      expect(result.current.pendingDeleteIds.has("temp-1")).toBe(false);
    });
  });
});
