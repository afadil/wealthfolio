import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";

const dateReviver = (_key: string, value: unknown) => {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|([+-]\d{2}:\d{2}))$/;
  if (typeof value === "string" && isoDateRegex.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return value;
};

// Custom event name for same-page synchronization
const PERSISTENT_STATE_CHANGE_EVENT = "persistent-state-change";

interface PersistentStateChangeDetail {
  key: string;
  value: unknown;
}

export function usePersistentState<T>(
  key: string,
  initialState: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const storedValue = window.localStorage.getItem(key);
      if (storedValue) {
        return JSON.parse(storedValue, dateReviver) as T;
      }
    } catch (error) {
      console.error(`Error reading from localStorage for key "${key}":`, error);
    }
    return initialState;
  });

  // Wrapped setState that also broadcasts a custom event for same-page sync
  const setStateAndBroadcast = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      setState((prevState) => {
        const newState = typeof action === "function" ? (action as (prev: T) => T)(prevState) : action;

        // Write to localStorage
        try {
          const serializedState = JSON.stringify(newState);
          window.localStorage.setItem(key, serializedState);
        } catch (error) {
          console.error(`Error writing to localStorage for key "${key}":`, error);
        }

        // Broadcast custom event for other instances on the same page
        window.dispatchEvent(
          new CustomEvent<PersistentStateChangeDetail>(PERSISTENT_STATE_CHANGE_EVENT, {
            detail: { key, value: newState },
          }),
        );

        return newState;
      });
    },
    [key],
  );

  // Listen for changes from other instances (same page) and cross-tab storage events
  useEffect(() => {
    // Handle custom event from same page
    const handleCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<PersistentStateChangeDetail>;
      if (customEvent.detail.key === key) {
        setState(customEvent.detail.value as T);
      }
    };

    // Handle storage event from other tabs
    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === key && event.newValue !== null) {
        try {
          setState(JSON.parse(event.newValue, dateReviver) as T);
        } catch (error) {
          console.error(`Error parsing storage event for key "${key}":`, error);
        }
      }
    };

    window.addEventListener(PERSISTENT_STATE_CHANGE_EVENT, handleCustomEvent);
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener(PERSISTENT_STATE_CHANGE_EVENT, handleCustomEvent);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [key]);

  return [state, setStateAndBroadcast];
}
