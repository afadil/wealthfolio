# Wealthfolio AI Assistant Architecture

## Overview

The AI Assistant provides conversational access to portfolio data through natural language queries. It uses LLM orchestration with tool calling to fetch and analyze financial data, presenting results through a streaming chat interface.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React)                                   │
│                                                                              │
│  ┌───────────────────┐  ┌────────────────────┐  ┌───────────────────────┐  │
│  │   Thread List     │  │    Chat Shell      │  │   Tool Result Cards   │  │
│  │   - Pinned        │  │    - Messages      │  │   - Holdings table    │  │
│  │   - Recent        │  │    - Streaming     │  │   - Performance chart │  │
│  │   - Search        │  │    - Tool calls    │  │   - Account summary   │  │
│  └───────────────────┘  └────────────────────┘  └───────────────────────┘  │
│                                    │                                         │
└────────────────────────────────────┼─────────────────────────────────────────┘
                                     │
                                     │ NDJSON Stream (AiStreamEvent)
                                     │ POST /api/v1/ai/chat/stream
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Transport Layer                                      │
│                                                                              │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────────┐ │
│  │   Tauri (Desktop)           │    │   Axum (Web Server)                 │ │
│  │   - IPC Channel streaming   │    │   - NDJSON HTTP streaming           │ │
│  │   - TauriAiEnvironment      │    │   - ServerAiEnvironment             │ │
│  └─────────────────────────────┘    └─────────────────────────────────────┘ │
│                                    │                                         │
└────────────────────────────────────┼─────────────────────────────────────────┘
                                     │
                                     │ AiEnvironment trait
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        wealthfolio-ai crate                                  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         ChatService<E>                                 │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │  │
│  │  │  Thread Cache   │  │   rig-core      │  │   Tool Registry     │   │  │
│  │  │  (LRU, 100)     │  │   Agent         │  │   - get_holdings    │   │  │
│  │  │                 │  │   - streaming   │  │   - get_accounts    │   │  │
│  │  │  Fast lookups   │  │   - multi-turn  │  │   - search_activity │   │  │
│  │  │  for recent     │  │   - tool calls  │  │   - get_performance │   │  │
│  │  │  threads        │  │                 │  │   - get_goals       │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │  │
│  │           │                    │                      │               │  │
│  │           │         Stream completes                  │               │  │
│  │           │                    │                      │               │  │
│  │           ▼                    ▼                      ▼               │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │              Persistence Actor (background tokio task)          │  │  │
│  │  │                                                                 │  │  │
│  │  │  - Receives SaveThread/SaveMessage commands via channel         │  │  │
│  │  │  - Batches writes for efficiency (500ms or 10 items)            │  │  │
│  │  │  - Never blocks the streaming response                          │  │  │
│  │  │  - Retries on transient failures                                │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                     │                                        │
└─────────────────────────────────────┼────────────────────────────────────────┘
                                      │
                                      │ AiChatRepositoryTrait (async)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       wealthfolio-core                                       │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    Domain Types (ai module)                            │  │
│  │                                                                        │  │
│  │  AiThread              AiMessage              AiMessageContent         │  │
│  │  ├─ id                 ├─ id                  ├─ schema_version        │  │
│  │  ├─ title              ├─ thread_id           ├─ parts[]               │  │
│  │  ├─ is_pinned          ├─ role                │   ├─ Text              │  │
│  │  ├─ tags[]             ├─ content             │   ├─ Reasoning         │  │
│  │  ├─ config             ├─ created_at          │   ├─ ToolCall          │  │
│  │  ├─ created_at         └─────────────         │   ├─ ToolResult        │  │
│  │  └─ updated_at                                │   └─ Error             │  │
│  │                                               └───────────────         │  │
│  │  AiChatRepositoryTrait                                                 │  │
│  │  ├─ create_thread()    ├─ create_message()   ├─ add_tag()             │  │
│  │  ├─ get_thread()       ├─ get_message()      ├─ remove_tag()          │  │
│  │  ├─ list_threads()     ├─ get_messages_by_thread()                    │  │
│  │  ├─ update_thread()    ├─ update_message()                            │  │
│  │  └─ delete_thread()                                                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      │ Implements trait
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    wealthfolio-storage-sqlite                                │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      ai_chat module                                    │  │
│  │                                                                        │  │
│  │  AiChatRepository implements AiChatRepositoryTrait                     │  │
│  │  ├─ pool: Arc<Pool<SqliteConnection>>                                  │  │
│  │  └─ writer: WriteHandle (serialized writes)                            │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │  │
│  │  │   ai_threads    │  │   ai_messages   │  │   ai_thread_tags    │   │  │
│  │  │   ───────────   │  │   ───────────   │  │   ──────────────    │   │  │
│  │  │   id PK         │  │   id PK         │  │   id PK             │   │  │
│  │  │   title         │  │   thread_id FK  │  │   thread_id FK      │   │  │
│  │  │   is_pinned     │  │   role          │  │   tag               │   │  │
│  │  │   config_json   │  │   content_json  │  │   created_at        │   │  │
│  │  │   created_at    │  │   created_at    │  │                     │   │  │
│  │  │   updated_at    │  │                 │  │   UNIQUE(thread,tag)│   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Non-Blocking Streaming

