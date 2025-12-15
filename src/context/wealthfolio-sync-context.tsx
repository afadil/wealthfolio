import { getRunEnv, listenDeepLinkTauri, openUrlInBrowser, RUN_ENV } from "@/adapters";
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

// Deep link scheme for desktop OAuth callback (used for magic links on desktop)
const DESKTOP_DEEP_LINK_SCHEME = "wealthfolio";
const DESKTOP_DEEP_LINK_URL = `${DESKTOP_DEEP_LINK_SCHEME}://auth/callback`;

// Custom event for SnapTrade deep link callbacks
export const SNAPTRADE_CALLBACK_EVENT = "snaptrade-deep-link-callback";

export interface SnapTradeCallbackData {
  status: "SUCCESS" | "ERROR";
  authorizationId?: string;
  errorCode?: string;
  detail?: string;
}

/**
 * Parse SnapTrade callback parameters from a deep link URL.
 * SnapTrade sends: wealthfolio://callback?authorizationId=xxx&status=SUCCESS
 * or on error: wealthfolio://callback?status=ERROR&errorCode=xxx&detail=xxx
 */
function parseSnapTradeCallback(url: string): SnapTradeCallbackData | null {
  try {
    const urlObj = new URL(url);

    // Check if this is a SnapTrade callback (not an auth callback)
    // SnapTrade callbacks won't have access_token and will have status parameter
    const status = urlObj.searchParams.get("status");
    if (!status || (status !== "SUCCESS" && status !== "ERROR")) {
      return null;
    }

    // If it has access_token, it's a Supabase auth callback, not SnapTrade
    if (urlObj.searchParams.has("access_token") || urlObj.hash.includes("access_token")) {
      return null;
    }

    return {
      status: status as "SUCCESS" | "ERROR",
      authorizationId: urlObj.searchParams.get("authorizationId") ?? undefined,
      errorCode: urlObj.searchParams.get("errorCode") ?? undefined,
      detail: urlObj.searchParams.get("detail") ?? undefined,
    };
  } catch {
    return null;
  }
}

// Web redirect URL for OAuth and magic link
const getWebRedirectUrl = () => {
  return `${window.location.origin}/auth/callback`;
};

// For OAuth on desktop, we use a hosted callback page that redirects to deep link
// This is necessary because browsers block direct navigation to custom URL schemes
const HOSTED_OAUTH_CALLBACK_URL = "https://wealthfolio.app/auth/callback";

// Get the appropriate OAuth redirect URL based on environment
const getOAuthRedirectUrl = () => {
  const isDesktop = getRunEnv() === RUN_ENV.DESKTOP;
  // For desktop: use hosted callback that will redirect to deep link
  // For web: use local callback route
  // In development, we fall back to local callback
  if (isDesktop && import.meta.env.PROD) {
    return HOSTED_OAUTH_CALLBACK_URL;
  }
  return getWebRedirectUrl();
};

interface WealthfolioSyncContextValue {
  isConnected: boolean;
  isLoading: boolean;
  user: User | null;
  session: Session | null;
  error: string | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: "google" | "apple" | "github") => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
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
      detectSessionInUrl: false, // We handle URL parsing manually
    },
  });
};

