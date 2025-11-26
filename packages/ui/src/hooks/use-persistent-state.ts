import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

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

  useEffect(() => {
    try {
      const serializedState = JSON.stringify(state);
      window.localStorage.setItem(key, serializedState);
    } catch (error) {
      console.error(`Error writing to localStorage for key "${key}":`, error);
    }
  }, [key, state]);

  return [state, setState];
}
