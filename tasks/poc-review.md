# AI-POC-COPY Review: Keep, Avoid, Test Oracles

Reference: `AI-POC-COPY/` (validation PoC, to be deleted after implementation)

---

## Keep (Ideas Worth Porting)

### Backend (rig-core)

1. **AiEnvironment trait** (`ai-crate/src/chat.rs:44-53`)
   - Clean DI pattern; env provides services without coupling to Tauri/Axum
   - Port: define similar trait in `crates/ai-assistant/`, implement for ServiceContext/AppState

2. **Tool struct pattern** (`ai-crate/src/tools/holdings.rs`)
   - Generic `Tool<E>` with `call()` returning typed output
   - Structured args/output DTOs (`HoldingsToolArgs`, `HoldingsToolOutput`)
   - Port: use this pattern but ensure tool outputs include `meta` envelope per architecture review

3. **Provider catalog from JSON** (`ai-crate/src/providers.rs:52-61`)
   - `include_str!` + `Lazy<Vec<AiProviderInfo>>` avoids DB migrations
   - Already implemented in `src-front/lib/ai-providers.json` (US-001)
   - Port: backend needs equivalent catalog loading

4. **Secret key naming** (`ai-crate/src/chat.rs:136-138`)
   - `ai_provider:{provider_id}` format is good
   - Align with architecture review: simplify to `ai:<provider_id>` (shorter, matches market-data style)

5. **Ollama keyless handling** (`ai-crate/src/chat.rs:315-328`)
   - Local providers don't require API key; code gracefully handles missing secret
   - Port: preserve this flexibility

6. **System prompt separation** (`ai-crate/src/system_prompt.txt`)
   - External file via `include_str!` for maintainability
   - Port: keep prompt in a dedicated file under `crates/ai-assistant/src/`

7. **Stream event types** (`ai-crate/src/chat.rs:55-78`)
   - Tagged enum with `text`, `reasoning`, `toolCall`, `toolResult`, `error`
   - Port: add `done` terminal event and `messageId` per architecture review

### Frontend (@assistant-ui/react)

8. **ChatModelAdapter pattern** (`src-front/modules/chat/runtime.ts`)
   - Clean async generator consuming backend stream
   - Builds content array incrementally with proper status handling
   - Port: use this adapter pattern in `src-front/features/ai-assistant/`

9. **Dual-target streaming** (`src-front/modules/chat/api.ts`)
   - Desktop: Tauri Channel with queue + promise resolution
   - Web: NDJSON fetch + line parsing
   - Port: replicate in `src-front/commands/ai.ts` following repo adapter pattern

10. **Tool UI registry** (`src-front/modules/chat/tool-ui/`)
    - `makeAssistantToolUI` maps tool names to React components
    - `normalizeResult` handles snake_case/camelCase variants
    - Port: create tool renderer registry under `src-front/features/ai-assistant/tool-renderers/`

11. **HistoryChart reuse** (`tool-ui/valuation-history-tool-ui.tsx`)
    - Existing `<HistoryChart>` component from repo; no new chart lib needed
    - Port: wire existing UI components to tool results

---

## Avoid (Anti-Patterns)

### Structure / Architecture

1. **Parallel folder structure**
   - PoC has `AI-POC-COPY/src-front/`, `AI-POC-COPY/src-tauri/`, etc.
   - Problem: violates repo conventions; creates maintenance burden
   - Instead: add AI features to existing dirs (`src-front/features/ai-assistant/`, `crates/ai-assistant/`)

2. **Separate ai-crate Cargo workspace**
   - PoC has standalone `AI-POC-COPY/ai-crate/Cargo.toml`
   - Instead: new crate under `crates/ai-assistant/` integrated with existing workspace

3. **Duplicated commands/hooks across PoC**
   - PoC copies entire `commands/`, `hooks/` dirs
   - Instead: add only new AI-specific commands to existing structure

### Code Patterns

4. **String-based role checking** (`chat.rs:108-109`)
   ```rust
   if role.eq_ignore_ascii_case("user")
   ```
   - Problem: stringly-typed, error-prone
   - Instead: use typed enum `Role { User, Assistant }`

5. **No `done` terminal event** (`chat.rs` stream loop)
   - PoC relies on channel close to signal completion
   - Problem: frontend can't distinguish "complete" from "connection dropped"
   - Instead: emit explicit `{ type: "done", messageId }` event

6. **`argsText` as string, not object** (`chat.rs:68`)
   - PoC serializes args to string, forces frontend to re-parse
   - Instead: emit `args: serde_json::Value` directly; keep `argsText` for debug logging only

7. **Tool result as string** (`chat.rs:514`)
   - `result: result_text` requires double JSON parsing
   - Instead: emit structured `result: serde_json::Value` per architecture review

