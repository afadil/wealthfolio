import { useBalancePrivacy } from '@/context/privacy-context';
import { cn } from '@/lib/utils';
import { formatAmount } from '@/lib/utils';

interface PrivacyAmountProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number;
  currency: string;
}

export function PrivacyAmount({ value, currency, className, ...props }: PrivacyAmountProps) {
  const { isBalanceHidden } = useBalancePrivacy();

  return (
    <span className={cn(className)} {...props}>
      {isBalanceHidden ? '••••' : formatAmount(value, currency)}
    </span>
  );
}
