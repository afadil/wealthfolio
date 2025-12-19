import { getRunEnv, listenDeepLinkTauri, logger, openUrlInBrowser, RUN_ENV } from "@/adapters";
import { getUserInfo, type UserInfo } from "@/commands/brokers-sync";
import { getSecret } from "@/commands/secrets";
import { clearSyncSession, storeSyncSession } from "@/commands/wealthfolio-sync";
import { getPlatform } from "@/hooks/use-platform";
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
// Set via environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Keys for storing tokens in keyring
const REFRESH_TOKEN_KEY = "wealthfolio_sync_refresh_token";
const ACCESS_TOKEN_KEY = "wealthfolio_sync_access_token";

// Deep-link URL for desktop callbacks (custom URL scheme)
const DESKTOP_DEEP_LINK_URL = "wealthfolio://auth/callback";

// Universal link callback URL for Tauri mobile (associated domain)
const MOBILE_UNIVERSAL_LINK_CALLBACK_URL = "https://auth.wealthfolio.app/callback";

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
      status: status,
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

// For OAuth on desktop, we use a hosted callback page that redirects to the deep link
// This is necessary because browsers block direct navigation to custom URL schemes
const HOSTED_OAUTH_CALLBACK_URL = "https://connect.wealthfolio.app/auth/callback";

type AuthCallbackPayload = { type: "code"; code: string } | { type: "error"; message: string };

function parseAuthCallbackUrl(url: string): AuthCallbackPayload | null {
  try {
    const urlObj = new URL(url);
    const hashParams = new URLSearchParams(urlObj.hash.substring(1));

    const error =
      urlObj.searchParams.get("error_description") ??
      urlObj.searchParams.get("error") ??
      hashParams.get("error_description") ??
      hashParams.get("error");
    if (error) {
      return { type: "error", message: error };
    }

    const code = urlObj.searchParams.get("code");
    if (code) {
      return { type: "code", code };
    }

    const hasAccessToken =
      hashParams.has("access_token") || urlObj.searchParams.has("access_token") || false;
    if (hasAccessToken) {
      return {
        type: "error",
        message:
          "Unexpected token callback (access_token). This app expects Auth Code + PKCE; ensure Supabase is configured for PKCE and your hosted callback forwards the ?code=... parameter.",
      };
    }

    return null;
  } catch {
    return null;
  }
}

interface WealthfolioSyncContextValue {
  isConnected: boolean;
  isInitializing: boolean;
  isLoading: boolean;
  user: User | null;
  session: Session | null;
  teamId: string | null;
  userInfo: UserInfo | null;
  error: string | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: "google" | "apple" | "github") => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  refetchUserInfo: () => Promise<void>;
}

const WealthfolioSyncContext = createContext<WealthfolioSyncContextValue | undefined>(undefined);

function getAuthStorageKey(supabaseUrl: string): string {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split(".")[0];
    return `sb-${projectRef}-auth-token`;
  } catch {
    return "sb-auth-token";
  }
}

function createHybridPkceStorage(storageKey: string) {
  const inMemory = new Map<string, string>();
  const pkceKey = `${storageKey}-code-verifier`;

  const safeLocalStorageGet = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const safeLocalStorageSet = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore - PKCE exchange will fail after a full redirect without persistence
    }
  };

  const safeLocalStorageRemove = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  };

  return {
    getItem: (key: string) => {
      if (key === pkceKey) return safeLocalStorageGet(key);
      return inMemory.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (key === pkceKey) {
        safeLocalStorageSet(key, value);
        return;
      }
      inMemory.set(key, value);
    },
    removeItem: (key: string) => {
      if (key === pkceKey) {
        safeLocalStorageRemove(key);
        return;
      }
      inMemory.delete(key);
    },
  };
}

// Create a Supabase client with custom storage for persistent auth
const createSupabaseClient = () => {
  const storageKey = getAuthStorageKey(SUPABASE_URL);
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storageKey,
      storage: createHybridPkceStorage(storageKey),
      flowType: "pkce",
      autoRefreshToken: true,
      // Must be true for auth-js to use the provided `storage` (PKCE code_verifier lives there).
      // Our custom storage keeps sessions in-memory (non-persistent) while allowing PKCE to work
      // across full-page redirects.
      persistSession: true,
      detectSessionInUrl: false, // We handle URL parsing manually
    },
  });
};

