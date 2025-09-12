import { cn, formatAmount } from "../../lib/utils";
import { useBalancePrivacy } from "../../hooks/use-balance-privacy";

interface PrivacyAmountProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number;
  currency: string;
}

export function PrivacyAmount({ value, currency, className, ...props }: PrivacyAmountProps) {
  const { isBalanceHidden } = useBalancePrivacy();

  return (
    <span className={cn(className)} {...props}>
      {isBalanceHidden ? "••••" : formatAmount(value, currency)}
    </span>
  );
}
