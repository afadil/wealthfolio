// Global ambient type declarations to avoid `any` for globals
import type { QueryClient } from '@tanstack/react-query';

declare global {
  interface Window {
    // Tauri global injected by the desktop runtime
    __TAURI__?: unknown;

    // Exposed for addon integration
    __wealthfolio_query_client__?: QueryClient;
    __wealthfolio_navigate__?: (route: string) => void;

    // Dev helpers and framework singletons made available at runtime
    React?: unknown;
    ReactDOM?: unknown;
    __ADDON_DEV__?: unknown;
    __DEV_ADDONS__?: Map<string, unknown>;
  }

  // Additional globals (available in dev)
  // eslint-disable-next-line no-var
  var debugAddons: unknown;
}

export {};

