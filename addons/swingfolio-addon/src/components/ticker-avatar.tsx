import { TickerAvatar as BaseTickerAvatar } from "@wealthfolio/ui";
import { parseOccSymbol } from "../lib/utils";

interface TickerAvatarProps {
  symbol: string;
  className?: string;
}

export const TickerAvatar = ({ symbol, className }: TickerAvatarProps) => {
  // For OCC option symbols (e.g. "AAPL250321C00150000"), use the underlying ticker for logo
  const parsed = symbol ? parseOccSymbol(symbol) : null;
  const logoSymbol = parsed ? parsed.underlying : symbol;

  return <BaseTickerAvatar symbol={logoSymbol} className={className} />;
};
