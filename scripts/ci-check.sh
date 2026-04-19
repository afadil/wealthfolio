#!/usr/bin/env bash
# ci-check.sh — mirrors CI checks before git commit/push
# Usage:
#   bash scripts/ci-check.sh           # fast checks (commit mode)
#   bash scripts/ci-check.sh --full    # + cargo test + pnpm test (push mode)
#
# Reads hook JSON from stdin (Claude Code PreToolUse format).
# Outputs {"decision":"block","reason":"..."} on failure.

set -euo pipefail

FULL=false
if [[ "${1:-}" == "--full" ]]; then
  FULL=true
fi

REPO_ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ── Determine changed files ──────────────────────────────────────────────────
# Commit mode: check staged files. Push mode: check branch diff vs main.
if [[ "$FULL" == "false" ]]; then
  CHANGED=$(git diff --cached --name-only 2>/dev/null || true)
else
  BASE=$(git merge-base HEAD main 2>/dev/null || echo "HEAD~1")
  CHANGED=$(git diff --name-only "$BASE"...HEAD 2>/dev/null || true)
fi

HAS_RUST=$(echo "$CHANGED" | grep -qE '\.rs$' && echo "true" || echo "false")
HAS_FRONTEND=$(echo "$CHANGED" | grep -qE '\.(ts|tsx|js|jsx|css)$' && echo "true" || echo "false")

# Nothing relevant changed
if [[ "$HAS_RUST" == "false" && "$HAS_FRONTEND" == "false" ]]; then
  exit 0
fi

# ── Helper: block the hook ───────────────────────────────────────────────────
block() {
  local reason="$1"
  echo '{"decision":"block","reason":"'"$reason"'"}'
  exit 0  # exit 0 so Claude reads the JSON output; decision:block does the blocking
}

# ── Rust checks ──────────────────────────────────────────────────────────────
if [[ "$HAS_RUST" == "true" ]]; then
  # Tauri build context prerequisite
  if [[ ! -f dist/index.html ]]; then
    mkdir -p dist
    echo '<!DOCTYPE html><html><head></head><body></body></html>' > dist/index.html
  fi

  echo "=== cargo fmt ===" >&2
  if ! cargo fmt --all -- --check 2>&1; then
    block "cargo fmt failed — run 'cargo fmt --all' to fix"
  fi

  echo "=== cargo clippy ===" >&2
  if ! cargo clippy --workspace --all-targets --all-features -- -D warnings 2>&1; then
    block "cargo clippy failed — fix warnings above before committing"
  fi

  if [[ "$FULL" == "true" ]]; then
    echo "=== cargo test ===" >&2
    if ! CONNECT_API_URL=http://test.local cargo test --workspace 2>&1; then
      block "cargo test failed — fix failing tests before pushing"
    fi
  fi
fi

# ── Frontend checks ──────────────────────────────────────────────────────────
if [[ "$HAS_FRONTEND" == "true" ]]; then
  echo "=== pnpm build:types ===" >&2
  if ! pnpm run build:types 2>&1; then
    block "pnpm build:types failed"
  fi

  echo "=== pnpm format:check ===" >&2
  if ! pnpm format:check 2>&1; then
    block "pnpm format:check failed — run 'pnpm format' to fix"
  fi

  echo "=== pnpm lint ===" >&2
  if ! pnpm lint 2>&1; then
    block "pnpm lint failed — fix lint errors above before committing"
  fi

  echo "=== pnpm type-check ===" >&2
  if ! pnpm type-check 2>&1; then
    block "pnpm type-check failed — fix type errors above before committing"
  fi

  if [[ "$FULL" == "true" ]]; then
    echo "=== pnpm test ===" >&2
    if ! pnpm test 2>&1; then
      block "pnpm test failed — fix failing tests before pushing"
    fi
  fi
fi
