import {
  calculateActivityValue,
  isCashActivity,
  isCashTransfer,
  isIncomeActivity,
} from "@/lib/activity-utils";
import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import {
  Account,
  ActivityBulkMutationRequest,
  ActivityCreate,
  ActivityDetails,
  ActivityUpdate,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Button,
  Checkbox,
  Icons,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  formatAmount,
  toast,
  worldCurrencies,
} from "@wealthfolio/ui";
import type { Dispatch, SetStateAction } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import { ActivityOperations } from "../activity-operations";
import { ActivityTypeBadge } from "../activity-type-badge";
import { EditableCell } from "./editable-cell";
import { SelectCell } from "./select-cell";
import { SymbolAutocompleteCell } from "./symbol-autocomplete-cell";

type EditableField =
  | "activityType"
  | "date"
  | "assetSymbol"
  | "quantity"
  | "unitPrice"
  | "amount"
  | "fee"
  | "accountId"
  | "currency"
  | "comment";

interface CellCoordinate {
  rowId: string;
  field: EditableField;
}

interface LocalTransaction extends ActivityDetails {
  isNew?: boolean;
}

interface ActivityDatagridProps {
  accounts: Account[];
  activities: ActivityDetails[];
  onRefetch: () => Promise<unknown>;
  onEditActivity: (activity: ActivityDetails) => void;
}

const editableFields: EditableField[] = [
  "activityType",
  "date",
  "assetSymbol",
  "quantity",
  "unitPrice",
  "amount",
  "fee",
  "accountId",
  "currency",
  "comment",
];

