import { formatAmount } from '@/lib/utils';

interface AmountDisplayProps {
  value: number;
  currency: string;
  isHidden: boolean;
}

export function AmountDisplay({ value, currency, isHidden }: AmountDisplayProps) {
  return <span>{isHidden ? '••••' : formatAmount(value, currency)}</span>;
}