8. **No messageId on stream events** (`AiStreamChunk` enum)
   - Problem: frontend can't correlate chunks to in-progress message
   - Instead: all events include `messageId` (uuid7)

9. **Legacy settings migration in hot path** (`repository.rs:45-75`)
   - `load_legacy_settings()` runs on every settings load
   - Instead: migrate once on app startup or first access, then remove legacy code

10. **Macro for agent building** (`chat.rs:348-372`)
    - `run_agent!` macro reduces boilerplate but obscures type errors
    - Instead: use a helper function with generics; easier to debug

11. **Hardcoded multi_turn(6)** (`chat.rs:455`)
    - Fixed limit buried in code
    - Instead: make configurable via settings or constant in config module

### Frontend

12. **Inline hook state in render** (`tool-ui/valuation-history-tool-ui.tsx:116`)
    - `const parsed = normalizeResult(result)` outside useMemo
    - Instead: memoize normalization to prevent re-parsing on every render

13. **Complex normalizeResult** (`tool-ui/valuation-history-tool-ui.tsx:35-95`)
    - Handles camelCase/snake_case + string/object variants
    - Problem: backend should emit consistent format
    - Instead: fix backend to always emit camelCase structured objects; frontend does minimal normalization

14. **Channel cleanup hack** (`api.ts:108-109`)
    ```typescript
    // @ts-expect-error - Tauri Channel doesn't have a proper cleanup method
    channel.onmessage = null;
    ```
    - Instead: investigate proper Tauri Channel lifecycle or wrap in AbortController

---

## Test Oracles (Expected Behaviors)

### Chat Streaming

| Scenario | Expected Behavior |
|----------|-------------------|
| User sends message | Backend mints `messageId` (uuid7), streams `textDelta` events with same ID |
| Provider returns reasoning | `reasoningDelta` events streamed separately from text |
| Tool invocation | `toolCall` event with `toolCallId`, `toolName`, structured `args` |
| Tool completion | `toolResult` event with matching `toolCallId`, structured `result` + `meta` |
| Stream ends normally | `done` event with `messageId`; frontend persists message |
| Provider error mid-stream | `error` event with `message`; partial content preserved |
| Network failure | Frontend detects incomplete stream; shows error state |
| Cancel/abort | Stream stops; frontend shows "cancelled" status |

### Tool Execution

| Tool | Input | Expected Output |
|------|-------|-----------------|
| `get_holdings` | `{ accountId: null }` | Holdings for all active accounts |
| `get_holdings` | `{ accountId: "abc" }` | Holdings for specific account |
| `get_valuation_history` | `{ accountId: null }` | Uses TOTAL aggregated portfolio |
| `get_valuation_history` | `{ startDate, endDate }` | Filtered by date range |
| `get_account_valuations` | `{ accountIds: null }` | Latest valuations for all active |
| `get_goals` | (no args) | Goals with progress from latest valuations |
| `search_activities` | `{ query }` | Activities matching search (bounded) |

### Settings / Secrets

| Scenario | Expected Behavior |
|----------|-------------------|
| Save API key | Stored in OS secret store as `ai:<provider_id>` |
| Delete API key | Removed from secret store; `hasApiKey` returns false |
| Reveal API key | Returns actual key only on explicit reveal action |
| Chat without key (Ollama) | Works with baseUrl only |
| Chat without key (OpenAI) | Returns `MissingApiKey` error |
| Provider enabled/disabled | Persisted in SQLite; catalog metadata unchanged |
| Model selection | Persisted per provider; falls back to `defaultModel` if invalid |
| Custom baseUrl | Applied to provider requests; stored in settings |

### UI Rendering

| Scenario | Expected Behavior |
|----------|-------------------|
| Text streaming | Incremental text display; no flicker |
| Tool call in progress | Shows tool name + spinner |
| Tool result received | Renders appropriate component (chart/table) |
| `get_valuation_history` result | `<HistoryChart>` with date filtering |
| `get_holdings` result | Table with holdings data |
| Error state | Red error message; option to retry |
| Empty tool result | "No data" placeholder |

### Persistence

| Scenario | Expected Behavior |
|----------|-------------------|
| User message sent | Persisted immediately |
| Streaming completes | Assistant message persisted once on `done` |
| Stream interrupted | Partial message NOT persisted (v1) |
| Thread creation | New thread with uuid7 ID; auto-title from first message |
| Thread deletion | Messages cascade-deleted |

---

## Migration Path

1. **Do NOT copy** `AI-POC-COPY/` folders into production paths
2. **Create fresh** `crates/ai-assistant/` following repo crate conventions
3. **Port ideas** from PoC after adapting to repo patterns
4. **Add tests** for each behavior in test oracles before implementation
5. **Delete** `AI-POC-COPY/` once implementation is complete and tested
