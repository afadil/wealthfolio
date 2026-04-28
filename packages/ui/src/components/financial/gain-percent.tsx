import * as React from "react";
import { cn, formatPercent } from "../../lib/utils";

type GainPercentVariant = "text" | "badge";

interface GainPercentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  animated?: boolean;
  variant?: GainPercentVariant;
  showSign?: boolean;
  invertColor?: boolean;
}

function AnimatedNumber({ value }: { value: number }) {
  const [NumberFlow, setNumberFlow] = React.useState<React.ComponentType<any> | null>(null);

  const absValue = Math.abs(value * 100);
  React.useEffect(() => {
    import("@number-flow/react").then((module) => {
      setNumberFlow(module.default);
    });
  }, []);

  if (!NumberFlow) {
    return <span>{formatPercent(absValue)}</span>;
  }

  return (
    <NumberFlow
      value={absValue}
      animated={true}
      format={{
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }}
    />
  );
}

export function GainPercent({
  value,
  animated = false,
  variant = "text",
  showSign = true,
  invertColor = false,
  className,
  ...props
}: GainPercentProps) {
  const successColor = invertColor ? "text-destructive" : "text-success";
  const destructiveColor = invertColor ? "text-success" : "text-destructive";
  const successBg = invertColor ? "bg-destructive/10" : "bg-success/10";
  const destructiveBg = invertColor ? "bg-success/10" : "bg-destructive/10";
  return (
    <div
      className={cn(
        "amount inline-flex items-center justify-end text-right text-sm",
        value > 0 ? successColor : value < 0 ? destructiveColor : "text-foreground",
        variant === "badge" && [
          "rounded-md py-px pl-[9px] pr-[12px] font-light",
          value > 0 ? successBg : value < 0 ? destructiveBg : "bg-foreground/10",
        ],
        className,
      )}
      {...props}
    >
      {animated ? (
        <>
          {showSign && (value > 0 ? "+" : value < 0 ? "-" : null)}
          <AnimatedNumber value={value} /> %
        </>
      ) : (
        <>
          {showSign && (value > 0 ? "+" : value < 0 ? "-" : null)}
          {formatPercent(Math.abs(value))}
        </>
      )}
    </div>
  );
}