The streaming response must never be blocked by database operations. We achieve this through:

- **Write-behind pattern**: Persistence happens asynchronously after stream completion
- **Background actor**: A dedicated tokio task handles all DB writes
- **Bounded channels**: Backpressure prevents memory exhaustion

### 2. Type Separation

Clear separation between streaming and persistence concerns:

| Layer | Types | Purpose |
|-------|-------|---------|
| **Streaming** | `AiStreamEvent`, `ToolResult`, `SendMessageRequest` | Wire format for real-time updates |
| **Domain** | `AiThread`, `AiMessage`, `AiMessageContent` | Persistence and business logic |
| **Storage** | `AiThreadDB`, `AiMessageDB` | Database models (Diesel) |

### 3. Stateless LLM Integration

Following rig-core's design, conversation history is passed per-request:

```rust
// rig-core API - history passed, not stored internally
agent.stream_chat(prompt, history: Vec<Message>).multi_turn(6)
```

This allows:
- Clean separation between orchestration and persistence
- Easy testing with mock history
- No hidden state in the agent

## Component Details

### ChatService

The main orchestrator that handles:

1. **Thread management**: Create, retrieve, cache threads
2. **History loading**: Fetch messages from DB for context
3. **LLM streaming**: Coordinate with rig-core agents
4. **Persistence dispatch**: Send commands to background actor

```rust
pub struct ChatService<E: AiEnvironment> {
    env: Arc<E>,
    tool_registry: ToolRegistry,
    config: ChatConfig,

    // LRU cache for fast thread lookups
    thread_cache: Arc<RwLock<LruCache<String, AiThread>>>,

    // Channel to persistence actor
    persistence_tx: mpsc::Sender<PersistenceCommand>,
}
```

### Persistence Actor

Background task that batches and executes DB writes:

```rust
enum PersistenceCommand {
    SaveThread(AiThread),
    SaveMessage(AiMessage),
    UpdateThreadTitle { thread_id: String, title: String },
    DeleteThread(String),
}

async fn persistence_actor(
    rx: mpsc::Receiver<PersistenceCommand>,
    repository: Arc<dyn AiChatRepositoryTrait>,
) {
    // Batch writes every 500ms or when batch reaches 10 items
    // Retry transient failures with exponential backoff
}
```

### AiEnvironment Trait

Dependency injection interface implemented by Tauri and Axum:

```rust
pub trait AiEnvironment: Send + Sync {
    // Currency for formatting
    fn base_currency(&self) -> String;

    // Services for tool execution
    fn account_service(&self) -> Arc<dyn AccountServiceTrait>;
    fn activity_service(&self) -> Arc<dyn ActivityServiceTrait>;
    fn holdings_service(&self) -> Arc<dyn HoldingsServiceTrait>;
    fn valuation_service(&self) -> Arc<dyn ValuationServiceTrait>;
    fn goal_service(&self) -> Arc<dyn GoalServiceTrait>;

    // Settings and secrets
    fn settings_service(&self) -> Arc<dyn SettingsServiceTrait>;
    fn secret_store(&self) -> Arc<dyn SecretStore>;

    // Chat persistence
    fn chat_repository(&self) -> Arc<dyn AiChatRepositoryTrait>;
}
```

### Tool Registry

Manages available tools with allowlist support:

```rust
pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn Tool>>,
}

impl ToolRegistry {
    // Filter tools by allowlist for thread-specific restrictions
    pub fn get_definitions(&self, allowlist: Option<&[String]>) -> Vec<ToolDefinition>;

    // Execute with allowlist check
    pub async fn execute(
        &self,
        name: &str,
        args: Value,
        ctx: &ToolContext,
        allowlist: Option<&[String]>,
    ) -> Result<ToolResult, AiError>;
}
```

## Streaming Protocol

### Event Types

```typescript
type AiStreamEvent =
  | { type: "system"; threadId: string; runId: string; messageId: string }
  | { type: "textDelta"; threadId: string; runId: string; messageId: string; delta: string }
  | { type: "reasoningDelta"; threadId: string; runId: string; messageId: string; delta: string }
  | { type: "toolCall"; threadId: string; runId: string; messageId: string; toolCall: ToolCall }
  | { type: "toolResult"; threadId: string; runId: string; messageId: string; result: ToolResultData }
  | { type: "error"; threadId: string; runId: string; messageId?: string; code: string; message: string }
  | { type: "done"; threadId: string; runId: string; messageId: string; message: AiMessage; usage?: UsageStats }
```

