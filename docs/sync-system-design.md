# Broker Sync System Design

## Overview

This document describes the broker data synchronization architecture for Wealthfolio across all platforms (Desktop, Mobile, Web/Docker).

## Design Principles

1. **Sync when the user needs data** - Foreground-triggered sync provides fresh data when the user actually looks at the app
2. **Prevent API abuse** - Fixed intervals and throttling prevent excessive API calls
3. **Platform-appropriate behavior** - Each platform uses the sync strategy that makes sense for its context
4. **Reliability** - Proper error handling, retry logic, and state persistence

## Architecture by Platform

### Desktop & Mobile (Tauri)

**Strategy: Foreground-only sync**

```
User opens/returns to app
         │
         ▼
┌─────────────────────────────────┐
│  Foreground Detection           │
│  - Desktop: window:focus event  │
│  - Mobile: app:foreground event │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Throttle Check                 │
│  - Read last_successful_sync    │
│  - If elapsed < 1 hour → skip   │
│  - If elapsed >= 1 hour → sync  │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Sync Execution                 │
│  1. Check authentication        │
│  2. Sync connections            │
│  3. Sync accounts               │
│  4. Sync activities             │
│  5. Trigger portfolio update    │
└─────────────────────────────────┘
```

**Key Features:**
- Syncs when app gains focus after being in background
- 1-hour minimum interval between automatic syncs
- Manual sync always available (bypasses throttle)
- No background scheduler (saves battery/resources)

### Web/Docker Server

**Strategy: Background-only scheduler**

```
Server Startup
         │
         ▼
┌─────────────────────────────────┐
│  Start Background Scheduler     │
│  - Fixed 4-hour interval        │
│  - No user configuration        │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Every 4 Hours:                 │
│  1. Check authentication        │
│  2. Sync all connected accounts │
│  3. Trigger portfolio update    │
│  4. Broadcast event to clients  │
└─────────────────────────────────┘
```

**Key Features:**
- Fixed 4-hour interval (not user-configurable to prevent API abuse)
- Runs continuously while server is running
- Manual sync endpoint available: `POST /api/connect/sync`
- Events broadcast to connected web clients via EventBus

## Sync Flow Diagram

```
                    ┌─────────────────────────────────────────┐
                    │              Cloud API                   │
                    │         api.wealthfolio.app             │
                    └───────────────┬─────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│   Desktop (Tauri)   │ │   Mobile (Tauri)    │ │   Web/Docker        │
├─────────────────────┤ ├─────────────────────┤ ├─────────────────────┤
│ Trigger: Focus      │ │ Trigger: Foreground │ │ Trigger: 4h Timer   │
│ Throttle: 1 hour    │ │ Throttle: 1 hour    │ │ Throttle: None      │
│ Background: No      │ │ Background: No      │ │ Background: Yes     │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
            │                       │                       │
            └───────────────────────┼───────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │           Local SQLite DB               │
                    │  - brokers_sync_state (last sync time)  │
                    │  - import_runs (sync history)           │
                    │  - activities (synced data)             │
                    └─────────────────────────────────────────┘
```

## Throttling Logic

```rust
const MIN_SYNC_INTERVAL_SECS: u64 = 60 * 60; // 1 hour

fn should_sync(last_sync: Option<DateTime<Utc>>) -> bool {
    match last_sync {
        None => true, // Never synced, sync now
        Some(last) => {
            let elapsed = Utc::now() - last;
            elapsed.num_seconds() >= MIN_SYNC_INTERVAL_SECS as i64
        }
    }
}
```

## Event Flow

### Tauri (Desktop/Mobile)

```
Window Focus Event
      │
      ▼
Frontend: useVisibilitySync() hook
      │
      ▼
Invoke: trigger_foreground_sync command
      │
      ▼
Backend: Check throttle → perform_broker_sync()
      │
      ▼
Emit: broker:sync-complete event
      │
      ▼
Emit: portfolio:trigger-update (if new data)
      │
      ▼
Frontend: Invalidate queries, update UI
```

### Docker Server

```
Scheduler Tick (every 4h)
      │
      ▼
run_broker_sync()
      │
      ▼
EventBus: publish(broker:sync-complete)
      │
      ▼
SSE: Broadcast to connected web clients
      │
      ▼
Frontend: Invalidate queries, update UI
```

## Database Schema

### brokers_sync_state

| Column | Type | Description |
|--------|------|-------------|
| account_id | TEXT | Local account ID |
| provider | TEXT | Provider name (e.g., "snaptrade") |
| last_attempted_at | TIMESTAMP | When sync was last attempted |
| last_successful_at | TIMESTAMP | When sync last succeeded |
| last_error | TEXT | Error message if failed |
| sync_status | TEXT | IDLE, RUNNING, NEEDS_REVIEW, FAILED |

### Global Last Sync Time

The "last synced" time displayed in the UI is computed as:
```sql
SELECT MAX(last_successful_at) FROM brokers_sync_state
```

## UI Components

### Sidebar Navigation

```
┌─────────────────────────────┐
│ ☁️ Connect                   │
│    Last synced: 2h ago      │  ← Shown when not collapsed
└─────────────────────────────┘
```

When collapsed, tooltip shows: "Connect - Last synced 2h ago"

### Connect Page

```
┌─────────────────────────────────────────────┐
│ Sync Status                    [Sync Now]   │
│ ────────────────────────────────────────────│
│ ● All accounts synced                       │
│ Last synced: 2 hours ago                    │
│ Next auto-sync: when you return to the app  │
└─────────────────────────────────────────────┘
```

## Error Handling

1. **Authentication errors**: Silent skip (user knows they're not logged in)
2. **Network errors**: Log warning, emit error event, retry on next trigger
3. **API rate limits (429)**: Exponential backoff (500ms, 1s, 2s)
4. **Server errors (5xx)**: Retry up to 3 times with backoff

## Testing Strategy

### Unit Tests

1. **Throttle logic**: Test `should_sync()` with various time scenarios
2. **Sync state management**: Test state transitions
3. **Event emission**: Test correct events emitted for each scenario

### Integration Tests

1. **Foreground sync flow**: Mock window focus, verify sync triggered
2. **Throttle enforcement**: Multiple focus events, verify single sync
3. **Portfolio update trigger**: Verify portfolio updates after sync with new data

## Implementation Checklist

- [ ] Remove background scheduler from Tauri (desktop/mobile)
- [ ] Add foreground sync trigger for Tauri desktop (window:focus)
- [ ] Add foreground sync trigger for Tauri mobile (app:foreground)
- [ ] Add foreground sync trigger for Web (visibilitychange)
- [ ] Implement sync throttling (1h minimum)
- [ ] Add last sync time to sidebar navigation
- [ ] Implement Docker server scheduler (4h fixed)
- [ ] Write unit tests for throttle logic
- [ ] Update Connect page to show next sync info
- [ ] Add manual sync bypass for throttle

## Configuration

### Tauri (Not User-Configurable)

| Setting | Value | Reason |
|---------|-------|--------|
| Min sync interval | 1 hour | Prevent API abuse |
| Sync trigger | Foreground only | Battery/resource efficiency |

### Docker (Not User-Configurable)

| Setting | Value | Reason |
|---------|-------|--------|
| Sync interval | 4 hours | Balance freshness vs API usage |
| Manual sync | Available | Users can always trigger manually |

## Migration Notes

- Existing background scheduler will be removed from Tauri apps
- Users will get fresh data when they open/return to the app
- No data loss - sync state is preserved
- First foreground sync after update will trigger immediately (no prior sync recorded)
