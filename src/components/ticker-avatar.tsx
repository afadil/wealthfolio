import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@wealthfolio/ui';

interface TickerAvatarProps {
  symbol: string;
  className?: string;
}

export const TickerAvatar = ({ symbol, className = 'w-8 h-8' }: TickerAvatarProps) => {
  // Extract the base symbol (before any dot, hyphen, or colon) for fallback
  const baseSymbol = symbol ? symbol.split(/[.:-]/)[0].toUpperCase() : '';
  const fullSymbol = symbol ? symbol.toUpperCase() : '';

  // Try full symbol first, then fallback to base symbol
  const primaryLogoUrl = fullSymbol ? `/ticker-logos/${fullSymbol}.png` : '';
  const fallbackLogoUrl = baseSymbol ? `/ticker-logos/${baseSymbol}.png` : '';

  return (
    <Avatar
      className={cn('border-white/20 bg-primary/80 backdrop-blur-md dark:bg-primary/20', className)}
    >
      <AvatarImage src={primaryLogoUrl} alt={fullSymbol} className="object-contain p-2" />
      <AvatarFallback>
        <Avatar className="border-white/20 bg-primary/80 text-white backdrop-blur-md dark:bg-primary/20">
          <AvatarImage src={fallbackLogoUrl} alt={fullSymbol} className="object-contain p-2" />
          <AvatarFallback className="bg-transparent text-xs font-medium">
            {baseSymbol ? baseSymbol : '•'}
          </AvatarFallback>
        </Avatar>
      </AvatarFallback>
    </Avatar>
  );
};
