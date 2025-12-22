/**
 * Wealthfolio Connect feature flag.
 *
 * The Connect module (Supabase auth, broker sync, cloud API) is optional.
 * When these environment variables are not set, the app runs fully offline
 * with no Connect-related UI or initialization.
 */
export const CONNECT_ENABLED = Boolean(
  import.meta.env.CONNECT_AUTH_URL && import.meta.env.CONNECT_AUTH_PUBLISHABLE_KEY,
);
