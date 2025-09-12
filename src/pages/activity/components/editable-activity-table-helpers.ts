import type { ColumnDef, ColumnMeta } from "@tanstack/react-table";
import type { ZodType, ZodTypeDef } from "zod";
import React from "react";

export type ExtendedColumnDef<TData extends object, TValue = unknown> = ColumnDef<TData, TValue> & {
  id?: string;
  accessorKey?: string;
  validationSchema?: ZodType<any, ZodTypeDef, any>;
  className?: string | ((row: TData) => string);
  style?: React.CSSProperties;
  meta?: ColumnMeta<TData, TValue> & {
    type?:
      | "text"
      | "number"
      | "date"
      | "select"
      | "activityTypeSelect"
      | "assetSymbolSearch"
      | "string"
      | "quantityInput"
      | "moneyInput"
      | "accountSelect"
      | "currencySelect";
    options?: Array<{ label: string; value: any }>;
  };
};

export function getColumnKey<T extends object>(colDef: ExtendedColumnDef<T>): string {
  return colDef.id ?? colDef.accessorKey ?? "";
}

export function parseAndValidate<T extends object>(
  rawValue: string,
  colDef: ExtendedColumnDef<T>,
): { parsedValue: unknown; errorMessage: string | null } {
  const schema = colDef.validationSchema;
  if (!schema) {
    return { parsedValue: rawValue, errorMessage: null };
  }

  let parsedValue: unknown = rawValue;
  let errorMessage: string | null = null;

  const schemaType = (schema as any)?._def?.typeName;
  if (schemaType === "ZodNumber") {
    if (rawValue.trim() === "") {
      parsedValue = undefined;
    } else {
      const maybeNum = parseFloat(rawValue);
      parsedValue = Number.isNaN(maybeNum) ? rawValue : maybeNum;
    }
  }

  const result = schema.safeParse(parsedValue);
  if (!result.success) {
    errorMessage = result.error.issues[0].message;
  }

  return { parsedValue, errorMessage };
}

export function handleKeyDown<T extends object>(
  e: React.KeyboardEvent<HTMLTableCellElement | HTMLDivElement>,
  colDef: ExtendedColumnDef<T>,
) {
  if (!colDef.validationSchema) return;

  const schemaType = (colDef.validationSchema as any)?._def?.typeName;
  if (schemaType === "ZodNumber") {
    const allowedKeys = [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "Home",
      "End",
      ".",
      "-",
    ];
    const isDigit = /^[0-9]$/.test(e.key);
    if (!allowedKeys.includes(e.key) && !isDigit && !(e.ctrlKey || e.metaKey)) {
      e.preventDefault();
    }
  }
}

export function handlePaste<T extends object>(
  e: React.ClipboardEvent<HTMLTableCellElement | HTMLDivElement>,
  colDef: ExtendedColumnDef<T>,
) {
  if (!colDef.validationSchema) return;
  const schemaType = (colDef.validationSchema as any)?._def?.typeName;
  if (schemaType === "ZodNumber") {
    const paste = e.clipboardData.getData("text");
    if (!/^-?\d*\.?\d*$/.test(paste)) {
      e.preventDefault();
    }
  }
}

export function isRowDisabled(
  disabledRowsConfig: number[] | Record<string, number[]> | undefined,
  groupKey: string,
  rowIndex: number,
): boolean {
  if (!disabledRowsConfig) return false;
  if (Array.isArray(disabledRowsConfig)) {
    return disabledRowsConfig.includes(rowIndex);
  }
  if (typeof disabledRowsConfig === "object" && disabledRowsConfig[groupKey]) {
    return disabledRowsConfig[groupKey].includes(rowIndex);
  }
  return false;
}
