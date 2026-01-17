import { cn } from "@/lib/utils";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";

export interface PrivacyNumberProps {
  value: number;
  currency?: string;
  type?: "currency" | "percent";
  className?: string;
}

const HIDDEN_PLACEHOLDER = "\u2022\u2022\u2022\u2022\u2022";

export function PrivacyNumber({
  value,
  currency = "USD",
  type = "currency",
  className,
}: PrivacyNumberProps) {
  const { isBalanceHidden } = useBalancePrivacy();

  if (isBalanceHidden) {
    return <span className={cn(className)}>{HIDDEN_PLACEHOLDER}</span>;
  }

  const formatted =
    type === "percent"
      ? new Intl.NumberFormat("en-US", {
          style: "percent",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value)
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);

  return <span className={cn(className)}>{formatted}</span>;
}