const generateTempActivityId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp-${crypto.randomUUID()}`;
  }
  return `temp-${Date.now().toString(36)}`;
};

const formatDateInputValue = (date: Date | string | undefined) => {
  if (!date) return "";
  const iso = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(iso.getTime())) {
    return "";
  }
  return iso.toISOString().slice(0, 16);
};

const formatDateDisplayValue = (date: Date | string | undefined) => {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) {
    return "";
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");

  return `${year}/${month}/${day} ${hours}:${minutes}`;
};

const getNumericCellValue = (value: unknown): string => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : "";
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
};

const toFiniteNumberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const DEFAULT_CURRENCY = "USD";

const formatAmountDisplay = (
  value: unknown,
  currency?: string,
  displayCurrency = false,
): string => {
  const numericValue = toFiniteNumberOrUndefined(value);
  if (numericValue === undefined) {
    return "";
  }
  try {
    return formatAmount(numericValue, currency ?? DEFAULT_CURRENCY, displayCurrency);
  } catch {
    return "";
  }
};

const createDraftTransaction = (accounts: Account[]): LocalTransaction => {
  const defaultAccount = accounts.find((account) => account.isActive) ?? accounts[0];
  const now = new Date();

  return {
    id: generateTempActivityId(),
    activityType: ActivityType.BUY,
    date: now,
    quantity: 0,
    unitPrice: 0,
    amount: 0,
    fee: 0,
    currency: defaultAccount?.currency ?? "USD",
    isDraft: true,
    comment: "",
    createdAt: now,
    assetId: "",
    updatedAt: now,
    accountId: defaultAccount?.id ?? "",
    accountName: defaultAccount?.name ?? "",
    accountCurrency: defaultAccount?.currency ?? "",
    assetSymbol: "",
    assetName: "",
    assetDataSource: undefined,
    subRows: undefined,
    isNew: true,
  };
};

export function ActivityDatagrid({
  accounts,
  activities,
  onRefetch,
  onEditActivity,
}: ActivityDatagridProps) {
  const [localTransactions, setLocalTransactions] = useState<LocalTransaction[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedCell, setFocusedCell] = useState<CellCoordinate | null>(null);
  const [dirtyTransactionIds, setDirtyTransactionIds] = useState<Set<string>>(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const { saveActivitiesMutation } = useActivityMutations();

  const activityTypeOptions = useMemo(
    () =>
      (Object.values(ActivityType) as ActivityType[]).map((type) => ({
        value: type,
        label: ActivityTypeNames[type],
        searchValue: `${ActivityTypeNames[type]} ${type}`,
      })),
    [],
  );

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: account.name,
        searchValue: `${account.name} ${account.currency} ${account.id}`,
      })),
    [accounts],
  );

  const accountLookup = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);

  const currencyOptions = useMemo(() => {
    const entries = new Map<string, string>();

    worldCurrencies.forEach(({ value, label }) => {
      entries.set(value, label);
    });

    accounts.forEach((account) => {
      if (account.currency) {
        entries.set(account.currency, entries.get(account.currency) ?? account.currency);
      }
    });

    localTransactions.forEach((transaction) => {
      if (transaction.currency) {
        entries.set(
          transaction.currency,
          entries.get(transaction.currency) ?? transaction.currency,
        );
      }
    });

    return Array.from(entries.entries()).map(([value, label]) => ({
      value,
      label: value,
      searchValue: label,
    }));
  }, [accounts, localTransactions]);

  const serverTransactions = useMemo(() => activities, [activities]);

  useEffect(() => {
    setLocalTransactions((previous) => {
      const dirtyIds = new Set(dirtyTransactionIds);
      const deletedIds = new Set(pendingDeleteIds);
      const preservedDrafts = previous.filter(
        (transaction) => transaction.isNew && !deletedIds.has(transaction.id),
      );

      const mergedFromServer = serverTransactions
        .filter((transaction) => !deletedIds.has(transaction.id))
        .map((transaction) => {
          if (dirtyIds.has(transaction.id)) {
            const localVersion = previous.find((local) => local.id === transaction.id);
            return localVersion ?? transaction;
          }
          return transaction;
        });

      return [...preservedDrafts, ...mergedFromServer];
    });
  }, [dirtyTransactionIds, pendingDeleteIds, serverTransactions]);

  const filteredTransactionsRef = useRef(localTransactions);

  useEffect(() => {
    filteredTransactionsRef.current = localTransactions;
  }, [localTransactions]);

  const hasUnsavedChanges =
    dirtyTransactionIds.size > 0 ||
    pendingDeleteIds.size > 0 ||
    localTransactions.some((t) => t.isNew);

  const handleCellNavigation = useCallback((direction: "up" | "down" | "left" | "right") => {
    setFocusedCell((current) => {
      if (!current) return current;

      const transactions = filteredTransactionsRef.current;
      if (!transactions || transactions.length === 0) return current;

      const currentRowIndex = transactions.findIndex((t) => t.id === current.rowId);
      if (currentRowIndex === -1) return current;

      const currentFieldIndex = editableFields.indexOf(current.field);
      if (currentFieldIndex === -1) return current;

      let newRowIndex = currentRowIndex;
      let newFieldIndex = currentFieldIndex;

      switch (direction) {
        case "up":
          newRowIndex = Math.max(0, currentRowIndex - 1);
          break;
        case "down":
          newRowIndex = Math.min(transactions.length - 1, currentRowIndex + 1);
          break;
        case "left":
          newFieldIndex = Math.max(0, currentFieldIndex - 1);
          break;
        case "right":
          newFieldIndex = Math.min(editableFields.length - 1, currentFieldIndex + 1);
          break;
      }

      const nextRow = transactions[newRowIndex];
      const nextField = editableFields[newFieldIndex];

      if (!nextRow || !nextField) {
        return current;
      }

      if (nextRow.id === current.rowId && nextField === current.field) {
        return current;
      }

      return { rowId: nextRow.id, field: nextField };
    });
  }, []);

  const addNewRow = useCallback(() => {
    const draft = createDraftTransaction(accounts);
    setLocalTransactions((prev) => [draft, ...prev]);
    setDirtyTransactionIds((prev) => {
      const next = new Set(prev);
      next.add(draft.id);
      return next;
    });
    setTimeout(() => {
      setFocusedCell({ rowId: draft.id, field: "activityType" });
    }, 0);
  }, [accounts]);

  const updateTransaction = useCallback(
    (id: string, field: EditableField, value: string) => {
      setLocalTransactions((prev) =>
        prev.map((transaction) => {
          if (transaction.id !== id) return transaction;

          const updated: LocalTransaction = { ...transaction };

          const toNumber = (input: string) => {
            const parsed = Number.parseFloat(input);
            return Number.isFinite(parsed) ? parsed : 0;
          };

          if (field === "date") {
            updated.date = value ? new Date(value) : new Date();
          } else if (field === "quantity") {
            updated.quantity = toNumber(value);
          } else if (field === "unitPrice") {
            updated.unitPrice = toNumber(value);
            if (isCashActivity(updated.activityType) || isIncomeActivity(updated.activityType)) {
              updated.amount = updated.unitPrice;
            }
          } else if (field === "amount") {
            updated.amount = toNumber(value);
          } else if (field === "fee") {
            updated.fee = toNumber(value);
          } else if (field === "assetSymbol") {
            const upper = value.toUpperCase();
            updated.assetSymbol = upper;
            updated.assetId = upper;
          } else if (field === "activityType") {
            updated.activityType = value as ActivityType;
          } else if (field === "accountId") {
            updated.accountId = value;
            const account = accountLookup.get(value);
            if (account) {
              updated.accountName = account.name;
              updated.accountCurrency = account.currency;
              updated.currency = account.currency;
            }
          } else if (field === "currency") {
            updated.currency = value;
          } else if (field === "comment") {
            updated.comment = value;
          }

          updated.updatedAt = new Date();

          return updated;
        }),
      );
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    [accountLookup],
  );

  const duplicateRow = useCallback(
    (id: string) => {
      const source = localTransactions.find((transaction) => transaction.id === id);
      if (!source) return;
      const duplicated: LocalTransaction = {
        ...source,
        id: generateTempActivityId(),
        date: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        isNew: true,
      };
      setLocalTransactions((prev) => [duplicated, ...prev]);
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        next.add(duplicated.id);
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setTimeout(() => {
        setFocusedCell({ rowId: duplicated.id, field: "activityType" });
      }, 0);
    },
    [localTransactions],
  );

  const deleteRow = useCallback(
    (id: string) => {
      setLocalTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      const target = localTransactions.find((transaction) => transaction.id === id);
      if (target && !target.isNew) {
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
    },
    [localTransactions],
  );

  const deleteSelected = useCallback(() => {
    const idsToDelete = Array.from(selectedIds);
    idsToDelete.forEach((id) => deleteRow(id));
  }, [deleteRow, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === localTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(localTransactions.map((transaction) => transaction.id)));
    }
  }, [localTransactions, selectedIds.size]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleEditTransaction = useCallback(
    (activity: ActivityDetails) => {
      onEditActivity(activity);
      if (activity.id) {
        setFocusedCell({ rowId: activity.id, field: "activityType" });
      }
    },
    [onEditActivity],
  );

  const handleSaveChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return;

    const deleteIds = Array.from(pendingDeleteIds);
    const dirtyTransactions = localTransactions.filter((transaction) =>
      dirtyTransactionIds.has(transaction.id),
    );

    const creates: ActivityCreate[] = [];
    const updates: ActivityUpdate[] = [];

    dirtyTransactions.forEach((transaction) => {
      const payload = {
        id: transaction.id,
        accountId: transaction.accountId,
        activityType: transaction.activityType,
        activityDate:
          transaction.date instanceof Date
            ? transaction.date.toISOString()
            : new Date(transaction.date).toISOString(),
        assetId: transaction.assetSymbol || undefined,
        quantity: toFiniteNumberOrUndefined(transaction.quantity),
        unitPrice: toFiniteNumberOrUndefined(transaction.unitPrice),
        amount: toFiniteNumberOrUndefined(transaction.amount),
        currency: transaction.currency,
        fee: toFiniteNumberOrUndefined(transaction.fee),
        isDraft: false,
        comment: transaction.comment ?? undefined,
      };

      if (transaction.isNew) {
        creates.push(payload);
      } else {
        updates.push(payload as ActivityUpdate);
      }
    });

    const request: ActivityBulkMutationRequest = {
      creates,
      updates,
      deleteIds,
    };

    try {
      const result = await saveActivitiesMutation.mutateAsync(request);
      const createdMappings = new Map(
        (result.createdMappings ?? [])
          .filter((mapping) => mapping.tempId && mapping.activityId)
          .map((mapping) => [mapping.tempId!, mapping.activityId]),
      );

      setLocalTransactions((prev) =>
        prev
          .filter((transaction) => !pendingDeleteIds.has(transaction.id))
          .map((transaction) => {
            if (transaction.isNew) {
              const mappedId = createdMappings.get(transaction.id);
              if (mappedId) {
                return { ...transaction, id: mappedId, isNew: false };
              }
            }
            return transaction;
          }),
      );

      setDirtyTransactionIds(new Set());
      setPendingDeleteIds(new Set());
      setSelectedIds(new Set());

      toast({
        title: "Activities saved",
        description: "Your pending changes are now synced.",
        variant: "success",
      });

      await onRefetch();
    } catch {
      // Error surface handled by the mutation hook.
    }
  }, [
    dirtyTransactionIds,
    hasUnsavedChanges,
    localTransactions,
    pendingDeleteIds,
    onRefetch,
    saveActivitiesMutation,
  ]);

  const handleCancelChanges = useCallback(() => {
    setDirtyTransactionIds(new Set());
    setPendingDeleteIds(new Set());
    setSelectedIds(new Set());
    setLocalTransactions((prev) => prev.filter((transaction) => !transaction.isNew));
    onRefetch();
    toast({
      title: "Changes discarded",
      description: "Unsaved edits and drafts have been cleared.",
      variant: "default",
    });
  }, [onRefetch]);

  return (
    <div className="space-y-3">
      <div className="bg-muted/20 flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
        <div className="text-muted-foreground flex items-center gap-2.5 text-xs">
          {selectedIds.size > 0 && (
            <span className="font-medium">
              {selectedIds.size} row{selectedIds.size === 1 ? "" : "s"} selected
            </span>
          )}
          {hasUnsavedChanges && (
            <span className="text-primary font-medium">
              {dirtyTransactionIds.size + pendingDeleteIds.size} pending change
              {dirtyTransactionIds.size + pendingDeleteIds.size === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            onClick={addNewRow}
            variant="outline"
            size="xs"
            className="shrink-0 rounded-md"
            title="Add transaction"
            aria-label="Add transaction"
          >
            <Icons.Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </Button>

          {selectedIds.size > 0 && (
            <>
              <div className="bg-border mx-1 h-4 w-px" />
              <Button
                onClick={deleteSelected}
                size="xs"
                variant="destructive"
                className="shrink-0 rounded-md text-xs"
                title="Delete selected"
                aria-label="Delete selected"
                disabled={saveActivitiesMutation.isPending}
              >
                <Icons.Trash className="h-3.5 w-3.5" />
                <span>Delete</span>
              </Button>
            </>
          )}

          {hasUnsavedChanges && (
            <>
              <div className="bg-border mx-1 h-4 w-px" />
              <Button
                onClick={handleSaveChanges}
                size="xs"
                className="shrink-0 rounded-md text-xs"
                title="Save changes"
                aria-label="Save changes"
                disabled={saveActivitiesMutation.isPending}
              >
                {saveActivitiesMutation.isPending ? (
                  <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icons.Save className="h-3.5 w-3.5" />
                )}
                <span>Save</span>
              </Button>

              <Button
                onClick={handleCancelChanges}
                size="xs"
                variant="outline"
                className="shrink-0 rounded-md text-xs"
                title="Discard changes"
                aria-label="Discard changes"
                disabled={saveActivitiesMutation.isPending}
              >
                <Icons.Undo className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="bg-background overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-muted/30 h-9 w-12 border-r px-0 py-0">
                <div className="flex h-full items-center justify-center">
                  <Checkbox
                    checked={
                      localTransactions.length > 0 && selectedIds.size === localTransactions.length
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </div>
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                Type
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                Date & Time
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                Symbol
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-right text-xs font-semibold">
                Quantity
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-right text-xs font-semibold">
                Unit Price
              </TableHead>
              <TableHead className="bg-muted/30 h-9 w-24 border-r px-2 py-1.5 text-right text-xs font-semibold">
                Amount
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-right text-xs font-semibold">
                Fee
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-right text-xs font-semibold">
                Total
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                Account
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                Currency
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                Comment
              </TableHead>
              <TableHead className="bg-muted/30 h-9 px-2 py-1.5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {localTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-muted-foreground h-32 text-center">
                  No transactions yet. Click &quot;Add Transaction&quot; to get started.
                </TableCell>
              </TableRow>
            ) : (
              localTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  activityTypeOptions={activityTypeOptions}
                  accountOptions={accountOptions}
                  currencyOptions={currencyOptions}
                  accountLookup={accountLookup}
                  isSelected={selectedIds.has(transaction.id)}
                  isDirty={dirtyTransactionIds.has(transaction.id)}
                  focusedField={focusedCell?.rowId === transaction.id ? focusedCell.field : null}
                  onToggleSelect={toggleSelect}
                  onUpdateTransaction={updateTransaction}
                  onEditTransaction={handleEditTransaction}
                  onDuplicate={duplicateRow}
                  onDelete={deleteRow}
                  onNavigate={handleCellNavigation}
                  setFocusedCell={setFocusedCell}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface TransactionRowProps {
  transaction: LocalTransaction;
  activityTypeOptions: { value: string; label: string; searchValue?: string }[];
  accountOptions: { value: string; label: string; searchValue?: string }[];
  currencyOptions: { value: string; label: string; searchValue?: string }[];
  accountLookup: Map<string, Account>;
  isSelected: boolean;
  isDirty: boolean;
  focusedField: EditableField | null;
  onToggleSelect: (id: string) => void;
  onUpdateTransaction: (id: string, field: EditableField, value: string) => void;
  onEditTransaction: (transaction: ActivityDetails) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (direction: "up" | "down" | "left" | "right") => void;
  setFocusedCell: Dispatch<SetStateAction<CellCoordinate | null>>;
}

const TransactionRow = memo(
  function TransactionRow({
    transaction,
    activityTypeOptions,
    accountOptions,
    currencyOptions,
    accountLookup,
    isSelected,
    isDirty,
    focusedField,
    onToggleSelect,
    onUpdateTransaction,
    onEditTransaction,
    onDuplicate,
    onDelete,
    onNavigate,
    setFocusedCell,
  }: TransactionRowProps) {
    const handleFocus = useCallback(
      (field: EditableField) => {
        setFocusedCell({ rowId: transaction.id, field });
      },
      [setFocusedCell, transaction.id],
    );

    const accountLabel =
      accountLookup.get(transaction.accountId)?.name ?? transaction.accountName ?? "";
    const totalValue = calculateActivityValue(transaction);
    const currency = transaction.currency ?? transaction.accountCurrency ?? DEFAULT_CURRENCY;
    const assetSymbol = transaction.assetSymbol ?? "";
    const unitPriceDisplay = (() => {
      if (transaction.activityType === ActivityType.FEE) {
        return "-";
      }
      if (transaction.activityType === ActivityType.SPLIT) {
        const ratio = toFiniteNumberOrUndefined(transaction.amount);
        return ratio !== undefined ? `${ratio.toFixed(0)} : 1` : "";
      }
      if (
        isCashActivity(transaction.activityType) ||
        isIncomeActivity(transaction.activityType) ||
        isCashTransfer(transaction.activityType, assetSymbol)
      ) {
        return formatAmountDisplay(transaction.amount, currency);
      }
      return formatAmountDisplay(transaction.unitPrice, currency);
    })();
    const amountDisplay =
      transaction.activityType === ActivityType.SPLIT
        ? getNumericCellValue(transaction.amount)
        : formatAmountDisplay(transaction.amount, currency);
    const feeDisplay =
      transaction.activityType === ActivityType.SPLIT
        ? "-"
        : formatAmountDisplay(transaction.fee, currency);
    const totalDisplay =
      transaction.activityType === ActivityType.SPLIT
        ? "-"
        : formatAmountDisplay(totalValue, currency);

    return (
      <TableRow
        className={cn(
          "group hover:bg-muted/40",
          isSelected && "bg-muted/60",
          transaction.isNew && "bg-primary/5",
          isDirty && "border-l-primary border-l-2",
        )}
      >
        <TableCell className="h-9 w-12 border-r px-0 py-0 text-center">
          <div className="flex h-full items-center justify-center">
            <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(transaction.id)} />
          </div>
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SelectCell
            value={transaction.activityType}
            options={activityTypeOptions}
            onChange={(value) => onUpdateTransaction(transaction.id, "activityType", value)}
            onFocus={() => handleFocus("activityType")}
            onNavigate={onNavigate}
            isFocused={focusedField === "activityType"}
            renderValue={(value) => (
              <ActivityTypeBadge type={value as ActivityType} className="font-mono text-xs" />
            )}
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <EditableCell
            value={formatDateInputValue(transaction.date)}
            displayValue={formatDateDisplayValue(transaction.date)}
            onChange={(value) => onUpdateTransaction(transaction.id, "date", value)}
            onFocus={() => handleFocus("date")}
            onNavigate={onNavigate}
            isFocused={focusedField === "date"}
            type="datetime-local"
            className="font-mono"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SymbolAutocompleteCell
            value={transaction.assetSymbol ?? ""}
            onChange={(value) =>
              onUpdateTransaction(transaction.id, "assetSymbol", value.toUpperCase())
            }
            onFocus={() => handleFocus("assetSymbol")}
            onNavigate={onNavigate}
            isFocused={focusedField === "assetSymbol"}
            className="font-mono text-xs font-semibold uppercase"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0 text-right">
          <EditableCell
            value={getNumericCellValue(transaction.quantity)}
            onChange={(value) => onUpdateTransaction(transaction.id, "quantity", value)}
            onFocus={() => handleFocus("quantity")}
            onNavigate={onNavigate}
            isFocused={focusedField === "quantity"}
            type="number"
            inputMode="decimal"
            className="justify-end text-right font-mono tabular-nums"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0 text-right">
          <EditableCell
            value={getNumericCellValue(transaction.unitPrice)}
            displayValue={unitPriceDisplay}
            onChange={(value) => onUpdateTransaction(transaction.id, "unitPrice", value)}
            onFocus={() => handleFocus("unitPrice")}
            onNavigate={onNavigate}
            isFocused={focusedField === "unitPrice"}
            type="number"
            inputMode="decimal"
            step="0.01"
            className="justify-end text-right font-mono tabular-nums"
          />
        </TableCell>
        <TableCell className="h-9 w-24 border-r px-0 py-0 text-right">
          <EditableCell
            value={getNumericCellValue(transaction.amount)}
            displayValue={amountDisplay}
            onChange={(value) => onUpdateTransaction(transaction.id, "amount", value)}
            onFocus={() => handleFocus("amount")}
            onNavigate={onNavigate}
            isFocused={focusedField === "amount"}
            type="number"
            inputMode="decimal"
            step="0.01"
            className="justify-end text-right font-mono tabular-nums"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0 text-right">
          <EditableCell
            value={getNumericCellValue(transaction.fee)}
            displayValue={feeDisplay}
            onChange={(value) => onUpdateTransaction(transaction.id, "fee", value)}
            onFocus={() => handleFocus("fee")}
            onNavigate={onNavigate}
            isFocused={focusedField === "fee"}
            type="number"
            inputMode="decimal"
            step="0.01"
            className="justify-end text-right font-mono tabular-nums"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-2 py-1.5 text-right">
          <span className="font-mono text-xs font-semibold tabular-nums">{totalDisplay}</span>
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SelectCell
            value={transaction.accountId ?? ""}
            options={accountOptions}
            onChange={(value) => onUpdateTransaction(transaction.id, "accountId", value)}
            onFocus={() => handleFocus("accountId")}
            onNavigate={onNavigate}
            isFocused={focusedField === "accountId"}
            renderValue={() => accountLabel || transaction.accountId || ""}
            className="text-xs"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SelectCell
            value={transaction.currency ?? ""}
            options={currencyOptions}
            onChange={(value) => onUpdateTransaction(transaction.id, "currency", value)}
            onFocus={() => handleFocus("currency")}
            onNavigate={onNavigate}
            isFocused={focusedField === "currency"}
            className="font-mono text-xs"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <EditableCell
            value={transaction.comment ?? ""}
            onChange={(value) => onUpdateTransaction(transaction.id, "comment", value)}
            onFocus={() => handleFocus("comment")}
            onNavigate={onNavigate}
            isFocused={focusedField === "comment"}
            className="text-muted-foreground"
          />
        </TableCell>
        <TableCell className="h-9 px-2 py-0">
          <div className="pointer-events-none flex justify-end opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            <ActivityOperations
              activity={transaction}
              onEdit={onEditTransaction}
              onDuplicate={(activity) => onDuplicate(activity.id)}
              onDelete={(activity) => onDelete(activity.id)}
            />
          </div>
        </TableCell>
      </TableRow>
    );
  },
  function areEqualTransactionRowProps(prev, next) {
    return (
      prev.transaction === next.transaction &&
      prev.isSelected === next.isSelected &&
      prev.isDirty === next.isDirty &&
      prev.focusedField === next.focusedField &&
      prev.activityTypeOptions === next.activityTypeOptions &&
      prev.accountOptions === next.accountOptions &&
      prev.currencyOptions === next.currencyOptions &&
      prev.accountLookup === next.accountLookup &&
      prev.onToggleSelect === next.onToggleSelect &&
      prev.onUpdateTransaction === next.onUpdateTransaction &&
      prev.onEditTransaction === next.onEditTransaction &&
      prev.onDuplicate === next.onDuplicate &&
      prev.onDelete === next.onDelete &&
      prev.onNavigate === next.onNavigate &&
      prev.setFocusedCell === next.setFocusedCell
    );
  },
);
