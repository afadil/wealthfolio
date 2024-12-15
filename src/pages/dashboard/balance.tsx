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
  currency,
  displayCurrency = false,
  displayDecimal = true,
}) => {
  const { isBalanceHidden } = useBalancePrivacy();

  const getCurrencySymbol = (currency: string) => {
    try {
      return (
        new Intl.NumberFormat(navigator.language || 'en-US', {
          style: 'currency',
          currency: currency,
          currencyDisplay: 'narrowSymbol',
        })
          .formatToParts(0)
          .find((part) => part.type === 'currency')?.value || currency
      );
    } catch {
      return currency;
    }
  };

  return (
    <h1 className="font-heading text-3xl font-bold tracking-tight">
      {isBalanceHidden ? (
        <span>
          {displayCurrency ? `${getCurrencySymbol(currency)}` : ''}
          ••••••
        </span>
      ) : (
        <NumberFlow
          value={targetValue}
          isolate={false}
          format={{
            currency: currency,
            style: displayCurrency ? 'currency' : 'decimal',
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: displayDecimal ? 2 : 0,
            maximumFractionDigits: displayDecimal ? 2 : 0,
          }}
          locales={navigator.language || 'en-US'}
        />
      )}
    </h1>
  );
};

export default Balance;
