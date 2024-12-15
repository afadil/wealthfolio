import { createContext, useContext, useEffect, useState } from 'react';

interface PrivacyContextType {
  isBalanceHidden: boolean;
  toggleBalanceVisibility: () => void;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

const STORAGE_KEY = 'privacy-settings';

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [isBalanceHidden, setIsBalanceHidden] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : false;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(isBalanceHidden));
  }, [isBalanceHidden]);

  function toggleBalanceVisibility() {
    setIsBalanceHidden((prev: boolean) => !prev);
  }

  return (
    <PrivacyContext.Provider value={{ isBalanceHidden, toggleBalanceVisibility }}>
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
