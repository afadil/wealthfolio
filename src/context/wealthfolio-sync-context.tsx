import { getRunEnv, RUN_ENV } from "@/adapters";
import { deleteSecret, getSecret, setSecret } from "@/commands/secrets";
import { createClient, Session, SupabaseClient, User } from "@supabase/supabase-js";
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

// Supabase configuration - these are public keys (safe for client-side)
// Set via environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Keys for storing tokens in keyring
const REFRESH_TOKEN_KEY = "wealthfolio_sync_refresh_token";
const ACCESS_TOKEN_KEY = "wealthfolio_sync_access_token";

interface WealthfolioSyncContextValue {
  isConnected: boolean;
  isLoading: boolean;
  user: User | null;
  session: Session | null;
  error: string | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: "google" | "apple" | "github") => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const WealthfolioSyncContext = createContext<WealthfolioSyncContextValue | undefined>(undefined);

// Create a Supabase client with custom storage for persistent auth
const createSupabaseClient = () => {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: false, // We handle persistence manually via keyring
      detectSessionInUrl: false,
    },
  });
};

export function WealthfolioSyncProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabaseRef = useRef<SupabaseClient | null>(null);

  // Initialize Supabase client
  supabaseRef.current ??= createSupabaseClient();

  const supabase = supabaseRef.current;

  // Store tokens securely in keyring (desktop) or localStorage (web fallback)
  const storeTokens = useCallback(async (session: Session | null) => {
    if (!session) {
      if (getRunEnv() === RUN_ENV.DESKTOP) {
        await deleteSecret(REFRESH_TOKEN_KEY).catch(() => undefined);
        await deleteSecret(ACCESS_TOKEN_KEY).catch(() => undefined);
      } else {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(ACCESS_TOKEN_KEY);
      }
      return;
    }

    if (getRunEnv() === RUN_ENV.DESKTOP) {
      if (session.refresh_token) {
        await setSecret(REFRESH_TOKEN_KEY, session.refresh_token);
      }
      if (session.access_token) {
        await setSecret(ACCESS_TOKEN_KEY, session.access_token);
      }
    } else {
      if (session.refresh_token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
      }
      if (session.access_token) {
        localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
      }
    }
  }, []);

  // Retrieve tokens from keyring (desktop) or localStorage (web fallback)
  const retrieveTokens = useCallback(async (): Promise<{
    refreshToken: string | null;
    accessToken: string | null;
  }> => {
    if (getRunEnv() === RUN_ENV.DESKTOP) {
      const refreshToken = await getSecret(REFRESH_TOKEN_KEY).catch(() => null);
      const accessToken = await getSecret(ACCESS_TOKEN_KEY).catch(() => null);
      return { refreshToken, accessToken };
    } else {
      return {
        refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
        accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
      };
    }
  }, []);

  // Restore session from stored tokens on mount
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const { refreshToken } = await retrieveTokens();

        if (refreshToken) {
          // Use the refresh token to get a new session
          const { data, error: refreshError } = await supabase.auth.refreshSession({
            refresh_token: refreshToken,
          });

          if (refreshError) {
            console.warn("Failed to refresh session:", refreshError.message);
            // Clear invalid tokens
            await storeTokens(null);
          } else if (data.session && !cancelled) {
            setSession(data.session);
            setUser(data.session.user);
            // Store the new tokens (refresh token rotation)
            await storeTokens(data.session);
          }
        }
      } catch (err) {
        console.error("Error restoring session:", err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void restoreSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (cancelled) return;

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        await storeTokens(newSession);
      } else if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        await storeTokens(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase, storeTokens, retrieveTokens]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw signInError;
        }

        if (data.session) {
          setSession(data.session);
          setUser(data.session.user);
          await storeTokens(data.session);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sign in failed";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [supabase, storeTokens],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          throw signUpError;
        }

        // If email confirmation is not required, user will be signed in
        if (data.session) {
          setSession(data.session);
          setUser(data.session.user);
          await storeTokens(data.session);
        } else if (data.user && !data.session) {
          // Email confirmation required
          setError("Please check your email to confirm your account.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sign up failed";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [supabase, storeTokens],
  );

  const signInWithOAuth = useCallback(
    async (provider: "google" | "apple" | "github") => {
      setIsLoading(true);
      setError(null);

      try {
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            skipBrowserRedirect: getRunEnv() === RUN_ENV.DESKTOP,
          },
        });

        if (oauthError) {
          throw oauthError;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "OAuth sign in failed";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        throw signOutError;
      }

      setSession(null);
      setUser(null);
      await storeTokens(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [supabase, storeTokens]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<WealthfolioSyncContextValue>(
    () => ({
      isConnected: !!session,
      isLoading,
      user,
      session,
      error,
      signInWithEmail,
      signUpWithEmail,
      signInWithOAuth,
      signOut,
      clearError,
    }),
    [
      session,
      isLoading,
      user,
      error,
      signInWithEmail,
      signUpWithEmail,
      signInWithOAuth,
      signOut,
      clearError,
    ],
  );

  return (
    <WealthfolioSyncContext.Provider value={value}>{children}</WealthfolioSyncContext.Provider>
  );
}

export const useWealthfolioSync = () => {
  const ctx = useContext(WealthfolioSyncContext);
  if (!ctx) {
    throw new Error("useWealthfolioSync must be used within a WealthfolioSyncProvider");
  }
  return ctx;
};
