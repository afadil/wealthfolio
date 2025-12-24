"use client";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { TableMeta } from "@tanstack/react-table";
import * as React from "react";
import { cn } from "../../lib/utils";
import type { PasteDialogState } from "./data-grid-types";

interface DataGridPasteDialogProps<TData> {
  tableMeta: TableMeta<TData>;
  pasteDialog: PasteDialogState;
}

export function DataGridPasteDialog<TData>({
  tableMeta,
  pasteDialog,
}: DataGridPasteDialogProps<TData>) {
  const onPasteDialogOpenChange = tableMeta?.onPasteDialogOpenChange;
  const onPasteWithExpansion = tableMeta?.onPasteWithExpansion;
  const onPasteWithoutExpansion = tableMeta?.onPasteWithoutExpansion;

  if (!pasteDialog.open) return null;

  return (
    <PasteDialog
      pasteDialog={pasteDialog}
      onPasteDialogOpenChange={onPasteDialogOpenChange}
      onPasteWithExpansion={onPasteWithExpansion}
      onPasteWithoutExpansion={onPasteWithoutExpansion}
    />
  );
}

interface PasteDialogProps
  extends Pick<
      TableMeta<unknown>,
      | "onPasteDialogOpenChange"
      | "onPasteWithExpansion"
      | "onPasteWithoutExpansion"
    >,
    Required<Pick<TableMeta<unknown>, "pasteDialog">> {}

const PasteDialog = React.memo(PasteDialogImpl, (prev, next) => {
  if (prev.pasteDialog.open !== next.pasteDialog.open) return false;
  if (!next.pasteDialog.open) return true;
  if (prev.pasteDialog.rowsNeeded !== next.pasteDialog.rowsNeeded) return false;

  return true;
});

function PasteDialogImpl({
  pasteDialog,
  onPasteDialogOpenChange,
  onPasteWithExpansion,
  onPasteWithoutExpansion,
}: PasteDialogProps) {
  const expandRadioRef = React.useRef<HTMLInputElement | null>(null);

  const onCancel = React.useCallback(() => {
    onPasteDialogOpenChange?.(false);
  }, [onPasteDialogOpenChange]);

  const onContinue = React.useCallback(() => {
    if (expandRadioRef.current?.checked) {
      onPasteWithExpansion?.();
    } else {
      onPasteWithoutExpansion?.();
    }
  }, [onPasteWithExpansion, onPasteWithoutExpansion]);

  return (
    <Dialog open={pasteDialog.open} onOpenChange={onPasteDialogOpenChange}>
      <DialogContent data-grid-popover="">
        <DialogHeader>
          <DialogTitle>Do you want to add more rows?</DialogTitle>
          <DialogDescription>
            We need <strong>{pasteDialog.rowsNeeded}</strong> additional row
            {pasteDialog.rowsNeeded !== 1 ? "s" : ""} to paste everything from
            your clipboard.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <label className="flex cursor-pointer items-start gap-3">
            <RadioItem
              ref={expandRadioRef}
              name="expand-option"
              value="expand"
              defaultChecked
            />
            <div className="flex flex-col gap-1">
              <span className="font-medium text-sm leading-none">
                Create new rows
              </span>
              <span className="text-muted-foreground text-sm">
                Add {pasteDialog.rowsNeeded} new row
                {pasteDialog.rowsNeeded !== 1 ? "s" : ""} to the table and paste
                all data
              </span>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <RadioItem name="expand-option" value="no-expand" />
            <div className="flex flex-col gap-1">
              <span className="font-medium text-sm leading-none">
                Keep current rows
              </span>
              <span className="text-muted-foreground text-sm">
                Paste only what fits in the existing rows
              </span>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onContinue}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RadioItem({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="radio"
      className={cn(
        "relative size-4 shrink-0 appearance-none rounded-full border border-input bg-background shadow-xs outline-none transition-[color,box-shadow]",
        "text-primary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "checked:before:-translate-x-1/2 checked:before:-translate-y-1/2 checked:before:absolute checked:before:start-1/2 checked:before:top-1/2 checked:before:size-2 checked:before:rounded-full checked:before:bg-primary checked:before:content-['']",
        "dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
