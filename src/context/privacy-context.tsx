import { createContext, useContext } from 'react';
import { useBalancePrivacy as useBalancePrivacyHook, type BalancePrivacyHook } from '@wealthfolio/ui';

type PrivacyContextType = BalancePrivacyHook;

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const balancePrivacy = useBalancePrivacyHook();

  return (
    <PrivacyContext.Provider value={balancePrivacy}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function useBalancePrivacy() {
  const context = useContext(PrivacyContext);
  if (context === undefined) {
    throw new Error('useBalancePrivacy must be used within a PrivacyProvider');
  }
  return context;
}
