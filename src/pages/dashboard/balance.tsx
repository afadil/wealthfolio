import NumberFlow from '@number-flow/react';
import { useBalancePrivacy } from '@/context/privacy-context';

interface BalanceProps {
  targetValue: number;
  currency: string;
  displayCurrency?: boolean;
  displayDecimal?: boolean;
}

const Balance: React.FC<BalanceProps> = ({
  targetValue,
  currency = 'USD',
  displayCurrency = false,
  displayDecimal = true,
}) => {
  const { isBalanceHidden } = useBalancePrivacy();


  return (
    <h1 className="font-heading font-bold text-3xl tracking-tight">
      {isBalanceHidden ? (
        <span>
          {displayCurrency ? `${currency}` : ''}
          ••••••
        </span>
      ) : (
        <NumberFlow
          className="muted-fraction"
          value={targetValue}
          isolate={false}
          format={{
            currency: currency,
            style: displayCurrency ? 'currency' : 'decimal',
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: displayDecimal ? 2 : 0,
            maximumFractionDigits: displayDecimal ? 2 : 0,
          }}
          // locales={navigator.language || 'en-US'}
        />
      )}
    </h1>
  );
};

export default Balance;
