import React, { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { Quote } from "@/lib/types";
import { useTranslation } from "react-i18next";

import {
  Button,
  Input,
  Icons,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  DatePickerInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Label,
  MoneyInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  formatAmount,
} from "@wealthfolio/ui";
import { formatQuantity } from "@/lib/utils";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  SortingState,
} from "@tanstack/react-table";

interface QuoteHistoryTableProps {
  data: Quote[];
  isManualDataSource?: boolean;
  onSaveQuote?: (quote: Quote) => void;
  onDeleteQuote?: (quoteId: string) => void;
  onChangeDataSource?: (isManual: boolean) => void;
}

const ITEMS_PER_PAGE = 10;

const emptyQuote: Partial<Quote> = {
  timestamp: new Date().toISOString(),
  open: 0,
  high: 0,
  low: 0,
  close: 0,
  volume: 0,
  adjclose: 0,
};

export const QuoteHistoryTable: React.FC<QuoteHistoryTableProps> = ({
  data,
  isManualDataSource = false,
  onSaveQuote,
  onDeleteQuote,
  onChangeDataSource,
}) => {
  const { t } = useTranslation(["assets"]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Partial<Quote>>({});
  const [isAddingQuote, setIsAddingQuote] = useState(false);
  const [newQuote, setNewQuote] = useState<Partial<Quote>>(emptyQuote);
  const [sorting, setSorting] = useState<SortingState>([{ id: "timestamp", desc: true }]);

  useEffect(() => {
    if (isAddingQuote) {
      setNewQuote(emptyQuote);
    }
  }, [isAddingQuote]);

  // Define handlers before they are used in columns
  const handleEdit = useCallback((quote: Quote) => {
    setEditingId(quote.id);
    setEditedValues(quote);
  }, []);

  const handleSave = useCallback(() => {
    if (editingId && onSaveQuote && editedValues) {
      onSaveQuote({ ...editedValues } as Quote);
      setEditingId(null);
      setEditedValues({});
    }
  }, [editingId, onSaveQuote, editedValues]);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditedValues({});
  }, []);

  const handleInputChange = useCallback(
    (field: keyof Quote, value: string | Date, isNew = false) => {
      const setValue = field === "timestamp" ? (value as Date).toISOString() : value;

      if (isNew) {
        setNewQuote((prev) => ({
          ...prev,
          [field]: setValue,
        }));
      } else {
        setEditedValues((prev) => ({
          ...prev,
          [field]: setValue,
        }));
      }
    },
    [],
  );

  const handleAddNew = useCallback(() => {
    if (onSaveQuote) {
      onSaveQuote({ ...newQuote } as Quote);
      setIsAddingQuote(false);
      setNewQuote(emptyQuote);
    }
  }, [onSaveQuote, newQuote]);

  const handleDelete = useCallback(
    (quoteId: string) => {
      if (onDeleteQuote) {
        onDeleteQuote(quoteId);
      }
    },
    [onDeleteQuote],
  );

  // Define columns using ColumnHelper
  const columnHelper = createColumnHelper<Quote>();

  interface QuoteTableMeta {
    editingId: string | null;
    editedValues: Record<string, unknown> & {
      timestamp?: string | Date;
      open?: number | string;
      high?: number | string;
      low?: number | string;
      close?: number | string;
      volume?: number | string;
    };
    handleInputChange: (key: keyof Quote | "timestamp", value: unknown, isNewRow?: boolean) => void;
    handleEdit: (quote: Quote) => void;
    handleSave: () => void;
    handleCancel: () => void;
    handleDelete: (quoteId: string) => void;
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor("timestamp", {
        header: () => t("assets:quotesTable.date"),
        cell: (info) => {
          const { editingId, editedValues, handleInputChange } = info.table.options
            .meta as QuoteTableMeta;
          const value = info.getValue();
          return editingId === info.row.original.id ? (
            <DatePickerInput
              value={new Date(editedValues.timestamp || "")}
              onChange={(date: Date | undefined) => date && handleInputChange("timestamp", date)}
            />
          ) : (
            format(new Date(value), "yyyy-MM-dd")
          );
        },
        enableSorting: true,
      }),
      columnHelper.accessor("open", {
        header: () => t("assets:quotesTable.open"),
        cell: (info) => {
          const { editingId, editedValues, handleInputChange } = info.table.options
            .meta as QuoteTableMeta;
          const value = info.getValue();
          return editingId === info.row.original.id ? (
            <MoneyInput
              value={editedValues.open}
              onChange={(e) => handleInputChange("open", e.target.value)}
            />
          ) : (
            formatAmount(value, info.row.original.currency, false)
          );
        },
        enableSorting: false,
      }),
      columnHelper.accessor("high", {
        header: () => t("assets:quotesTable.high"),
        cell: (info) => {
          const { editingId, editedValues, handleInputChange } = info.table.options
            .meta as QuoteTableMeta;
          const value = info.getValue();
          return editingId === info.row.original.id ? (
            <MoneyInput
              value={editedValues.high}
              onChange={(e) => handleInputChange("high", e.target.value)}
              autoFocus={true}
            />
          ) : (
            formatAmount(value, info.row.original.currency, false)
          );
        },
        enableSorting: false,
      }),
      columnHelper.accessor("low", {
        header: () => t("assets:quotesTable.low"),
        cell: (info) => {
          const { editingId, editedValues, handleInputChange } = info.table.options
            .meta as QuoteTableMeta;
          const value = info.getValue();
          return editingId === info.row.original.id ? (
            <MoneyInput
              value={editedValues.low}
              onChange={(e) => handleInputChange("low", e.target.value)}
            />
          ) : (
            formatAmount(value, info.row.original.currency, false)
          );
        },
        enableSorting: false,
      }),
      columnHelper.accessor("close", {
        header: () => t("assets:quotesTable.close"),
        cell: (info) => {
          const { editingId, editedValues, handleInputChange } = info.table.options
            .meta as QuoteTableMeta;
          const value = info.getValue();
          return editingId === info.row.original.id ? (
            <MoneyInput
              value={editedValues.close}
              onChange={(e) => handleInputChange("close", e.target.value)}
            />
          ) : (
            formatAmount(value, info.row.original.currency, false)
          );
        },
        enableSorting: false,
      }),
      columnHelper.accessor("volume", {
        header: () => t("assets:quotesTable.volume"),
        cell: (info) => {
          const { editingId, editedValues, handleInputChange } = info.table.options
            .meta as QuoteTableMeta;
          const value = info.getValue();
          return editingId === info.row.original.id ? (
            <MoneyInput
              value={editedValues.volume}
              onChange={(e) => handleInputChange("volume", e.target.value)}
            />
          ) : (
            formatQuantity(value)
          );
        },
        enableSorting: false,
      }),
      ...(isManualDataSource
        ? [
            columnHelper.display({
              id: "actions",
              header: () => t("assets:quotesTable.actions"),
              cell: (info) => {
                const { editingId, handleEdit, handleSave, handleCancel, handleDelete } = info.table
                  .options.meta as QuoteTableMeta;
                const quote = info.row.original;
                return editingId === quote.id ? (
                  <div className="flex space-x-2">
                    <Button variant="ghost" size="icon" onClick={handleSave} className="h-8 w-8">
                      <Icons.Check className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleCancel} className="h-8 w-8">
                      <Icons.Close className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(quote)}
                      className="h-8 w-8"
                    >
                      <Icons.Pencil className="h-4 w-4" />
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Icons.Trash className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent>
                        <div className="flex flex-col items-center space-y-2">
                          <h4 className="font-medium">{t("assets:quotesTable.deleteQuote")}</h4>
                          <p className="text-muted-foreground text-center text-sm">
                            {t("assets:quotesTable.deleteConfirmation")}
                          </p>
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">
                              {t("assets:quotesTable.cancel")}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(quote.id)}
                            >
                              {t("assets:quotesTable.delete")}
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                );
              },
            }),
          ]
        : []),
    ],
    [isManualDataSource, handleInputChange, handleEdit, handleSave, handleCancel, handleDelete],
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    meta: {
      editingId,
      editedValues,
      handleInputChange,
      handleEdit,
      handleSave,
      handleCancel,
      handleDelete,
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: ITEMS_PER_PAGE,
      },
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: false,
  });

  return (
    <div className="space-y-4">
      <div className="">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center space-x-2">
            {/* <h4 className="text-sm font-medium">Quote History</h4> */}
          </div>
          <div className="flex items-center space-x-4">
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex items-center space-x-2">
                  <Switch id="manual-tracking" checked={isManualDataSource} />
                  <Label htmlFor="manual-tracking" className="cursor-pointer">
                    {t("assets:quotesTable.manualTracking")}
                  </Label>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[360px] p-4">
                <div className="space-y-4">
                  <h4 className="font-medium">{t("assets:quotesTable.changeMode.title")}</h4>
                  {isManualDataSource ? (
                    <>
                      <p className="text-muted-foreground text-sm">
                        {t("assets:quotesTable.changeMode.toAutomatic")}
                      </p>
                      <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                        {t("assets:quotesTable.changeMode.warningAutomatic")}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground text-sm">
                        {t("assets:quotesTable.changeMode.toManual")}
                      </p>
                      <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                        {t("assets:quotesTable.changeMode.warningManual")}
                      </p>
                    </>
                  )}
                  <div className="flex justify-end space-x-2">
                    <Button variant="ghost" size="sm">
                      {t("assets:quotesTable.cancel")}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onChangeDataSource?.(!isManualDataSource)}
                    >
                      {t("assets:quotesTable.changeMode.confirm")}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {isManualDataSource && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsAddingQuote(true)}
                disabled={isAddingQuote}
              >
                <Icons.PlusCircle className="mr-2 h-4 w-4" />
                {t("assets:quotesTable.addQuote")}
              </Button>
            )}
          </div>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader className="bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isAddingQuote && (
                <TableRow>
                  <TableCell>
                    <DatePickerInput
                      value={new Date(newQuote.timestamp || "")}
                      onChange={(date: Date | undefined) =>
                        date && handleInputChange("timestamp", date, true)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={newQuote.open}
                      onChange={(e) => handleInputChange("open", e.target.value, true)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={newQuote.high}
                      onChange={(e) => handleInputChange("high", e.target.value, true)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={newQuote.low}
                      onChange={(e) => handleInputChange("low", e.target.value, true)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={newQuote.close}
                      onChange={(e) => handleInputChange("close", e.target.value, true)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={newQuote.volume}
                      onChange={(e) => handleInputChange("volume", e.target.value, true)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleAddNew}
                        className="h-8 w-8"
                      >
                        <Icons.Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsAddingQuote(false)}
                        className="h-8 w-8"
                      >
                        <Icons.Close className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-sm">
          {t("assets:quotesTable.page")} {table.getState().pagination.pageIndex + 1}{" "}
          {t("assets:quotesTable.of")} {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {t("assets:quotesTable.previous")}
          </Button>
          <Select
            value={(table.getState().pagination.pageIndex + 1).toString()}
            onValueChange={(value) => table.setPageIndex(parseInt(value) - 1)}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder={`${t("assets:quotesTable.page")}...`} />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: table.getPageCount() }, (_, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>
                  {t("assets:quotesTable.page")} {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {t("assets:quotesTable.next")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuoteHistoryTable;
