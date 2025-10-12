import { cn, formatAmount } from "../../lib/utils";

interface AmountDisplayProps {
  value: number;
  currency: string;
  isHidden?: boolean;
  displayCurrency?: boolean;
  colorFormat?: boolean;
  className?: string;
}

export function AmountDisplay({
  value,
  currency = "USD",
  isHidden,
  displayCurrency = true,
  colorFormat,
  className,
}: AmountDisplayProps) {
  const formattedAmount = formatAmount(value, currency, displayCurrency);
  const colorClass = colorFormat ? (value >= 0 ? "text-success" : "text-destructive") : "";

  return <span className={cn(colorClass, className)}>{isHidden ? "••••" : formattedAmount}</span>;
}
