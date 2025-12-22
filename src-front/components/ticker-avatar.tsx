import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@wealthfolio/ui";

interface TickerAvatarProps {
  symbol: string;
  className?: string;
}

export const TickerAvatar = ({ symbol, className = "size-8" }: TickerAvatarProps) => {
  // Extract the base symbol (before any dot, hyphen, or colon) for fallback
  const baseSymbol = symbol ? symbol.split(/[.:-]/)[0].toUpperCase() : "";
  const fullSymbol = symbol ? symbol.toUpperCase() : "";

  // Try full symbol first, then fallback to base symbol
  const primaryLogoUrl = fullSymbol ? `/ticker-logos/${fullSymbol}.png` : "";
  const fallbackLogoUrl = baseSymbol ? `/ticker-logos/${baseSymbol}.png` : "";

  return (
    <Avatar
      className={cn("bg-primary/80 dark:bg-primary/20 border-white/20 backdrop-blur-md", className)}
    >
      <AvatarImage src={primaryLogoUrl} alt={fullSymbol} className="object-contain p-2" />
      <AvatarFallback>
        <Avatar className="bg-primary/80 dark:bg-primary/20 border-white/20 text-white backdrop-blur-md">
          <AvatarImage src={fallbackLogoUrl} alt={fullSymbol} className="object-contain p-2" />
          <AvatarFallback className="bg-transparent text-xs font-medium">
            <span className="p-1" title={fullSymbol}>
              {baseSymbol ? baseSymbol.slice(0, 4) : "•"}
            </span>
          </AvatarFallback>
        </Avatar>
      </AvatarFallback>
    </Avatar>
  );
};
