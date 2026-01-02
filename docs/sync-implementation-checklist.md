# Sync System Implementation Checklist

## Status Legend
- [ ] Not started
- [x] Completed
- [~] In progress

---

## Phase 1: Design & Documentation

- [x] Create design document (`docs/sync-system-design.md`)
- [x] Create implementation checklist (`docs/sync-implementation-checklist.md`)

---

## Phase 2: Tauri Backend Changes

### 2.1 Remove Background Scheduler
- [x] Remove `scheduler::start_broker_sync_scheduler()` call from `desktop::setup()` in `lib.rs`
- [x] Remove `scheduler::start_broker_sync_scheduler()` call from `mobile::setup()` in `lib.rs`
- [x] Refactor `scheduler.rs` to remove periodic interval loop

### 2.2 Add Foreground Sync Command
- [x] Add `trigger_foreground_sync` command in `brokers_sync.rs`
- [x] Implement throttle check (1 hour minimum)
- [x] Return appropriate response (synced, throttled, error)
- [x] Register command in `lib.rs` invoke_handler
- [x] Check subscription status before sync (only sync if active)

### 2.3 Add Window Focus Listener (Desktop)
- [x] Add window focus event listener in `desktop::setup()`
- [x] Emit `app:foreground` event to frontend on focus

### 2.4 Mobile Foreground Support
- [x] Ensure `app:foreground` event works for mobile (frontend-triggered)

---

## Phase 3: Docker Server Changes

### 3.1 Create Scheduler Module
- [x] Create `src-server/src/scheduler.rs`
- [x] Implement 4-hour fixed interval
- [x] Add initial delay (60 seconds)
- [x] Handle authentication errors gracefully
- [x] Check subscription status before sync (only sync if active/trialing)

### 3.2 Update Events
- [x] Add `BROKER_SYNC_START` constant to `events.rs`
- [x] Add `BROKER_SYNC_COMPLETE` constant to `events.rs`

### 3.3 Integrate Scheduler
- [x] Add `mod scheduler;` to `main.rs`
- [x] Call `scheduler::start_broker_sync_scheduler()` after state initialization

---

## Phase 4: Frontend Changes

### 4.1 Foreground Sync Hook
- [x] Create `use-foreground-sync.ts` hook
- [x] Handle Tauri `app:foreground` event
- [x] Handle web `visibilitychange` event
- [x] Add query invalidation on sync

### 4.2 Sidebar Last Sync Time
- [x] Update `ConnectNavItem` to show last sync time
- [x] Add tooltip for collapsed state
- [x] Import and use `formatDistanceToNow` from date-fns

### 4.3 Integration
- [x] Export `useForegroundSync` from hooks index
- [x] Call `useForegroundSync()` in `AppLayout`

### 4.4 Utilities
- [x] Create/verify `is-tauri.ts` utility exists

---

## Phase 5: Testing

### 5.1 Unit Tests (Rust)
- [x] Test throttle logic in `scheduler.rs` (6 tests passing)
- [ ] Test sync state management
- [ ] Test error handling for auth errors

### 5.2 Unit Tests (TypeScript)
- [ ] Test `useForegroundSync` hook behavior
- [ ] Test throttle timing calculations

### 5.3 Integration Tests
- [ ] Test foreground sync flow end-to-end
- [ ] Test Docker scheduler timing
- [ ] Test portfolio update trigger after sync

---

## Phase 6: Verification

### 6.1 Desktop App
- [ ] Build and run desktop app
- [ ] Verify no background scheduler running
- [ ] Verify sync triggers on window focus
- [ ] Verify 1-hour throttle works
- [ ] Verify manual sync bypasses throttle
- [ ] Verify last sync time displays in sidebar

### 6.2 Mobile App
- [ ] Build and run mobile app
- [ ] Verify sync triggers on app foreground
- [ ] Verify throttle works on mobile

### 6.3 Docker/Web
- [ ] Build Docker image
- [ ] Verify scheduler starts on server boot
- [ ] Verify 4-hour interval (check logs)
- [ ] Verify web client receives sync events
- [ ] Verify last sync time displays correctly

---

## Phase 7: Code Quality

- [x] Run `cargo check` - compiles successfully
- [ ] Run `cargo clippy` - no warnings
- [ ] Run `cargo fmt` - code formatted
- [x] Run `pnpm run type-check` - no TypeScript errors
- [ ] Run `pnpm run build` - builds successfully
- [x] Review for any hardcoded values that should be constants

---

## Files Modified

### Tauri (Backend)
| File | Change |
|------|--------|
| `src-tauri/src/scheduler.rs` | Refactored to foreground-only with throttle |
| `src-tauri/src/commands/brokers_sync.rs` | Added `trigger_foreground_sync` command |
| `src-tauri/src/lib.rs` | Removed scheduler calls, added focus listener |

### Docker Server
| File | Change |
|------|--------|
| `src-server/src/scheduler.rs` | Created (new file) - 4h background scheduler |
| `src-server/src/events.rs` | Added broker sync events |
| `src-server/src/main.rs` | Added scheduler startup |
| `src-server/src/api.rs` | Made `shared` module public |

### Frontend
| File | Change |
|------|--------|
| `src-front/features/wealthfolio-connect/hooks/use-foreground-sync.ts` | Created (new file) |
| `src-front/features/wealthfolio-connect/hooks/index.ts` | Added export |
| `src-front/pages/layouts/app-layout.tsx` | Added hook call |
| `src-front/pages/layouts/navigation/connect-nav-item.tsx` | Added last sync time |
| `src-front/lib/is-tauri.ts` | Created (new file) |

### Documentation
| File | Change |
|------|--------|
| `docs/sync-system-design.md` | Created (new file) |
| `docs/sync-implementation-checklist.md` | Created (new file) |

---

## Rollback Plan

If issues are discovered:

1. **Tauri apps**: Revert `lib.rs` to restore background scheduler
2. **Docker**: Remove scheduler module import from `main.rs`
3. **Frontend**: Remove `useForegroundSync` call from AppLayout

---

## Notes

- Background scheduler removed from Tauri to save battery/resources
- Users get fresh data when they actually look at the app
- Docker keeps background scheduler since server runs 24/7
- 4-hour interval for Docker is not user-configurable (prevents API abuse)
- Manual sync always available and bypasses throttle
- 6 unit tests for throttle logic all passing
- Sync only runs for users with active subscription (status: "active")
