import { formatAmount } from '@/lib/utils';

interface AmountDisplayProps {
  value: number;
  currency: string;
  isHidden?: boolean;
  colorFormat?: boolean;
}

export function AmountDisplay({ value, currency, isHidden, colorFormat }: AmountDisplayProps) {
  const formattedAmount = formatAmount(value, currency);
  return (
    <span className={colorFormat ? (value > 0 ? 'text-success' : 'text-destructive') : ''}>
      {isHidden ? '••••' : formattedAmount}
    </span>
  );
}
