import { createContext } from 'react';
import { useBalancePrivacy as useBalancePrivacyHook, type BalancePrivacyHook } from '@wealthfolio/ui';

type PrivacyContextType = BalancePrivacyHook;

export const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const balancePrivacy = useBalancePrivacyHook();

  return (
    <PrivacyContext.Provider value={balancePrivacy}>
      {children}
    </PrivacyContext.Provider>
  );
}

// Hook moved to `src/hooks/use-balance-privacy.ts` for Fast Refresh compatibility.
