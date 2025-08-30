import { useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@wealthfolio/ui';

interface TickerAvatarProps {
  symbol: string;
  className?: string;
}

export const TickerAvatar = ({ symbol, className = "w-8 h-8" }: TickerAvatarProps) => {
  const [logoError, setLogoError] = useState(false);
  
  // Extract the base symbol (before any dot or hyphen) for logo lookup and display
  const baseSymbol = symbol ? symbol.split(/[.-]/)[0].toUpperCase() : '';
  const logoUrl = baseSymbol ? `/ticker-logos/${baseSymbol}.png` : '';

  return (
    <Avatar className={`bg-primary text-white dark:bg-white/10 backdrop-blur-md border-white/20 p-1.5 ${className}`}>
      {!logoError && baseSymbol && (
        <AvatarImage 
          src={logoUrl}
          alt={baseSymbol}
          onError={() => setLogoError(true)}
          className="object-contain p-0.5"
        />
      )}
      <AvatarFallback className="text-xs font-medium bg-transparent">
        {baseSymbol ? baseSymbol : '•'}
      </AvatarFallback>
    </Avatar>
  );
};
