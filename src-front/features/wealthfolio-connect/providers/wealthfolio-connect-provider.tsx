import { isDesktop, listenDeepLink, logger, openUrlInBrowser, getSecret, setSecret, deleteSecret } from "@/adapters";
import { authenticate as authenticateWithASWebAuth } from "tauri-plugin-web-auth-api";
import { getUserInfo } from "../services/broker-service";
import { storeSyncSession, clearSyncSession } from "../services/auth-service";
import type { UserInfo } from "../types";
import { getPlatform } from "@/hooks/use-platform";
import { CONNECT_ENABLED } from "@/lib/connect-config";
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

// Auth configuration - these are public keys (safe for client-side)
// Set via environment variables: CONNECT_AUTH_URL and CONNECT_AUTH_PUBLISHABLE_KEY
const SUPABASE_URL = import.meta.env.CONNECT_AUTH_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.CONNECT_AUTH_PUBLISHABLE_KEY as string;

// Key for storing refresh token in keyring/localStorage (for session restoration)
// Note: For keyring (Tauri), the "wealthfolio_" prefix is added automatically by SecretStore
const REFRESH_TOKEN_KEY = "sync_refresh_token";

// Deep-link URL for desktop callbacks (custom URL scheme)
const DESKTOP_DEEP_LINK_URL = "wealthfolio://auth/callback";

// Universal link callback URL for Tauri mobile (associated domain)
const MOBILE_UNIVERSAL_LINK_CALLBACK_URL = "https://auth.wealthfolio.app/callback";

// Web redirect URL for OAuth and magic link
const getWebRedirectUrl = () => {
  return `${window.location.origin}/auth/callback`;
};

// For OAuth on desktop, we use a hosted callback page that redirects to the deep link
// This is necessary because browsers block direct navigation to custom URL schemes
// Uses env variable in dev, falls back to production URL for bundled builds
const HOSTED_OAUTH_CALLBACK_URL =
  (import.meta.env.CONNECT_OAUTH_CALLBACK_URL as string) ||
  "https://connect.wealthfolio.app/deeplink";

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

