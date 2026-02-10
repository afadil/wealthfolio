"use client";

import * as React from "react";
import { useComposedRefs } from "../../lib/compose-refs";
import { cn } from "../../lib/utils";
import type { CellValidationState, DataGridCellProps } from "./data-grid-types";
import { getCellKey } from "./data-grid-utils";

interface DataGridCellWrapperProps<TData> extends DataGridCellProps<TData>, React.ComponentProps<"div"> {
  /** Cell validation state for error/warning highlighting */
  cellState?: CellValidationState;
}

export function DataGridCellWrapper<TData>({
  tableMeta,
  rowIndex,
  columnId,
  isEditing,
  isFocused,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  readOnly,
  rowHeight,
  cellState,
  className,
  onClick: onClickProp,
  onKeyDown: onKeyDownProp,
  ref,
  ...props
}: DataGridCellWrapperProps<TData>) {
  const cellMapRef = tableMeta?.cellMapRef;

  const onCellChange = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!cellMapRef) return;

      const cellKey = getCellKey(rowIndex, columnId);

      if (node) {
        cellMapRef.current.set(cellKey, node);
      } else {
        cellMapRef.current.delete(cellKey);
      }
    },
    [rowIndex, columnId, cellMapRef],
  );

  const composedRef = useComposedRefs(ref, onCellChange);

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isEditing) {
        event.preventDefault();
        onClickProp?.(event);
        if (isFocused && !readOnly) {
          tableMeta?.onCellEditingStart?.(rowIndex, columnId);
        } else {
          tableMeta?.onCellClick?.(rowIndex, columnId, event);
        }
      }
    },
    [tableMeta, rowIndex, columnId, isEditing, isFocused, readOnly, onClickProp],
  );

  const onContextMenu = React.useCallback(
    (event: React.MouseEvent) => {
      if (!isEditing) {
        tableMeta?.onCellContextMenu?.(rowIndex, columnId, event);
      }
    },
    [tableMeta, rowIndex, columnId, isEditing],
  );

  const onDoubleClick = React.useCallback(
    (event: React.MouseEvent) => {
      if (!isEditing) {
        event.preventDefault();
        tableMeta?.onCellDoubleClick?.(rowIndex, columnId);
      }
    },
    [tableMeta, rowIndex, columnId, isEditing],
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDownProp?.(event);

      if (event.defaultPrevented) return;

      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "Home" ||
        event.key === "End" ||
        event.key === "PageUp" ||
        event.key === "PageDown" ||
        event.key === "Tab"
      ) {
        return;
      }

      if (isFocused && !isEditing && !readOnly) {
        if (event.key === "F2" || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          tableMeta?.onCellEditingStart?.(rowIndex, columnId);
          return;
        }

        if (event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          tableMeta?.onCellEditingStart?.(rowIndex, columnId);
          return;
        }

        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          tableMeta?.onCellEditingStart?.(rowIndex, columnId);
        }
      }
    },
    [onKeyDownProp, isFocused, isEditing, readOnly, tableMeta, rowIndex, columnId],
  );

  const onMouseDown = React.useCallback(
    (event: React.MouseEvent) => {
      if (!isEditing) {
        tableMeta?.onCellMouseDown?.(rowIndex, columnId, event);
      }
    },
    [tableMeta, rowIndex, columnId, isEditing],
  );

  const onMouseEnter = React.useCallback(
    (event: React.MouseEvent) => {
      if (!isEditing) {
        tableMeta?.onCellMouseEnter?.(rowIndex, columnId, event);
      }
    },
    [tableMeta, rowIndex, columnId, isEditing],
  );

  const onMouseUp = React.useCallback(() => {
    if (!isEditing) {
      tableMeta?.onCellMouseUp?.();
    }
  }, [tableMeta, isEditing]);

  // Compute cell validation background style (matches ImportAlert component: 10% opacity)
  const cellStateStyle = React.useMemo(() => {
    if (isSelected || isSearchMatch || !cellState) return undefined;
    if (cellState.type === "error") {
      return { backgroundColor: "color-mix(in oklab, var(--destructive) 10%, transparent)" };
    }
    if (cellState.type === "warning") {
      return { backgroundColor: "color-mix(in oklab, var(--warning) 10%, transparent)" };
    }
    return undefined;
  }, [cellState, isSelected, isSearchMatch]);

  // Use native title attribute for tooltip (performant with virtualization)
  const cellTitle = React.useMemo(() => {
    if (!cellState?.messages?.length) return undefined;
    return cellState.messages.join("\n");
  }, [cellState]);

  return (
    <div
      role="button"
      data-slot="grid-cell-wrapper"
      data-editing={isEditing ? "" : undefined}
      data-focused={isFocused ? "" : undefined}
      data-selected={isSelected ? "" : undefined}
      data-cell-state={cellState?.type}
      tabIndex={isFocused && !isEditing ? 0 : -1}
      title={cellTitle}
      {...props}
      ref={composedRef}
      style={{ ...props.style, ...cellStateStyle }}
      className={cn(
        "has-data-[slot=checkbox]:pt-2.5 size-full px-2 py-1.5 text-start text-sm outline-none",
        {
          "ring-ring ring-1 ring-inset": isFocused,
          "bg-yellow-100 dark:bg-yellow-900/30": isSearchMatch && !isActiveSearchMatch,
          "bg-orange-200 dark:bg-orange-900/50": isActiveSearchMatch,
          "bg-primary/10": isSelected && !isEditing,
          "cursor-default": !isEditing,
          "**:data-[slot=grid-cell-content]:line-clamp-1": !isEditing && rowHeight === "short",
          "**:data-[slot=grid-cell-content]:line-clamp-2": !isEditing && rowHeight === "medium",
          "**:data-[slot=grid-cell-content]:line-clamp-3": !isEditing && rowHeight === "tall",
          "**:data-[slot=grid-cell-content]:line-clamp-4": !isEditing && rowHeight === "extra-tall",
        },
        className,
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseUp={onMouseUp}
      onKeyDown={onKeyDown}
    />
  );
}
