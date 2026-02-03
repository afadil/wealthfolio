import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import NumberFlow from "@number-flow/react";
import { useMemo } from "react";

interface BalanceProps {
  targetValue: number;
  currency: string;
  displayCurrency?: boolean;
  displayDecimal?: boolean;
  isLoading?: boolean;
}

const Balance: React.FC<BalanceProps> = ({
  targetValue,
  currency = "USD",
  displayCurrency = false,
  displayDecimal = true,
  isLoading = false,
}) => {
  const { isBalanceHidden } = useBalancePrivacy();
  const currencySymbol = useMemo(() => {
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    const parts = formatter.formatToParts(0);
    const symbolPart = parts.find((part) => part.type === "currency");

    return symbolPart?.value ?? currency;
  }, [currency]);

  const formattedValue = useMemo(() => {
    const formatter = new Intl.NumberFormat(undefined, {
      currency,
      style: displayCurrency ? "currency" : "decimal",
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: displayDecimal ? 2 : 0,
      maximumFractionDigits: displayDecimal ? 2 : 0,
    });
    return formatter.format(targetValue);
  }, [currency, displayCurrency, displayDecimal, targetValue]);

  if (isLoading) {
    return <Skeleton className="h-9 w-48" />;
  }

  return (
    <h1 className="font-heading text-3xl font-bold tracking-tight" data-testid="portfolio-balance">
      {isBalanceHidden ? (
        <span className="text-4x">
          {displayCurrency ? currencySymbol : ""}
          •••••••
        </span>
      ) : (
        <>
          <NumberFlow
            className="muted-fraction"
            value={targetValue}
            isolate={false}
            style={{
              // @ts-expect-error https://number-flow.barvian.me/ - but it's not in TS object
              "--number-flow-mask-height": "0px",
              "--number-flow-mask-width": "0px",
            }}
            format={{
              currency: currency,
              style: displayCurrency ? "currency" : "decimal",
              currencyDisplay: "narrowSymbol",
              minimumFractionDigits: displayDecimal ? 2 : 0,
              maximumFractionDigits: displayDecimal ? 2 : 0,
            }}
          />
          <span className="sr-only" data-testid="portfolio-balance-value">
            {formattedValue}
          </span>
        </>
      )}
    </h1>
  );
};

export default Balance;
