"use client";

import type { Header, SortDirection, Table } from "@tanstack/react-table";
import * as React from "react";
import { Icons } from "../ui/icons";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import type { DataGridColumnHeaderMenuLabels } from "./data-grid-types";
import { getColumnVariant } from "./data-grid-utils";

const DEFAULT_COLUMN_HEADER_MENU_LABELS: DataGridColumnHeaderMenuLabels = {
  sortAsc: "Sort ascending",
  sortDesc: "Sort descending",
  removeSort: "Remove sort",
  pinToLeft: "Pin to left",
  unpinFromLeft: "Unpin from left",
  pinToRight: "Pin to right",
  unpinFromRight: "Unpin from right",
  hideColumn: "Hide column",
  resizeColumnAria: (columnLabel) => `Resize ${columnLabel} column`,
};

function mergeColumnHeaderMenuLabels(
  overrides?: Partial<DataGridColumnHeaderMenuLabels>,
): DataGridColumnHeaderMenuLabels {
  const d = DEFAULT_COLUMN_HEADER_MENU_LABELS;
  return {
    sortAsc: overrides?.sortAsc ?? d.sortAsc,
    sortDesc: overrides?.sortDesc ?? d.sortDesc,
    removeSort: overrides?.removeSort ?? d.removeSort,
    pinToLeft: overrides?.pinToLeft ?? d.pinToLeft,
    unpinFromLeft: overrides?.unpinFromLeft ?? d.unpinFromLeft,
    pinToRight: overrides?.pinToRight ?? d.pinToRight,
    unpinFromRight: overrides?.unpinFromRight ?? d.unpinFromRight,
    hideColumn: overrides?.hideColumn ?? d.hideColumn,
    resizeColumnAria: overrides?.resizeColumnAria ?? d.resizeColumnAria,
  };
}

interface DataGridColumnHeaderProps<TData, TValue> extends React.ComponentProps<typeof DropdownMenuTrigger> {
  header: Header<TData, TValue>;
  table: Table<TData>;
}