### Event Sequence

```
Client                          Server
  │                               │
  │  POST /ai/chat/stream         │
  │  { content: "Show holdings" } │
  │ ─────────────────────────────>│
  │                               │
  │    { type: "system", ... }    │  ← Stream starts
  │ <─────────────────────────────│
  │                               │
  │    { type: "textDelta", ... } │  ← "Let me look up..."
  │ <─────────────────────────────│
  │                               │
  │    { type: "toolCall", ... }  │  ← get_holdings called
  │ <─────────────────────────────│
  │                               │
  │    { type: "toolResult", ...} │  ← Holdings data + metadata
  │ <─────────────────────────────│
  │                               │
  │    { type: "textDelta", ... } │  ← "You have 15 holdings..."
  │ <─────────────────────────────│
  │                               │
  │    { type: "done", ... }      │  ← Final message, stream ends
  │ <─────────────────────────────│
  │                               │
```

## Tool Result Envelope

All tool outputs use a consistent envelope for rich frontend rendering:

```rust
pub struct ToolResult {
    pub data: serde_json::Value,  // Structured result data
    pub meta: HashMap<String, Value>, // Metadata for UI
}

// Metadata includes:
// - count: Number of items returned
// - originalCount: Total items before truncation
// - returnedCount: Items actually returned
// - truncated: Whether results were truncated
// - durationMs: Execution time
// - accountScope: Which account(s) were queried
```

### Bounded Outputs

Tools enforce maximum output sizes to prevent context overflow:

| Tool | Limit | Constant |
|------|-------|----------|
| get_holdings | 100 items | `MAX_HOLDINGS` |
| search_activities | 200 rows | `MAX_ACTIVITIES_ROWS` |
| get_valuations | 400 points | `MAX_VALUATIONS_POINTS` |
| get_income | 50 records | `MAX_INCOME_RECORDS` |

## Message Content Schema

Messages store structured content with versioning for forward compatibility:

```json
{
  "schemaVersion": 1,
  "parts": [
    { "type": "text", "content": "Here are your holdings:" },
    {
      "type": "toolCall",
      "toolCallId": "tc-123",
      "name": "get_holdings",
      "arguments": { "accountId": "all" }
    },
    {
      "type": "toolResult",
      "toolCallId": "tc-123",
      "success": true,
      "data": { "holdings": [...] },
      "meta": { "count": 15, "truncated": false }
    },
    { "type": "text", "content": "You have 15 holdings worth $125,000." }
  ],
  "truncated": false
}
```

## Error Handling

### Error Categories

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_input` | 400 | Malformed request |
| `missing_api_key` | 400 | Provider API key not configured |
| `provider_error` | 502 | LLM provider returned error |
| `tool_not_found` | 400 | Unknown tool requested |
| `tool_not_allowed` | 403 | Tool not in allowlist |
| `tool_execution_failed` | 500 | Tool threw an error |
| `thread_not_found` | 404 | Thread ID doesn't exist |
| `internal_error` | 500 | Unexpected server error |

### Error Recovery

- **Transient errors**: Retry with exponential backoff (persistence actor)
- **Provider errors**: Surface to user with retry option
- **Tool errors**: Include in message content, continue conversation

## Performance Considerations

### Caching Strategy

| Cache | Size | TTL | Purpose |
|-------|------|-----|---------|
| Thread cache | 100 entries | LRU eviction | Fast thread lookups |
| Provider catalog | Static | Compile-time | Provider/model metadata |

### Database Optimization

- **Write batching**: Groups writes for fewer transactions
- **Async writes**: Never blocks streaming responses
- **Index strategy**:
  - `ai_threads(updated_at DESC)` for listing
  - `ai_messages(thread_id, created_at)` for history loading
  - `ai_thread_tags(thread_id, tag)` for filtering

### Memory Management

- **Bounded channels**: 100 item limit prevents unbounded growth
- **Stream backpressure**: Slow consumers cause sender to wait
- **Content truncation**: Large tool results truncated before storage

## Security Considerations

### API Key Management

- Keys stored in platform secret store (Keychain/Credential Manager)
- Never sent to frontend
- Retrieved server-side for each request

### Tool Allowlist

- Per-thread tool restrictions via `AiThreadConfig.tools_allowlist`
- Default: read-only tools only
- No write operations in v1

### Input Validation

- Content length limits on user messages
- JSON schema validation for tool arguments
- SQL injection prevention via parameterized queries

## Future Enhancements

### Planned Features

1. **Conversation summarization**: Compress long histories for context efficiency
2. **Semantic search**: Find relevant past conversations
3. **Write tools**: Add activities, update goals (with confirmation)
4. **Multi-modal**: Support for chart screenshots in queries

### Extension Points

- `Tool` trait for adding new tools
- `AiEnvironment` trait for new service integrations
- `AiStreamEvent` variants for new event types
- Message content part types for new content kinds
