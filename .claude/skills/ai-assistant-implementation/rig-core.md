# `rig-core` (Rust Backend) — Recommended Usage Here

## Goals

- One orchestration loop: model ↔ tools ↔ model, streaming `AiStreamEvent`.
- Keep Axum/Tauri glue thin and consistent.

## Rules

- **All provider calls are backend-only**; never accept API keys from the
  frontend.
- Secrets are read from OS secret store using key `ai_<provider_id>`.
- IDs are minted by backend using uuid7 (threads/messages/toolCallId if needed).
- Tools are read-only in v1 and have strict input validation + bounded outputs.

## E2E default provider (keyless)

- Prefer **Ollama** for E2E/smoke because it is keyless.
- The backend should treat missing `ai_OLLAMA` as normal (no “API key
  required”).
- Apply `baseUrl` from user settings when calling Ollama (typically
  `http://localhost:11434`).

## Structure (expected)

- `crates/ai-assistant/`
  - `service`: orchestrates the loop and emits `AiStreamEvent`
  - `providers`: provider adapters that rig-core uses
  - `tools`: tool registry + schemas + result shaping (data + meta)
  - `types`: shared DTOs/events used by Axum/Tauri + frontend

## Emitted stream events

- Always include `messageId` on deltas and tool events.
- Always emit `done` (terminal).
- Tool args/results are structured JSON (serde), not stringified.

## Logging/privacy

- Never log secrets.
- Never log raw portfolio payloads; log only metadata (tool name, counts,
  duration, truncation).
