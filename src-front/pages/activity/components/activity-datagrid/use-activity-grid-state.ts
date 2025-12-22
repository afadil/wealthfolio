import { useEffect, useMemo, useRef, useState } from "react";

import { ActivityDetails } from "@/lib/types";

export interface LocalTransaction extends ActivityDetails {
  isNew?: boolean;
}

export const generateTempActivityId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp-${crypto.randomUUID()}`;
  }
  return `temp-${Date.now().toString(36)}`;
};

export const useActivityGridState = (activities: ActivityDetails[]) => {
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

  const [localTransactions, setLocalTransactions] =
    useState<LocalTransaction[]>(serverTransactions);
  const [dirtyTransactionIds, setDirtyTransactionIds] = useState<Set<string>>(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());

  const dirtyTransactionIdsRef = useRef(dirtyTransactionIds);
  useEffect(() => {
    dirtyTransactionIdsRef.current = dirtyTransactionIds;
  }, [dirtyTransactionIds]);

  useEffect(() => {
    setLocalTransactions((previous) => {
      const dirtyIds = dirtyTransactionIdsRef.current;
      const deletedIds = new Set(pendingDeleteIds);
      const preservedDrafts = previous.filter(
        (transaction) => transaction.isNew && !deletedIds.has(transaction.id),
      );

      const previousById = new Map(previous.map((transaction) => [transaction.id, transaction]));

      const mergedFromServer = serverTransactions
        .filter((transaction) => !deletedIds.has(transaction.id))
        .map((transaction) => {
          if (dirtyIds.has(transaction.id)) {
            return previousById.get(transaction.id) ?? transaction;
          }
          return transaction;
        });

      return [...preservedDrafts, ...mergedFromServer];
    });
  }, [pendingDeleteIds, serverTransactions]);

  const hasUnsavedChanges = useMemo(() => {
    return (
      dirtyTransactionIds.size > 0 ||
      pendingDeleteIds.size > 0 ||
      localTransactions.some((transaction) => transaction.isNew)
    );
  }, [dirtyTransactionIds.size, localTransactions, pendingDeleteIds.size]);

  return {
    serverTransactions,
    localTransactions,
    setLocalTransactions,
    dirtyTransactionIds,
    setDirtyTransactionIds,
    pendingDeleteIds,
    setPendingDeleteIds,
    hasUnsavedChanges,
  };
};
