# Addon query client and cache invalidation design

## Overview

Each sandboxed addon owns one TanStack Query `QueryClient`. The client is reused
across that addon's route renders, then cleared when the sandbox stops. It is
not the main application's client and does not share the host's in-memory cache.

```tsx
import type { QueryClient } from "@wealthfolio/addon-sdk";

const addonQueryClient = ctx.api.query.getClient() as QueryClient;

function AddonRoot() {
  return (
    <QueryClientProvider client={addonQueryClient}>
      <AddonPage />
    </QueryClientProvider>
  );
}
```

The isolation is intentional: a query cannot leak data or observers between
addons, and removing an addon also removes its cache.

## Invalidation bridge

The sandbox augments the addon's client so calls to `invalidateQueries()` and
`refetchQueries()` do two things:

1. Update the local addon cache.
2. Send the same query-key operation to the host through `ctx.api.query`.

The convenience methods below use the same bridge:

```typescript
ctx.api.query.invalidateQueries(["accounts"]);
ctx.api.query.refetchQueries(["portfolio", "holdings"]);
```

This keeps mutations initiated by an addon coherent with host views without
exposing the host client across the iframe boundary. The reverse direction is
not automatic: a host cache invalidation does not directly mutate an addon's
local cache.

## Reacting to host changes

Use the domain event APIs when addon data must react to work initiated elsewhere
in Wealthfolio. Invalidate the addon's local query after receiving the event:

```typescript
export async function enable(ctx: AddonContext) {
  const queryClient = ctx.api.query.getClient() as QueryClient;
  const unlisten = await ctx.api.events.portfolio.onUpdateComplete(() => {
    void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
  });

  ctx.onDisable(unlisten);
}
```

Do not rely on matching query keys alone to synchronize the two processes. Keys
identify cache entries locally; events and the invalidation bridge coordinate
changes across the sandbox boundary.

## Recommended usage

- Call `ctx.api.query.getClient()` once and pass that client to
  `QueryClientProvider`.
- Use stable domain query keys within the addon.
- After an addon mutation, invalidate or refetch the relevant key. The bridge
  updates the host as well as the addon.
- Listen to relevant host events for changes the addon did not initiate.
- Do not create a second `QueryClient` unless the addon deliberately needs a
  separate cache.
- Do not store the client outside the sandbox lifecycle.

## Data flow

```text
Addon mutation
    ↓
addon QueryClient invalidate/refetch
    ├─ updates addon-local observers
    └─ RPC bridge → host QueryAPI → updates matching host queries

Host mutation
    ↓
host domain event → addon listener → addon-local invalidate/refetch
```
