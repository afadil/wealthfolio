import NumberFlow from '@number-flow/react';

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
  return (
    <h1 className="font-heading text-3xl font-bold tracking-tight">
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
    </h1>
  );
};

export default Balance;
