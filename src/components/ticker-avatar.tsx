import { useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@wealthfolio/ui';
import { cn } from '@/lib/utils';

interface TickerAvatarProps {
  symbol: string;
  className?: string;
}

export const TickerAvatar = ({ symbol, className = "w-8 h-8" }: TickerAvatarProps) => {
  const [fullSymbolError, setFullSymbolError] = useState(false);
  const [baseSymbolError, setBaseSymbolError] = useState(false);
  
  // Extract the base symbol (before any dot or hyphen) for fallback
  const baseSymbol = symbol ? symbol.split(/[.-]/)[0].toUpperCase() : '';
  const fullSymbol = symbol ? symbol.toUpperCase() : '';
  
  // Try full symbol first, then fallback to base symbol
  const primaryLogoUrl = fullSymbol ? `/ticker-logos/${fullSymbol}.png` : '';
  const fallbackLogoUrl = baseSymbol ? `/ticker-logos/${baseSymbol}.png` : '';
  
  const shouldShowPrimaryLogo = !fullSymbolError && fullSymbol;
  const shouldShowFallbackLogo = fullSymbolError && !baseSymbolError && baseSymbol && fullSymbol !== baseSymbol;

  return (
    <Avatar className={cn(
      "bg-primary text-white dark:bg-white/10 backdrop-blur-md border-white/20 p-1.5",
      className
    )}>
      {shouldShowPrimaryLogo && (
        <AvatarImage 
          src={primaryLogoUrl}
          alt={fullSymbol}
          onError={() => setFullSymbolError(true)}
          className="object-contain p-0.5"
        />
      )}
      {shouldShowFallbackLogo && (
        <AvatarImage 
          src={fallbackLogoUrl}
          alt={baseSymbol}
          onError={() => setBaseSymbolError(true)}
          className="object-contain p-0.5"
        />
      )}
      <AvatarFallback className={cn(
        "text-xs font-medium bg-transparent",
      )}>
        {baseSymbol ? baseSymbol : '•'}
      </AvatarFallback>
    </Avatar>
  );
};