export function DataGridColumnHeader<TData, TValue>({
  header,
  table,
  className,
  onPointerDown,
  ...props
}: DataGridColumnHeaderProps<TData, TValue>) {
  const column = header.column;
  const menuLabels = React.useMemo(
    () => mergeColumnHeaderMenuLabels(table.options.meta?.columnHeaderMenuLabels),
    [table.options.meta?.columnHeaderMenuLabels],
  );

  const label = column.columnDef.meta?.label
    ? column.columnDef.meta.label
    : typeof column.columnDef.header === "string"
      ? column.columnDef.header
      : column.id;

  const isAnyColumnResizing = table.getState().columnSizingInfo.isResizingColumn;

  const cellVariant = column.columnDef.meta?.cell;
  const columnVariant = getColumnVariant(cellVariant?.variant);

  const pinnedPosition = column.getIsPinned();
  const isPinnedLeft = pinnedPosition === "left";
  const isPinnedRight = pinnedPosition === "right";

  const onSortingChange = React.useCallback(
    (direction: SortDirection) => {
      // Single-column sorting: replace entire array with just this column's sort
      table.setSorting([
        {
          id: column.id,
          desc: direction === "desc",
        },
      ]);
    },
    [column.id, table],
  );

  const onSortRemove = React.useCallback(() => {
    table.setSorting([]);
  }, [table]);

  const onLeftPin = React.useCallback(() => {
    column.pin("left");
  }, [column]);

  const onRightPin = React.useCallback(() => {
    column.pin("right");
  }, [column]);

  const onUnpin = React.useCallback(() => {
    column.pin(false);
  }, [column]);

  const onTriggerPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event);
      if (event.defaultPrevented) return;

      if (event.button !== 0) {
        return;
      }
      table.options.meta?.onColumnClick?.(column.id);
    },
    [table.options.meta, column.id, onPointerDown],
  );

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          className={cn(
            "hover:bg-accent/40 data-[state=open]:bg-accent/40 flex size-full items-center justify-between gap-2 p-2 text-sm [&_svg]:size-4",
            isAnyColumnResizing && "pointer-events-none",
            className,
          )}
          onPointerDown={onTriggerPointerDown}
          {...props}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {columnVariant && (
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <columnVariant.icon className="text-muted-foreground size-3.5 shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{columnVariant.label}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <span className="truncate">{label}</span>
          </div>
          <Icons.ChevronDown className="text-muted-foreground shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={0} className="w-60">
          {column.getCanSort() && (
            <>
              <DropdownMenuCheckboxItem
                className="[&_svg]:text-muted-foreground relative ltr:pl-2 ltr:pr-8 rtl:pl-8 rtl:pr-2 [&>span:first-child]:ltr:left-auto [&>span:first-child]:ltr:right-2 [&>span:first-child]:rtl:left-2 [&>span:first-child]:rtl:right-auto"
                checked={column.getIsSorted() === "asc"}
                onClick={() => onSortingChange("asc")}
              >
                <Icons.ChevronUp />
                {menuLabels.sortAsc}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                className="[&_svg]:text-muted-foreground relative ltr:pl-2 ltr:pr-8 rtl:pl-8 rtl:pr-2 [&>span:first-child]:ltr:left-auto [&>span:first-child]:ltr:right-2 [&>span:first-child]:rtl:left-2 [&>span:first-child]:rtl:right-auto"
                checked={column.getIsSorted() === "desc"}
                onClick={() => onSortingChange("desc")}
              >
                <Icons.ChevronDown />
                {menuLabels.sortDesc}
              </DropdownMenuCheckboxItem>
              {column.getIsSorted() && (
                <DropdownMenuItem onClick={onSortRemove}>
                  <Icons.X />
                  {menuLabels.removeSort}
                </DropdownMenuItem>
              )}
            </>
          )}
          {column.getCanPin() && (
            <>
              {column.getCanSort() && <DropdownMenuSeparator />}

              {isPinnedLeft ? (
                <DropdownMenuItem className="[&_svg]:text-muted-foreground" onClick={onUnpin}>
                  <Icons.PinOff />
                  {menuLabels.unpinFromLeft}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="[&_svg]:text-muted-foreground" onClick={onLeftPin}>
                  <Icons.Pin />
                  {menuLabels.pinToLeft}
                </DropdownMenuItem>
              )}
              {isPinnedRight ? (
                <DropdownMenuItem className="[&_svg]:text-muted-foreground" onClick={onUnpin}>
                  <Icons.PinOff />
                  {menuLabels.unpinFromRight}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="[&_svg]:text-muted-foreground" onClick={onRightPin}>
                  <Icons.Pin />
                  {menuLabels.pinToRight}
                </DropdownMenuItem>
              )}
            </>
          )}
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="[&_svg]:text-muted-foreground"
                onClick={() => column.toggleVisibility(false)}
              >
                <Icons.EyeOff />
                {menuLabels.hideColumn}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {header.column.getCanResize() && (
        <DataGridColumnResizer
          header={header}
          table={table}
          label={label}
          resizeColumnAria={menuLabels.resizeColumnAria}
        />
      )}
    </>
  );
}

const DataGridColumnResizer = React.memo(DataGridColumnResizerImpl, (prev, next) => {
  const prevColumn = prev.header.column;
  const nextColumn = next.header.column;

  if (prevColumn.getIsResizing() !== nextColumn.getIsResizing() || prevColumn.getSize() !== nextColumn.getSize()) {
    return false;
  }

  if (prev.label !== next.label) return false;

  if (prev.resizeColumnAria !== next.resizeColumnAria) return false;

  return true;
}) as typeof DataGridColumnResizerImpl;

interface DataGridColumnResizerProps<TData, TValue> extends DataGridColumnHeaderProps<TData, TValue> {
  label: string;
  resizeColumnAria: (columnLabel: string) => string;
}

function DataGridColumnResizerImpl<TData, TValue>({
  header,
  table,
  label,
  resizeColumnAria,
}: DataGridColumnResizerProps<TData, TValue>) {
  const defaultColumnDef = table._getDefaultColumnDef();

  const onDoubleClick = React.useCallback(() => {
    header.column.resetSize();
  }, [header.column]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={resizeColumnAria(label)}
      aria-valuenow={header.column.getSize()}
      aria-valuemin={defaultColumnDef.minSize}
      aria-valuemax={defaultColumnDef.maxSize}
      tabIndex={0}
      className={cn(
        "bg-border hover:bg-primary focus:bg-primary absolute -end-px top-0 z-50 h-full w-0.5 cursor-ew-resize touch-none select-none transition-opacity after:absolute after:inset-y-0 after:start-1/2 after:h-full after:w-[18px] after:-translate-x-1/2 after:content-[''] focus:outline-none",
        header.column.getIsResizing() ? "bg-primary" : "opacity-0 hover:opacity-100",
      )}
      onDoubleClick={onDoubleClick}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
    />
  );
}
