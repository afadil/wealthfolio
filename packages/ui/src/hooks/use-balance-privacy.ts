import { useState, useEffect } from 'react';

const STORAGE_KEY = 'privacy-settings';

export interface BalancePrivacyHook {
  isBalanceHidden: boolean;
  toggleBalanceVisibility: () => void;
}

/**
 * Custom hook for managing balance privacy across the Wealthfolio ecosystem.
 * 
 * This hook provides a consistent way to handle balance privacy in both the main app
 * and addons by using localStorage as the source of truth. It automatically syncs
 * across different contexts when privacy settings change.
 * 
 * @returns Object containing isBalanceHidden state and toggleBalanceVisibility function
 * 
 * @example
 * ```tsx
 * import { useBalancePrivacy } from '@wealthfolio/ui';
 * 
 * function MyComponent() {
 *   const { isBalanceHidden, toggleBalanceVisibility } = useBalancePrivacy();
 *   
 *   return (
 *     <div>
 *       <span>{isBalanceHidden ? '••••' : '$1,234.56'}</span>
 *       <button onClick={toggleBalanceVisibility}>
 *         {isBalanceHidden ? 'Show' : 'Hide'} Balance
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useBalancePrivacy(): BalancePrivacyHook {
  const [isBalanceHidden, setIsBalanceHidden] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Listen for localStorage changes from other contexts (main app, other addons)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        try {
          setIsBalanceHidden(JSON.parse(e.newValue));
        } catch {
          setIsBalanceHidden(false);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleBalanceVisibility = () => {
    const newValue = !isBalanceHidden;
    setIsBalanceHidden(newValue);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newValue));
  };

  return {
    isBalanceHidden,
    toggleBalanceVisibility,
  };
}
