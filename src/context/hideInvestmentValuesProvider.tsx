import React, { createContext, useContext, useState } from 'react';

interface HideValuesContextData {
  hideValues: boolean;
  toggleHideValues: () => void;
}

const HideValuesContext = createContext<HideValuesContextData | null>(null);

export function HideInvestmentValuesProvider({ children }: { children: React.ReactNode }) {
  const [hideValues, setHideValues] = useState(false);

  const toggleHideValues = () => {
    setHideValues((prev) => !prev);
  };

  return (
    <HideValuesContext.Provider value={{ hideValues, toggleHideValues }}>
      {children}
    </HideValuesContext.Provider>
  );
}

// Hook to use the context
export function useHideInvestmentValues() {
  const context = useContext(HideValuesContext);
  if (!context) {
    throw new Error('useHideInvestmentValues must be used within HideInvestmentValuesProvider');
  }
  return context;
}