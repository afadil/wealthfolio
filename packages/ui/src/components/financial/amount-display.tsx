import { cn, formatAmount } from "../../lib/utils";

interface AmountDisplayProps {
  value: number;
  currency: string;
  isHidden?: boolean;
  colorFormat?: boolean;
  className?: string;
}

export function AmountDisplay({ value, currency = "USD", isHidden, colorFormat, className }: AmountDisplayProps) {
  const formattedAmount = formatAmount(value, currency);
  const colorClass = colorFormat ? (value >= 0 ? "text-success" : "text-destructive") : "";

  return <span className={cn(colorClass, className)}>{isHidden ? "••••" : formattedAmount}</span>;
}