interface WealthfolioConnectContextValue {
  isEnabled: boolean;
  isConnected: boolean;
  isInitializing: boolean;
  isLoading: boolean;
  isLoadingUserInfo: boolean;
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

const WealthfolioConnectContext = createContext<WealthfolioConnectContextValue | undefined>(
  undefined,
);

// Disabled context value - used when CONNECT_ENABLED is false
// All methods are no-ops that return resolved promises
const disabledContextValue: WealthfolioConnectContextValue = {
  isEnabled: false,
  isConnected: false,
  isInitializing: false,
  isLoading: false,
  isLoadingUserInfo: false,
  user: null,
  session: null,
  teamId: null,
  userInfo: null,
  error: null,
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signInWithOAuth: async () => {},
  signInWithMagicLink: async () => {},
  verifyOtp: async () => {},
  signOut: async () => {},
  clearError: () => {},
  refetchUserInfo: async () => {},
};

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

// Internal provider used when Connect is enabled
function EnabledWealthfolioConnectProvider({ children }: { children: ReactNode }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabaseRef = useRef<SupabaseClient | null>(null);

  // Initialize Supabase client
  supabaseRef.current ??= createSupabaseClient();

  const supabase = supabaseRef.current;

  // Store tokens: refresh token goes to backend (for cloud API calls) and locally (for session restoration)
  const storeTokens = useCallback(async (session: Session | null) => {
    logger.debug(`storeTokens called, isDesktop=${isDesktop}, hasSession=${!!session}`);

    if (!session) {
      // Clear from backend - throw on failure so signOut properly reports errors
      await clearSyncSession();

      // Clear session restoration token from secret store (keyring on desktop, FileSecretStore on web)
      await deleteSecret(REFRESH_TOKEN_KEY).catch((err) => {
        logger.warn(`Failed to delete refresh token: ${err}`);
      });
      return;
    }

    // Store tokens in backend's encrypted secret store (backend can mint fresh access tokens if needed)
    if (session.refresh_token) {
      try {
        await storeSyncSession(session.refresh_token, session.access_token);
        logger.info("Tokens stored in backend successfully");
      } catch (err) {
        logger.error(`Failed to store tokens in backend: ${err}`);
      }
    }

    // Also store refresh token in secret store for session restoration on app restart
    // Desktop: OS keyring, Web: backend FileSecretStore (both via setSecret command)
    if (session.refresh_token) {
      try {
        await setSecret(REFRESH_TOKEN_KEY, session.refresh_token);
        logger.info(isDesktop ? "Refresh token stored in keyring" : "Refresh token stored in backend");
      } catch (err) {
        logger.error(`setSecret failed: ${err}`);
        // Fallback to localStorage only on desktop where keyring might fail
        if (isDesktop) {
          localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
        }
      }
    }
  }, []);

  // Retrieve refresh token from secret store (keyring on desktop, FileSecretStore on web)
  const retrieveRefreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await getSecret(REFRESH_TOKEN_KEY);
      if (token) return token;
    } catch (err) {
      logger.debug(`getSecret failed: ${err}`);
    }
    // Fallback to localStorage for desktop (legacy tokens or keyring failures)
    if (isDesktop) {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    }
    return null;
  }, []);

  // Handle auth callback from URL (deep link or web redirect)
  const handleAuthCallback = useCallback(
    async (url: string) => {
      logger.info(`handleAuthCallback called with URL: ${url.substring(0, 100)}...`);
      const payload = parseAuthCallbackUrl(url);

      if (!payload) {
        logger.error("Failed to parse auth callback URL - no payload");
        return;
      }

      logger.info(`Parsed payload type: ${payload.type}`);

      if (payload.type === "error") {
        logger.error(`Auth callback error: ${payload.message}`);
        setError(payload.message);
        return;
      }

      try {
        logger.info("Exchanging code for session...");
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          payload.code,
        );

        if (exchangeError) {
          logger.error(`Failed to exchange auth code: ${exchangeError.message}`);
          setError(exchangeError.message);
          return;
        }

        if (!data.session) {
          logger.error("No session returned after code exchange");
          setError("No session returned after completing sign-in.");
          return;
        }

        logger.info("Session received, storing tokens...");
        logger.info(`Access token length: ${data.session.access_token?.length ?? 0}`);
        logger.info(`Refresh token length: ${data.session.refresh_token?.length ?? 0}`);
        // Store tokens BEFORE setting session to avoid race condition
        await storeTokens(data.session);
        logger.info("storeTokens function returned, setting session state...");
        setSession(data.session);
        setUser(data.session.user);
        logger.info("Auth callback completed successfully");
      } catch (err) {
        logger.error(`Error in handleAuthCallback: ${err instanceof Error ? err.message : err}`);
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
            logger.debug("Failed to refresh session.");
            // Clear invalid tokens
            await storeTokens(null);
          } else if (data.session && !cancelled) {
            // Store tokens BEFORE setting session to avoid race condition
            await storeTokens(data.session);
            setSession(data.session);
            setUser(data.session.user);
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
        // Store tokens BEFORE setting session to avoid race condition
        // where isConnected becomes true before token is in keyring
        await storeTokens(newSession);
        setSession(newSession);
        setUser(newSession?.user ?? null);
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
    if (!isDesktop) return;

    let unlistenFn: (() => Promise<void>) | undefined;

    const setupDeepLinkListener = async () => {
      try {
        unlistenFn = await listenDeepLink<string>((event) => {
          const url = event.payload;

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
      void unlistenFn?.();
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
          // Store tokens BEFORE setting session to avoid race condition
          await storeTokens(data.session);
          setSession(data.session);
          setUser(data.session.user);
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
          // Store tokens BEFORE setting session to avoid race condition
          await storeTokens(data.session);
          setSession(data.session);
          setUser(data.session.user);
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
        const isTauri = isDesktop;
        const platform = isTauri ? await getPlatform() : null;
        const isMobile = platform?.is_mobile ?? false;
        const isIOS = platform?.os === "ios";

        // iOS mobile: Use ASWebAuthenticationSession with deep link callback
        // This is required because Google blocks OAuth from embedded webviews (WKWebView)
        // ASWebAuthenticationSession opens a secure Safari sheet that Google accepts
        // Note: This is needed in both dev and prod modes on iOS
        const useASWebAuth = isTauri && isMobile && isIOS;

        // Determine redirect URL based on platform
        // iOS ASWebAuth always needs deep link URL (works in dev and prod)
        // Desktop prod uses hosted callback → deep link (can't use in dev - URL scheme not registered)
        // Dev mode uses webview redirect (simpler, no deep link registration needed)
        const redirectUrl = useASWebAuth
          ? DESKTOP_DEEP_LINK_URL // iOS: Always use deep link for ASWebAuthenticationSession
          : isTauri && import.meta.env.PROD
            ? isMobile
              ? MOBILE_UNIVERSAL_LINK_CALLBACK_URL // Android prod
              : HOSTED_OAUTH_CALLBACK_URL // Desktop prod
            : getWebRedirectUrl(); // Web or dev mode (webview redirect)

        const useSystemBrowser = isTauri && import.meta.env.PROD && !useASWebAuth;
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
            skipBrowserRedirect: useSystemBrowser || useASWebAuth,
            redirectTo: redirectUrl,
            queryParams,
          },
        });

        if (oauthError) {
          throw oauthError;
        }

        // iOS mobile: Use ASWebAuthenticationSession plugin
        // This opens a secure Safari sheet that Google accepts for OAuth
        if (useASWebAuth && data.url) {
          try {
            logger.info("Starting ASWebAuth flow...");
            logger.info(`OAuth URL: ${data.url.substring(0, 100)}...`);

            const result = await authenticateWithASWebAuth({
              url: data.url,
              callbackScheme: "wealthfolio",
            });

            logger.info(`ASWebAuth result: ${JSON.stringify(result)}`);

            // The plugin returns the full callback URL with the auth code
            if (result?.callbackUrl) {
              logger.info(`Callback URL received: ${result.callbackUrl.substring(0, 100)}...`);
              await handleAuthCallback(result.callbackUrl);
              logger.info("handleAuthCallback completed");
            } else {
              logger.error("No callbackUrl in ASWebAuth result");
            }
          } catch (authErr) {
            // User cancelled or auth failed
            const message =
              authErr instanceof Error ? authErr.message : "Authentication was cancelled";
            logger.error(`ASWebAuth error: ${message}`);
            // Don't throw if user just cancelled
            if (!message.toLowerCase().includes("cancel")) {
              throw authErr;
            }
            logger.info("OAuth authentication was cancelled by user");
          }
          return;
        }

        // Desktop: Open the OAuth URL in the system browser
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
    [supabase, handleAuthCallback],
  );

  const signInWithMagicLink = useCallback(
    async (email: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const isTauri = isDesktop;
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
          // Store tokens BEFORE setting session to avoid race condition
          await storeTokens(data.session);
          setSession(data.session);
          setUser(data.session.user);
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
    if (!session) {
      setUserInfo(null);
      setIsLoadingUserInfo(false);
      return;
    }

    setIsLoadingUserInfo(true);
    setError(null);

    try {
      const info = await getUserInfo();
      setUserInfo(info);
    } catch (err) {
      logger.error("Failed to fetch user info from API.");
      setUserInfo(null);
      const message = err instanceof Error ? err.message : "Failed to fetch user info";
      setError(message);
    } finally {
      setIsLoadingUserInfo(false);
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

  const value = useMemo<WealthfolioConnectContextValue>(
    () => ({
      isEnabled: true,
      isConnected: !!session,
      isInitializing,
      isLoading,
      isLoadingUserInfo,
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
      isLoadingUserInfo,
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
    <WealthfolioConnectContext.Provider value={value}>
      {children}
    </WealthfolioConnectContext.Provider>
  );
}

// Main provider that chooses enabled/disabled path based on configuration
export function WealthfolioConnectProvider({ children }: { children: ReactNode }) {
  if (!CONNECT_ENABLED) {
    return (
      <WealthfolioConnectContext.Provider value={disabledContextValue}>
        {children}
      </WealthfolioConnectContext.Provider>
    );
  }

  return <EnabledWealthfolioConnectProvider>{children}</EnabledWealthfolioConnectProvider>;
}

export const useWealthfolioConnect = () => {
  const ctx = useContext(WealthfolioConnectContext);
  if (!ctx) {
    throw new Error("useWealthfolioConnect must be used within a WealthfolioConnectProvider");
  }
  return ctx;
};
