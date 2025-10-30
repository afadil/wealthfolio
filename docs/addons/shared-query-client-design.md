# Addon Query Client and Cache Management Design

## Overview

This document describes the design for sharing the React Query client between
the main Wealthfolio application and addons, enabling automatic cache
invalidation and data synchronization.

## Architecture

### 1. Shared Query Client

Instead of each addon creating its own QueryClient, addons now share the main
application's QueryClient:

**Before:**

```tsx
// Each addon had its own QueryClient
const queryClient = new QueryClient({
  /* config */
});
```

**After:**

```tsx
// Addons use the shared QueryClient from main app
const sharedQueryClient = ctx.api.query.getClient();
```

### 2. Global QueryClient Exposure

The main app exposes its QueryClient globally:

```tsx
// In App.tsx
const [queryClient] = useState(
  () =>
    new QueryClient({
      /* config */
    }),
);
(window as any).__wealthfolio_query_client__ = queryClient;
```

### 3. Shared Query Keys

Both the main app and addons use the same query keys to ensure cache
consistency:

```typescript
// Shared in @wealthfolio/addon-sdk
export const QueryKeys = {
  GOALS: "goals",
  GOALS_ALLOCATIONS: "goals_allocations",
  ACCOUNTS: "accounts",
  // ... other keys
} as const;
```

### 4. Query API in Addon Context

Addons have access to query management functions:

```typescript
interface QueryAPI {
  getClient(): QueryClient;
  invalidateQueries(queryKey: string | string[]): void;
  refetchQueries(queryKey: string | string[]): void;
}
```

## Benefits

### 1. **Cache Consistency**

- Single source of truth for all cached data
- No data duplication between main app and addons
- Consistent cache invalidation strategies

### 2. **Automatic Synchronization**

- When main app updates data, addons automatically see changes
- No need for manual refresh or polling mechanisms
- Real-time updates across the entire application

### 3. **Performance**

- Single network request per data type
- Shared cache reduces memory usage
- Efficient data fetching and caching

### 4. **Event-Driven Updates**

- Addons can listen for data change events
- Automatic cache invalidation on data mutations
- Reactive UI updates without manual intervention

## Implementation Example

### Goal Progress Tracker Addon

The goal progress tracker addon demonstrates this pattern:

```typescript
// Simple hook using shared query keys - no event listeners needed
export function useGoals({ ctx, enabled = true }: UseGoalsOptions) {
  return useQuery<Goal[]>({
    queryKey: [QueryKeys.GOALS], // Shared query key
    queryFn: async () => {
      const data = await ctx.api.goals.getAll();
      return data || [];
    },
    enabled: enabled && !!ctx.api,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
```

### Addon Wrapper Component

```tsx
const AddonWrapper = () => {
  const sharedQueryClient = ctx.api.query.getClient();
  return (
    <QueryClientProvider client={sharedQueryClient}>
      <AddonComponent ctx={ctx} />
    </QueryClientProvider>
  );
};
```

## Data Flow

1. **User creates a goal** in Settings → Goals page
2. **Main app** updates the goal via mutation
3. **Main app** invalidates `QueryKeys.GOALS` cache automatically (via React
   Query mutation)
4. **Goal Progress Tracker addon** automatically receives updated data (shared
   cache)
5. **Addon UI** re-renders with fresh data

## Cache Invalidation Strategy

With the shared query client approach, cache invalidation happens automatically:

- **Main app mutations** use React Query's built-in invalidation
- **Shared cache** means invalidation affects all components (main app + addons)
- **No manual event handling** required in addon hooks
- **Automatic synchronization** across the entire application

## Best Practices

### 1. Use Shared Query Keys

Always import and use QueryKeys from the addon SDK:

```typescript
import { QueryKeys } from "@wealthfolio/addon-sdk";
```

### 2. Listen for Relevant Events

Set up event listeners in your hooks to automatically invalidate cache when data
changes:

```typescript
useEffect(() => {
  const unlisten = await ctx.api.events.goals.onCreate(() => {
    ctx.api.query.invalidateQueries([QueryKeys.GOALS]);
  });
  return unlisten;
}, [ctx]);
```

### 3. Use the Shared QueryClient

Always use the shared QueryClient for consistency:

```tsx
const queryClient = ctx.api.query.getClient();
```

### 4. Proper Cache Keys

Use descriptive and consistent cache keys that match the main app's patterns:

```typescript
queryKey: [QueryKeys.GOALS];
queryKey: [QueryKeys.latestValuations, accountIds];
```

## Future Enhancements

1. **Typed Event Payloads**: Add strong typing for event payloads
2. **Granular Invalidation**: More specific cache invalidation strategies
3. **Optimistic Updates**: Support for optimistic UI updates
4. **Cache Persistence**: Shared cache persistence strategies
5. **Cache Analytics**: Monitoring and debugging tools for cache behavior

This design provides a robust foundation for data synchronization between the
main application and addons, ensuring a seamless user experience across all
components of the Wealthfolio ecosystem.
