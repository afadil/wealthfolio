---
name: ai-assistant-implementation
description: Implement Wealthfolio AI Assistant using repo-idiomatic structure with @assistant-ui/react (frontend) and rig-core (Rust backend). Enforces backend-only secrets, unified streaming events, deterministic tool UI, and treats AI-POC-COPY as reference-only.
---

# Wealthfolio AI Assistant Implementation (SOTA + Repo-Idiomatic)

Use this skill whenever implementing or refactoring the AI Assistant.

## Non-negotiables

- **Repo conventions first**: follow existing patterns in `src-front/commands/*`, adapters, and backend command wiring; do not invent a parallel architecture.
- **`AI-POC-COPY/` is reference-only**: never import it into production paths; do not copy folder structure; only port small snippets after aligning with repo patterns and adding tests.
- **Backend-only secrets**: the frontend never needs provider keys for chat/model listing/tools; backend reads `ai_<provider_id>` from OS secret store and attaches it to provider SDK requests.
- **Unified stream contract**: desktop (Tauri Channel) and web (NDJSON) must emit the same `AiStreamEvent` schema with `messageId` + terminal `done`.
- **Deterministic tool UI in v1**: tool results are structured DTOs rendered with fixed React components; no model-emitted UI JSON.

## Required references

- Architecture decisions: `tasks/ai-assistant-architecture-review.md`
- PRD (source of truth): `tasks/prd-ai-assistant-prd-wealthfolio.md`
- Task plan (Ralph loop): `tasks/ai-assistant-prd.json`

## How we use the libraries (recommended way)

- Frontend (`@assistant-ui/react`): see `assistant-ui.md`
- Backend (`rig-core`): see `rig-core.md`
- PoC usage policy: see `poc-policy.md`

## E2E Smoke Testing (Recommended Default)

Use **Ollama** for end-to-end testing because it requires **no API key** and can run fully local.

- Provider: `OLLAMA`
- Secret: none (no `ai_OLLAMA` key)
- Base URL (typical): `http://localhost:11434`
- Model: use an installed Ollama model (e.g., `mistral` / `mistral-3` if present)

