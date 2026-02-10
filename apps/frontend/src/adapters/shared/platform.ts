// Platform core module re-export for shared adapters.
// Vite resolves "#platform" to tauri/core or web/core based on BUILD_TARGET.
// This allows shared modules to use platform-specific invoke/logger without duplication.

export { invoke, logger, isDesktop, isWeb } from "#platform";
