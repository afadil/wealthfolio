import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  type NavigateOptions,
  type To,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";

export type NavigationDirection = -1 | 0 | 1;

interface NavigationContextValue {
  navigationStack: string[];
  direction: NavigationDirection;
  isNavigating: boolean;
  canGoBack: boolean;
  push: (to: To, options?: NavigateOptions) => void;
  replace: (to: To, options?: NavigateOptions) => void;
  goBack: (delta?: number) => void;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

const NAVIGATION_RESET_TIMEOUT = 360;

export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const stackRef = useRef<string[]>([location.pathname]);
  const isInitialLoadRef = useRef(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const { stack: navigationStack, direction } = useMemo(() => {
    const previousStack = stackRef.current;
    const currentPath = location.pathname;
    let nextStack = previousStack;
    let nextDirection: NavigationDirection = 0;

    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      nextStack = [currentPath];
    } else if (navigationType === "POP") {
      const existingIndex = previousStack.lastIndexOf(currentPath);
      nextStack =
        existingIndex !== -1 ? previousStack.slice(0, existingIndex + 1) : [...previousStack, currentPath];
      nextDirection = -1;
    } else if (navigationType === "PUSH") {
      if (previousStack[previousStack.length - 1] === currentPath) {
        nextDirection = 0;
      } else {
        const existingIndex = previousStack.lastIndexOf(currentPath);

        if (existingIndex !== -1) {
          nextStack = previousStack.slice(0, existingIndex + 1);
          nextDirection = -1;
        } else {
          nextStack = [...previousStack, currentPath];
          nextDirection = 1;
        }
      }
    } else if (navigationType === "REPLACE") {
      if (previousStack.length === 0) {
        nextStack = [currentPath];
      } else if (previousStack[previousStack.length - 1] !== currentPath) {
        nextStack = [...previousStack];
        nextStack[nextStack.length - 1] = currentPath;
      }
    }

    stackRef.current = nextStack;

    return { stack: nextStack, direction: nextDirection };
  }, [location.pathname, navigationType]);

  const startNavigation = useCallback(() => {
    setIsNavigating(true);

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    resetTimerRef.current = window.setTimeout(() => {
      setIsNavigating(false);
      resetTimerRef.current = null;
    }, NAVIGATION_RESET_TIMEOUT);
  }, []);

  const goBack = useCallback(
    (delta = 1) => {
      const steps = Math.max(1, delta);
      const stackLength = stackRef.current.length;

      if (stackLength <= 1) {
        return;
      }

      startNavigation();

      if (stackLength - steps < 0) {
        navigate(-stackLength + 1);
        return;
      }

      navigate(-steps);
    },
    [navigate, startNavigation],
  );

  const push = useCallback(
    (to: To, options?: NavigateOptions) => {
      startNavigation();
      navigate(to, options);
    },
    [navigate, startNavigation],
  );

  const replace = useCallback(
    (to: To, options?: NavigateOptions) => {
      startNavigation();
      navigate(to, { ...options, replace: true });
    },
    [navigate, startNavigation],
  );

  const canGoBack = navigationStack.length > 1;

  const value = useMemo<NavigationContextValue>(
    () => ({
      navigationStack,
      direction,
      isNavigating,
      canGoBack,
      push,
      replace,
      goBack,
    }),
    [navigationStack, direction, isNavigating, canGoBack, push, replace, goBack],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);

  if (!context) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }

  return context;
}
