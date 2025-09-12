import { useState, useEffect } from "react";

const STORAGE_KEY = "privacy-settings";
const EVENT_NAME = "wf:privacy-changed";

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

    // Also listen for in-document changes (same window) via a custom event
    const handleLocalEvent = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as { isBalanceHidden?: boolean } | undefined;
        if (detail && typeof detail.isBalanceHidden === "boolean") {
          setIsBalanceHidden(detail.isBalanceHidden);
        }
      } catch {
        // no-op
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(EVENT_NAME, handleLocalEvent as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(EVENT_NAME, handleLocalEvent as EventListener);
    };
  }, []);

  const toggleBalanceVisibility = () => {
    const newValue = !isBalanceHidden;
    setIsBalanceHidden(newValue);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newValue));

    // Notify other hook instances in the same window immediately
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { isBalanceHidden: newValue } }));
    } catch {
      // no-op
    }
  };

  return {
    isBalanceHidden,
    toggleBalanceVisibility,
  };
}
