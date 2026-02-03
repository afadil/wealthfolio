# `@assistant-ui/react` (Frontend) — Recommended Usage Here

## Goals

- Keep the UI thin: it renders state built from the backend stream; it does not
  implement provider SDK logic.
- Ensure the transcript can be reconstructed from persisted message parts (Ralph
  loop log).

## Rules

- **All AI IO goes through** `src-front/commands/ai.ts` (invoke wrapper), never
  direct provider fetch from the browser.
- **Stream is event-driven**: parse backend `AiStreamEvent` and update a single
  in-memory assistant message until `{ type: "done" }`.
- **Persistence**:
  - Persist user message immediately.
  - Persist assistant message once on `done` (no per-chunk DB writes).
- **Keys**:
  - Settings supports Save/Delete/Reveal via secrets endpoints.
  - Chat/model fetch never handles API keys in the frontend.

## E2E smoke checklist (use Ollama)

- Enable provider `OLLAMA`, set base URL (typically `http://localhost:11434`),
  choose an installed model (e.g., `mistral` / `mistral-3`).
- Verify: chat streams, tool calls/results render, and messages persist across
  restart.

## Stream handling (expected)

Consume events (NDJSON/web or Channel/desktop) of:

- `textDelta`, `reasoningDelta` (optional), `toolCall`, `toolResult`, `error`,
  `done`

UI expectations:

- `messageId` is stable (uuid7) and used to reconcile events.
- Tool calls/results are shown inline (and tool results also trigger
  deterministic renderers).

## Deterministic tool UI

Maintain a tool renderer registry like:

- `get_valuations` → line chart
- `get_holdings` → holdings table

Renderers must accept the structured DTO (no parsing of stringified JSON blobs).
