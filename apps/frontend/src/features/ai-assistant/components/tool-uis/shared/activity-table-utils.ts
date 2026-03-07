import { format, parseISO } from "date-fns";

export function getActivityTypeBadge(activityType: string): {
  variant: "default" | "secondary" | "destructive" | "success";
  className: string;
} {
  const typeUpper = activityType.toUpperCase();
  switch (typeUpper) {
    case "DIVIDEND":
    case "INTEREST":
    case "BUY":
    case "DEPOSIT":
    case "TRANSFER_IN":
      return { variant: "success", className: "rounded-sm" };
    case "SELL":
    case "WITHDRAWAL":
    case "TRANSFER_OUT":
    case "FEE":
    case "TAX":
      return { variant: "destructive", className: "rounded-sm" };
    case "SPLIT":
    case "ADJUSTMENT":
      return { variant: "secondary", className: "rounded-sm" };
    default:
      return { variant: "default", className: "rounded-sm" };
  }
}

export function formatActivityType(activityType: string): string {
  return activityType.replace(/_/g, " ");
}

export function formatActivityDate(dateString: string): string {
  try {
    return format(parseISO(dateString), "MMM d, yyyy");
  } catch {
    return dateString;
  }
}

export function createActivityAmountFormatter(): Intl.NumberFormat {
  return new Intl.NumberFormat(undefined, {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function createActivityQuantityFormatter(): Intl.NumberFormat {
  return new Intl.NumberFormat(undefined, {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function formatActivityAmount(
  value: number | null | undefined,
  formatter: Intl.NumberFormat,
  isHidden: boolean,
  currency?: string,
): string {
  if (value == null) return "-";
  if (isHidden) return "******";
  const formatted = formatter.format(Math.abs(value));
  return currency ? `${formatted} ${currency}` : formatted;
}

export function formatActivityQuantity(
  value: number | null | undefined,
  formatter: Intl.NumberFormat,
  isHidden: boolean,
): string {
  if (value == null) return "-";
  if (isHidden) return "***";
  return formatter.format(value);
}
