import { Holding } from '@/lib/types';
import { Icons } from '@/components/icons';
import { AmountDisplay } from '@/components/amount-display';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useBalancePrivacy } from '@/context/privacy-context';

interface CashHoldingsWidgetProps {
  holdings: Holding[];
  isLoading: boolean;
  className?: string;
}

export const CashHoldingsWidget = ({ holdings, isLoading, className }: CashHoldingsWidgetProps) => {
  const { isBalanceHidden } = useBalancePrivacy();
  const cashHoldings = useMemo(() => {
    return holdings.filter((holding) => holding.holdingType === 'CASH');
  }, [holdings]);

  if (isLoading || !cashHoldings.length) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-4 text-sm text-muted-foreground', className)}>
      <div className="flex items-center gap-1.5">
        <Icons.Wallet className="h-3.5 w-3.5" />
        <span className="font-medium">Cash:</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {cashHoldings.map((holding) => (
          <div key={holding.id} className="flex items-center gap-1.5">
            <span>{holding.currency}</span>
            <span className="font-medium text-foreground">
              <AmountDisplay
                value={holding.marketValue}
                currency={holding.currency}
                isHidden={isBalanceHidden}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CashHoldingsWidget;
