/**
 * Types and Interfaces for Editable Activity Table
 *
 * Following SheetTable patterns but adapted for server-side data management.
 */

import type { Account, ActivityDetails } from "@/lib/types";
import type { ColumnDef, ColumnMeta } from "@tanstack/react-table";
import type { ZodType, ZodTypeDef } from "zod";

/**
 * Extended column definition with validation and editor types
 */
export type ExtendedColumnDef<TData extends object, TValue = unknown> = ColumnDef<TData, TValue> & {
  id?: string;
  accessorKey?: string;
  validationSchema?: ZodType<unknown, ZodTypeDef, unknown>;
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
    options?: { label: string; value: unknown }[];
  };
};

/**
 * Props for the editable activity table
 */
export interface EditableActivityTableProps {
  accounts: Account[];
  disabledColumns?: string[];
  disabledRows?: number[] | Record<string, number[]>;
  isEditable: boolean;
  onToggleEditable: (value: boolean) => void;
}

/**
 * Local activity details with optional "isNew" flag for unsaved activities
 */
export type LocalActivityDetails = ActivityDetails & { isNew?: boolean };

/**
 * Cell editing state
 */
export interface CellEditingState {
  rowId: string;
  columnId: string;
}

/**
 * Cell editor types mapping
 */
export type CellEditorType =
  | "date"
  | "activityTypeSelect"
  | "assetSymbolSearch"
  | "quantityInput"
  | "moneyInput"
  | "accountSelect"
  | "currencySelect"
  | "string"
  | "text"
  | undefined;
