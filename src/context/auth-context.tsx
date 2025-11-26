import { getRunEnv, RUN_ENV } from "@/adapters";
import { getAuthToken, setAuthToken, setUnauthorizedHandler } from "@/lib/auth-token";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface AuthContextValue {
  requiresAuth: boolean;
  isAuthenticated: boolean;
  statusLoading: boolean;
  loginLoading: boolean;
  loginError: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [statusLoading, setStatusLoading] = useState(getRunEnv() === RUN_ENV.WEB);
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (getRunEnv() !== RUN_ENV.WEB) {
      setStatusLoading(false);
      return;
    }
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const response = await fetch("/api/v1/auth/status");
        if (!response.ok) {
          throw new Error(`Failed to check authentication status: ${response.status}`);
        }
        const data = (await response.json()) as { requiresPassword: boolean };
        if (!cancelled) {
          setRequiresAuth(Boolean(data?.requiresPassword));
        }
      } catch (error) {
        console.error("Failed to load authentication status", error);
        if (!cancelled) {
          setRequiresAuth(false);
        }
      } finally {
        if (!cancelled) {
          setStatusLoading(false);
        }
      }
    };

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      const hadToken = Boolean(tokenRef.current);
      setToken(null);
      setAuthToken(null);
      if (hadToken) {
        setLoginError("Session expired. Please sign in again.");
      }
    };
    setUnauthorizedHandler(handler);
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const login = useCallback(async (password: string) => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        if (response.status === 404) {
          setRequiresAuth(false);
        }
        let message = "Invalid password";
        try {
          const body = await response.json();
          message = body?.message ?? message;
        } catch (parseError) {
          console.error("Failed to parse login error", parseError);
        }
        throw new Error(message);
      }
      const body = (await response.json()) as { accessToken: string };
      const accessToken = body?.accessToken;
      if (!accessToken) {
        throw new Error("Login response did not contain an access token");
      }
      setToken(accessToken);
      setAuthToken(accessToken);
      setLoginError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setToken(null);
      setAuthToken(null);
      setLoginError(message);
      throw error;
    } finally {
      setLoginLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAuthToken(null);
    setLoginError(null);
  }, []);

  const clearError = useCallback(() => setLoginError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      requiresAuth,
      isAuthenticated: !requiresAuth || Boolean(token),
      statusLoading,
      loginLoading,
      loginError,
      login,
      logout,
      clearError,
    }),
    [requiresAuth, token, statusLoading, loginLoading, loginError, login, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};

export function AuthGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { requiresAuth, isAuthenticated, statusLoading } = useAuth();

  if (statusLoading) {
    return (
      <div className="bg-background text-muted-foreground flex min-h-screen items-center justify-center">
        Checking authentication...
      </div>
    );
  }

  if (requiresAuth && !isAuthenticated) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
