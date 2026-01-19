# Adapter Architecture

This document describes the adapter system used to support multiple runtime
environments (Desktop/Tauri and Web/REST API) with compile-time environment
detection.

## Overview

Wealthfolio runs in two environments:

- **Desktop (Tauri)**: Uses Tauri's IPC to invoke Rust commands directly
- **Web**: Uses REST API calls to a backend server

The adapter system provides a unified interface that works identically in both
environments, with the correct implementation selected at build time.

## Directory Structure

```
src-front/adapters/
├── index.ts          # Re-exports from default adapter (for TypeScript)
├── types.ts          # Shared types for all adapters
├── tauri/
│   └── index.ts      # Desktop/Tauri implementation
└── web/
    └── index.ts      # Web/REST API implementation
```

## How It Works

### Build-Time Resolution

Vite's `resolve.alias` is configured to point `@/adapters` to either
`adapters/tauri` or `adapters/web` based on the `BUILD_TARGET` environment
variable:

```typescript
// vite.config.ts
const buildTarget = process.env.BUILD_TARGET || "tauri";

export default defineConfig({
  resolve: {
    alias: {
      "@/adapters": path.resolve(
        __dirname,
        buildTarget === "tauri"
          ? "./src-front/adapters/tauri"
          : "./src-front/adapters/web"
      ),
    },
  },
});
```

### Build Scripts

The `package.json` scripts set the appropriate `BUILD_TARGET`:

```json
{
  "scripts": {
    "dev": "BUILD_TARGET=web vite",
    "dev:tauri": "BUILD_TARGET=tauri vite",
    "build": "BUILD_TARGET=web ... vite build",
    "build:tauri": "BUILD_TARGET=tauri vite build"
  }
}
```

### TypeScript Support

For TypeScript type-checking (which doesn't use Vite's aliases), `index.ts`
re-exports from the Tauri adapter by default:

```typescript
// src-front/adapters/index.ts
export * from "./tauri";
```

This ensures TypeScript can resolve types correctly while the actual build uses
the correct adapter.

## Unified Interface

All adapters export the same interface:

```typescript
// Core exports
export const RUN_ENV: RunEnv; // "desktop" | "web"
export const isDesktop: boolean;
export const isWeb: boolean;
export const logger: Logger;

// Typed command functions (preferred pattern)
export const getAccounts: <T>() => Promise<T[]>;
export const syncBrokerData: () => Promise<void>;
export const getImportRuns: <T>(request?: ImportRunsRequest) => Promise<T[]>;
// ... more typed functions for each backend command

// Event listeners
export const listenDeepLink: (callback: EventCallback<string>) => Promise<UnlistenFn>;
export const listenNavigateToRoute: (callback: EventCallback<string>) => Promise<UnlistenFn>;
// ... more event listeners

// File operations
export const openFileSaveDialog: (content: string | Uint8Array | Blob, fileName: string) => Promise<boolean>;
export const openFolderDialog: () => Promise<string | null>;

// Types
export type { EventCallback, UnlistenFn, Logger, RunEnv };
export type { ExtractedAddon, InstalledAddon, AddonManifest, ... };
```

## Usage in Code

Import typed functions from `@/adapters` and use them in services:

```typescript
import {
  logger,
  getAccounts as getAccountsAdapter,
  syncBrokerData as syncBrokerDataAdapter
} from "@/adapters";

// Service wraps adapter with error handling
export const getAccounts = async (): Promise<Account[]> => {
  try {
    return await getAccountsAdapter<Account>();
  } catch (error) {
    logger.error("Error getting accounts.");
    throw error;
  }
};

// Check environment when needed
import { isDesktop } from "@/adapters";

if (isDesktop) {
  // Desktop-specific code (e.g., file dialogs)
  const { open } = await import("@tauri-apps/plugin-dialog");
  // ...
}
```

## Benefits

1. **Dead Code Elimination**: Web builds don't include Tauri code and vice versa
2. **No Runtime Checks**: Environment is determined at compile time
3. **Type Safety**: Full TypeScript support with unified types
4. **Cleaner Code**: No `if (isDesktop)` scattered throughout the codebase
5. **Smaller Bundles**: Each build only includes the code it needs

## Adding New Commands

When adding a new backend command:

1. Add a typed function in `adapters/tauri/index.ts` using `tauriInvoke`
2. Add the REST API mapping in `adapters/web/index.ts` COMMANDS map
3. Add a matching typed function in `adapters/web/index.ts` using `invoke`
4. Create a service function that wraps the adapter with error handling

Example:

```typescript
// adapters/tauri/index.ts
export async function myNewCommand<T>(data: MyData): Promise<T> {
  return tauriInvoke<T>("my_new_command", { data });
}

// adapters/web/index.ts
// 1. Add to COMMANDS map
const COMMANDS = {
  // ...existing commands
  my_new_command: { method: "POST", path: "/my-endpoint" },
};

// 2. Add typed function
export async function myNewCommand<T>(data: MyData): Promise<T> {
  return invoke<T>("my_new_command", { data });
}

// services/my-service.ts
import { logger, myNewCommand as myNewCommandAdapter } from "@/adapters";

export const myNewCommand = async (data: MyData): Promise<Result> => {
  try {
    return await myNewCommandAdapter<Result>(data);
  } catch (error) {
    logger.error("Error in myNewCommand.");
    throw error;
  }
};
```

## Desktop-Only Features

Some features only work on desktop (e.g., file system dialogs). These should:

1. Check `isDesktop` before calling
2. Use dynamic imports for Tauri plugins
3. Provide graceful fallbacks for web

```typescript
import { isDesktop } from "@/adapters";

if (isDesktop) {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const filePath = await open({ filters: [{ name: "CSV", extensions: ["csv"] }] });
  // ...
}
```