// Parse auth tokens from URL (supports both hash fragments and query params)
const parseAuthFromUrl = (url: string): { accessToken?: string; refreshToken?: string } | null => {
  try {
    const urlObj = new URL(url);

    // First check hash fragment (OAuth typically uses this)
    const hashParams = new URLSearchParams(urlObj.hash.substring(1));
    let accessToken = hashParams.get("access_token");
    let refreshToken = hashParams.get("refresh_token");

    // Fall back to query params (magic link might use this)
    if (!accessToken) {
      accessToken = urlObj.searchParams.get("access_token");
      refreshToken = urlObj.searchParams.get("refresh_token");
    }

    if (accessToken) {
      return { accessToken, refreshToken: refreshToken ?? undefined };
    }

    // Check for error in the URL
    const error = hashParams.get("error") || urlObj.searchParams.get("error");
    if (error) {
      console.error("Auth error from URL:", error);
      return null;
    }

    return null;
  } catch (err) {
    console.error("Failed to parse auth URL:", err);
    return null;
  }
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

  // Handle auth callback from URL (deep link or web redirect)
  const handleAuthCallback = useCallback(
    async (url: string) => {
      console.log("handleAuthCallback called with URL:", url);
      const tokens = parseAuthFromUrl(url);
      console.log("Parsed tokens:", tokens ? "found" : "not found");

      if (!tokens?.accessToken) {
        console.warn("No access token found in callback URL");
        return;
      }

      try {
        console.log("Setting session with tokens...");
        // Set the session using the tokens from the callback
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken ?? "",
        });

        if (sessionError) {
          console.error("Failed to set session from callback:", sessionError);
          setError(sessionError.message);
          return;
        }

        if (data.session) {
          console.log("Session set successfully, storing tokens...");
          setSession(data.session);
          setUser(data.session.user);
          await storeTokens(data.session);
          console.log("Tokens stored successfully");
        }
      } catch (err) {
        console.error("Error handling auth callback:", err);
        setError(err instanceof Error ? err.message : "Failed to complete sign in");
      }
    },
    [supabase, storeTokens],
  );

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

  // Listen for deep link events on desktop
  useEffect(() => {
    if (getRunEnv() !== RUN_ENV.DESKTOP) return;

    let unlistenFn: (() => void) | undefined;

    const setupDeepLinkListener = async () => {
      try {
        unlistenFn = await listenDeepLinkTauri<string>((event) => {
          const url = event.payload;
          console.log("Deep link received:", url);

          // First, check if this is a SnapTrade callback
          const snapTradeData = parseSnapTradeCallback(url);
          if (snapTradeData) {
            console.log("SnapTrade callback detected:", snapTradeData);
            // Dispatch a custom event that the SnapTrade portal component can listen to
            window.dispatchEvent(
              new CustomEvent(SNAPTRADE_CALLBACK_EVENT, { detail: snapTradeData }),
            );
            return;
          }

          // Check if this is an auth callback (Supabase)
          if (url.includes("/auth/callback") || url.includes("access_token")) {
            void handleAuthCallback(url);
          }
        });
      } catch (err) {
        console.error("Failed to set up deep link listener:", err);
      }
    };

    void setupDeepLinkListener();

    return () => {
      unlistenFn?.();
    };
  }, [handleAuthCallback]);

  // Handle auth callback on mount (check URL for auth tokens)
  // This works for both web and desktop (when OAuth happens in webview)
  useEffect(() => {
    // Check if current URL has auth tokens (web redirect callback)
    const currentUrl = window.location.href;
    if (currentUrl.includes("access_token") || currentUrl.includes("/auth/callback")) {
      console.log("Auth callback detected in URL:", currentUrl);
      void handleAuthCallback(currentUrl);
      // Clean up URL after handling
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [handleAuthCallback]);

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
        const isDesktop = getRunEnv() === RUN_ENV.DESKTOP;
        const redirectUrl = getOAuthRedirectUrl();

        // For desktop in production: open system browser, use hosted callback -> deep link
        // For desktop in dev or web: let OAuth happen in webview/browser with direct redirect
        const useSystemBrowser = isDesktop && import.meta.env.PROD;

        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            skipBrowserRedirect: useSystemBrowser,
            redirectTo: redirectUrl,
          },
        });

        if (oauthError) {
          throw oauthError;
        }

        // On desktop production, open the OAuth URL in the system browser
        if (useSystemBrowser && data.url) {
          await openUrlInBrowser(data.url);
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

  const signInWithMagicLink = useCallback(
    async (email: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const isDesktop = getRunEnv() === RUN_ENV.DESKTOP;

        // For magic links on desktop in production: use deep link (email client opens app)
        // For desktop in dev or web: use web callback
        const redirectUrl =
          isDesktop && import.meta.env.PROD ? DESKTOP_DEEP_LINK_URL : getWebRedirectUrl();

        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            // Redirect URL for when user clicks the magic link
            emailRedirectTo: redirectUrl,
          },
        });

        if (otpError) {
          throw otpError;
        }

        // Don't throw error - magic link sent successfully
        // The UI will handle showing success message
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send magic link";
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
      signInWithMagicLink,
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
      signInWithMagicLink,
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