export function WealthfolioSyncProvider({ children }: { children: ReactNode }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabaseRef = useRef<SupabaseClient | null>(null);

  // Initialize Supabase client
  supabaseRef.current ??= createSupabaseClient();

  const supabase = supabaseRef.current;

  // Store tokens securely in keyring (desktop) or localStorage (web fallback)
  const storeTokens = useCallback(async (session: Session | null) => {
    if (!session) {
      if (getRunEnv() === RUN_ENV.DESKTOP) {
        await clearSyncSession().catch(() => undefined);
      } else {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(ACCESS_TOKEN_KEY);
      }
      return;
    }

    if (getRunEnv() === RUN_ENV.DESKTOP) {
      await storeSyncSession(session.access_token, session.refresh_token ?? undefined);
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
  const retrieveRefreshToken = useCallback(async (): Promise<string | null> => {
    if (getRunEnv() === RUN_ENV.DESKTOP) {
      return getSecret(REFRESH_TOKEN_KEY).catch(() => null);
    }
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }, []);

  // Handle auth callback from URL (deep link or web redirect)
  const handleAuthCallback = useCallback(
    async (url: string) => {
      const payload = parseAuthCallbackUrl(url);

      if (!payload) {
        return;
      }

      if (payload.type === "error") {
        setError(payload.message);
        return;
      }

      try {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          payload.code,
        );

        if (exchangeError) {
          logger.error("Failed to exchange auth code for session.");
          setError(exchangeError.message);
          return;
        }

        if (!data.session) {
          setError("No session returned after completing sign-in.");
          return;
        }

        setSession(data.session);
        setUser(data.session.user);
        await storeTokens(data.session);
      } catch (err) {
        logger.error("Error handling auth callback.");
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
        const refreshToken = await retrieveRefreshToken();

        if (refreshToken) {
          // Use the refresh token to get a new session
          const { data, error: refreshError } = await supabase.auth.refreshSession({
            refresh_token: refreshToken,
          });

          if (refreshError) {
            logger.warn("Failed to refresh session.");
            // Clear invalid tokens
            await storeTokens(null);
          } else if (data.session && !cancelled) {
            setSession(data.session);
            setUser(data.session.user);
            // Store the new tokens (refresh token rotation)
            await storeTokens(data.session);
          }
        }
      } catch (_err) {
        logger.error("Error restoring session.");
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
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
  }, [supabase, storeTokens, retrieveRefreshToken]);

  // Listen for deep link events on desktop
  useEffect(() => {
    if (getRunEnv() !== RUN_ENV.DESKTOP) return;

    let unlistenFn: (() => void) | undefined;

    const setupDeepLinkListener = async () => {
      try {
        unlistenFn = await listenDeepLinkTauri<string>((event) => {
          const url = event.payload;

          // First, check if this is a SnapTrade callback
          const snapTradeData = parseSnapTradeCallback(url);
          if (snapTradeData) {
            // Dispatch a custom event that the SnapTrade portal component can listen to
            window.dispatchEvent(
              new CustomEvent(SNAPTRADE_CALLBACK_EVENT, { detail: snapTradeData }),
            );
            return;
          }

          const authPayload = parseAuthCallbackUrl(url);
          if (authPayload) {
            void handleAuthCallback(url);
          }
        });
      } catch (_err) {
        logger.error("Failed to set up deep link listener.");
      }
    };

    void setupDeepLinkListener();

    return () => {
      unlistenFn?.();
    };
  }, [handleAuthCallback]);

  // Handle auth callback on mount (webview redirect callback)
  // This works for both web and desktop (when OAuth happens in webview)
  useEffect(() => {
    const currentUrl = window.location.href;
    if (parseAuthCallbackUrl(currentUrl)) {
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
        const isTauri = getRunEnv() === RUN_ENV.DESKTOP;
        const platform = isTauri ? await getPlatform() : null;
        const isMobile = platform?.is_mobile ?? false;

        const redirectUrl =
          isTauri && import.meta.env.PROD
            ? isMobile
              ? MOBILE_UNIVERSAL_LINK_CALLBACK_URL
              : HOSTED_OAUTH_CALLBACK_URL
            : getWebRedirectUrl();

        const useSystemBrowser = isTauri && import.meta.env.PROD;
        const queryParams =
          provider === "google"
            ? {
                // Forces the account chooser instead of silently reusing the last Google session.
                prompt: "select_account",
              }
            : undefined;

        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            skipBrowserRedirect: useSystemBrowser,
            redirectTo: redirectUrl,
            queryParams,
          },
        });

        if (oauthError) {
          throw oauthError;
        }

        // On Tauri production, open the OAuth URL in the system browser
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
        const isTauri = getRunEnv() === RUN_ENV.DESKTOP;
        const platform = isTauri ? await getPlatform() : null;
        const isMobile = platform?.is_mobile ?? false;

        const redirectUrl =
          isTauri && import.meta.env.PROD
            ? isMobile
              ? MOBILE_UNIVERSAL_LINK_CALLBACK_URL
              : DESKTOP_DEEP_LINK_URL
            : getWebRedirectUrl();

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

  const verifyOtp = useCallback(
    async (email: string, token: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "email",
        });

        if (verifyError) {
          throw verifyError;
        }

        if (data.session) {
          setSession(data.session);
          setUser(data.session.user);
          await storeTokens(data.session);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid verification code";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [supabase, storeTokens],
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

  // Fetch user info from the cloud API
  const refetchUserInfo = useCallback(async () => {
    if (!session || getRunEnv() !== RUN_ENV.DESKTOP) {
      setUserInfo(null);
      return;
    }

    try {
      const info = await getUserInfo();
      setUserInfo(info);
    } catch (_err) {
      logger.error("Failed to fetch user info from API.");
      setUserInfo(null);
    }
  }, [session]);

  // Fetch user info when session changes
  useEffect(() => {
    if (session) {
      void refetchUserInfo();
    } else {
      setUserInfo(null);
    }
  }, [session, refetchUserInfo]);

  // Extract team_id from user's app_metadata
  const teamId = useMemo(() => {
    return (user?.app_metadata?.team_id as string | undefined) ?? null;
  }, [user]);

  const value = useMemo<WealthfolioSyncContextValue>(
    () => ({
      isConnected: !!session,
      isInitializing,
      isLoading,
      user,
      session,
      teamId,
      userInfo,
      error,
      signInWithEmail,
      signUpWithEmail,
      signInWithOAuth,
      signInWithMagicLink,
      verifyOtp,
      signOut,
      clearError,
      refetchUserInfo,
    }),
    [
      session,
      isInitializing,
      isLoading,
      user,
      teamId,
      userInfo,
      error,
      signInWithEmail,
      signUpWithEmail,
      signInWithOAuth,
      signInWithMagicLink,
      verifyOtp,
      signOut,
      clearError,
      refetchUserInfo,
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
