//! Claude Subscription provider — talks to Claude via the user's locally
//! installed Claude Code (Pro/Max plan) instead of the per-token API.
//!
//! Architecture:
//!
//! ```text
//! ChatService ──► subscription_chat_stream() ──► SidecarProcess
//!                                                       │
//!                                                       ▼
//!                                              node bridge.mjs
//!                                              (NDJSON over stdio)
//!                                                       │
//!                                                       ▼
//!                                              @anthropic-ai/claude-agent-sdk
//!                                                       │
//!                                                       ▼
//!                                              Local Claude Code (authed)
//! ```
//!
//! When the model wants to call a Wealthfolio tool, the sidecar emits a
//! `tool_call` event on stdout. We dispatch it to the existing rig-core
//! `ToolDyn` registry (no duplication) and send the result back via
//! `tool_result` on stdin.

use std::collections::HashMap;
use std::env;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use log::{debug, error, warn};
use once_cell::sync::OnceCell;
use rig::tool::ToolDyn;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{mpsc, Mutex};

use crate::env::AiEnvironment;
use crate::error::AiError;
use crate::tools::ToolSet;
use crate::types::{
    AiStreamEvent, ChatMessage, ChatMessageContent, ChatMessagePart, ChatMessageRole,
    SimpleChatMessage, ToolCall as DomainToolCall, ToolResultData, UsageStats,
};

pub const SUBSCRIPTION_PROVIDER_ID: &str = "claude-subscription";

/// Maximum tokens per conversation as a runaway-loop safety. Configurable
/// later via provider settings; for now a generous default.
const DEFAULT_MAX_TOKENS_PER_QUERY: u64 = 100_000;

// ───────────────────────────────────────────────────────────────────────────
// Sidecar protocol — must match bridge.mjs
// ───────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum SidecarCommand<'a> {
    #[serde(rename = "start_query")]
    StartQuery {
        #[serde(rename = "threadId")]
        thread_id: &'a str,
        prompt: String,
        #[serde(rename = "systemPrompt", skip_serializing_if = "Option::is_none")]
        system_prompt: Option<String>,
        #[serde(rename = "toolDefs")]
        tool_defs: Vec<ToolDefWire>,
        #[serde(rename = "maxTurns", skip_serializing_if = "Option::is_none")]
        max_turns: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        #[serde(rename = "threadId")]
        thread_id: &'a str,
        #[serde(rename = "toolCallId")]
        tool_call_id: &'a str,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "cancel")]
    Cancel {
        #[serde(rename = "threadId")]
        thread_id: &'a str,
    },
}

#[derive(Debug, Serialize, Clone)]
struct ToolDefWire {
    name: String,
    description: String,
    #[serde(rename = "inputSchema")]
    input_schema: Value,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SidecarEvent {
    /// Sent once per query when the SDK reports session init. Currently
    /// unused on the Rust side (the chat service emits its own `system`
    /// event upstream) but accepted so it doesn't trigger an "unknown event"
    /// warning.
    System {},
    TextDelta {
        text: String,
    },
    ReasoningDelta {
        text: String,
    },
    ToolCall {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        name: String,
        args: Value,
    },
    ToolResultAck {},
    RateLimit {
        status: String,
        #[serde(rename = "resetsAt")]
        resets_at: Option<i64>,
    },
    Usage {
        #[serde(rename = "inputTokens")]
        input_tokens: u32,
        #[serde(rename = "outputTokens")]
        output_tokens: u32,
    },
    Error {
        message: String,
    },
    Done {
        ok: bool,
        #[serde(rename = "totalTokens", default)]
        total_tokens: u32,
        #[serde(rename = "totalCostUsd", default)]
        total_cost_usd: f64,
    },
}

// ───────────────────────────────────────────────────────────────────────────
// Sidecar process
// ───────────────────────────────────────────────────────────────────────────

/// Owns a Node sidecar process and a serialized writer to its stdin.
/// The reader half (stdout) is returned separately by `spawn()` so the
/// chat loop can own it without contention with `send`.
pub struct SidecarHandle {
    child: Child,
    stdin: Mutex<ChildStdin>,
}

impl SidecarHandle {
    /// Spawn a new sidecar. Resolves the bridge.mjs path from, in order:
    ///   1. `WEALTHFOLIO_CLAUDE_BRIDGE_PATH` env var
    ///   2. next to the current executable (production / Tauri externalBin)
    ///   3. workspace dev path (debug builds only)
    ///
    /// NOTE(perf): Today this is called per chat message, so each user turn
    /// pays a Node startup (~300–700ms). The bridge already supports
    /// multiplexing queries by `threadId`; the natural follow-up is to hold
    /// a single shared `Arc<SidecarHandle>` in `ChatService` and reuse it
    /// across messages, with cancellation propagated through the existing
    /// `SidecarCommand::Cancel`. Tracked separately.
    pub async fn spawn() -> Result<(Self, ChildStdout), AiError> {
        let bridge = resolve_bridge_path()?;
        let node = resolve_node_command();
        debug!("spawning sidecar: {} {}", node, bridge.display());

        let mut cmd = Command::new(&node);
        cmd.arg(&bridge)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        // Don't leak ANTHROPIC_API_KEY into the sidecar — we want subscription auth.
        cmd.env_remove("ANTHROPIC_API_KEY");

        let mut child = cmd.spawn().map_err(|e| {
            AiError::Internal(format!(
                "failed to spawn claude-agent-bridge sidecar (node={}, bridge={}): {}",
                node,
                bridge.display(),
                e
            ))
        })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            AiError::Internal("sidecar stdin unavailable after spawn".to_string())
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            AiError::Internal("sidecar stdout unavailable after spawn".to_string())
        })?;

        Ok((
            Self {
                child,
                stdin: Mutex::new(stdin),
            },
            stdout,
        ))
    }

    async fn send(&self, cmd: &SidecarCommand<'_>) -> Result<(), AiError> {
        let mut line = serde_json::to_string(cmd)
            .map_err(|e| AiError::Internal(format!("sidecar serialize: {}", e)))?;
        line.push('\n');
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| AiError::Internal(format!("sidecar write: {}", e)))?;
        stdin
            .flush()
            .await
            .map_err(|e| AiError::Internal(format!("sidecar flush: {}", e)))?;
        Ok(())
    }
}

impl Drop for SidecarHandle {
    fn drop(&mut self) {
        // Best-effort kill; the bridge also exits when stdin closes.
        let _ = self.child.start_kill();
    }
}

/// Cached bridge.mjs path. Resolution involves env-var lookups, exe-path
/// queries, and (in dev) a directory walk-up — none of which change at
/// runtime, so cache the first successful result.
static CACHED_BRIDGE_PATH: OnceCell<PathBuf> = OnceCell::new();

fn resolve_bridge_path() -> Result<PathBuf, AiError> {
    if let Some(cached) = CACHED_BRIDGE_PATH.get() {
        return Ok(cached.clone());
    }
    let resolved = resolve_bridge_path_uncached()?;
    let _ = CACHED_BRIDGE_PATH.set(resolved.clone());
    Ok(resolved)
}

fn resolve_bridge_path_uncached() -> Result<PathBuf, AiError> {
    if let Ok(p) = env::var("WEALTHFOLIO_CLAUDE_BRIDGE_PATH") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Ok(path);
        }
        warn!(
            "WEALTHFOLIO_CLAUDE_BRIDGE_PATH set but not a file: {}",
            path.display()
        );
    }

    // Production layout: bridge bundled next to the app executable.
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("claude-agent-bridge").join("bridge.mjs");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    // Dev-only fallback: walk up from cwd looking for the workspace sidecar
    // directory. Excluded from release builds so a misconfigured installer
    // can't silently load dev assets.
    #[cfg(debug_assertions)]
    if let Ok(mut cwd) = env::current_dir() {
        for _ in 0..6 {
            let candidate = cwd.join("apps/tauri/sidecars/claude-agent-bridge/bridge.mjs");
            if candidate.is_file() {
                return Ok(candidate);
            }
            if !cwd.pop() {
                break;
            }
        }
    }

    Err(AiError::Internal(
        "could not locate claude-agent-bridge/bridge.mjs — set WEALTHFOLIO_CLAUDE_BRIDGE_PATH"
            .to_string(),
    ))
}

fn resolve_node_command() -> String {
    env::var("WEALTHFOLIO_NODE_BIN").unwrap_or_else(|_| "node".to_string())
}

// ───────────────────────────────────────────────────────────────────────────
// Tool dispatch helper
// ───────────────────────────────────────────────────────────────────────────

/// Build the wire-format tool definitions plus a name → dispatch map.
///
/// Reuses the same allowlist filter as the rig-core path so any new tool
/// added to `ToolSet::into_allowed_tools` is picked up automatically.
async fn build_tool_dispatch<E: AiEnvironment + 'static>(
    env: Arc<E>,
    base_currency: String,
    allowlist: Option<&[String]>,
) -> (Vec<ToolDefWire>, HashMap<String, Box<dyn ToolDyn>>) {
    let dyn_tools = ToolSet::new(env, base_currency).into_allowed_tools(allowlist);

    let mut defs: Vec<ToolDefWire> = Vec::with_capacity(dyn_tools.len());
    let mut by_name: HashMap<String, Box<dyn ToolDyn>> =
        HashMap::with_capacity(dyn_tools.len());

    for (name, dyn_tool) in dyn_tools {
        let def = dyn_tool.definition(String::new()).await;
        defs.push(ToolDefWire {
            name: def.name.clone(),
            description: def.description,
            input_schema: def.parameters,
        });
        by_name.insert(name.to_string(), dyn_tool);
    }

    (defs, by_name)
}

// ───────────────────────────────────────────────────────────────────────────
// Public entry point
// ───────────────────────────────────────────────────────────────────────────

/// Stream a chat conversation through the Claude Code subscription sidecar.
///
/// This bypasses rig-core entirely. It builds the tool registry, spawns the
/// sidecar, sends `start_query`, and translates sidecar events into
/// `AiStreamEvent`s on the same `tx` channel that the rig-core path uses.
#[allow(clippy::too_many_arguments)]
pub async fn subscription_chat_stream<E: AiEnvironment + 'static>(
    env: Arc<E>,
    tx: mpsc::Sender<AiStreamEvent>,
    user_message: String,
    history: Vec<SimpleChatMessage>,
    preamble: String,
    tools_allowlist: Option<Vec<String>>,
    thread_id: String,
    run_id: String,
    message_id: String,
    model_id: Option<String>,
) -> Result<(), AiError> {
    // Always emit a terminal `Done` event so the frontend stream closes —
    // returning `Err` from this function only emits an `error` event upstream
    // and the chat UI hangs waiting for `Done`.
    async fn fail(
        tx: &mpsc::Sender<AiStreamEvent>,
        thread_id: &str,
        run_id: &str,
        message_id: &str,
        err: AiError,
    ) -> Result<(), AiError> {
        let message = err.to_string();
        error!("subscription chat failed: {}: {}", err.code(), message);
        let _ = tx
            .send(AiStreamEvent::error(
                thread_id,
                run_id,
                Some(message_id),
                err.code(),
                &message,
            ))
            .await;
        let final_message = ChatMessage {
            id: message_id.to_string(),
            role: ChatMessageRole::Assistant,
            content: ChatMessageContent::new(vec![ChatMessagePart::Text {
                content: format!("[error] {}", message),
            }]),
            thread_id: thread_id.to_string(),
            created_at: chrono::Utc::now(),
        };
        let _ = tx
            .send(AiStreamEvent::done(thread_id, run_id, final_message, None))
            .await;
        Ok(())
    }

    let base_currency = env.base_currency();
    let (tool_defs, tool_dispatch) =
        build_tool_dispatch(env.clone(), base_currency, tools_allowlist.as_deref()).await;

    debug!(
        "claude subscription: starting with {} tools",
        tool_defs.len()
    );

    let (sidecar, stdout) = match SidecarHandle::spawn().await {
        Ok(pair) => pair,
        Err(e) => return fail(&tx, &thread_id, &run_id, &message_id, e).await,
    };
    let mut lines = BufReader::new(stdout).lines();

    // The Agent SDK takes a single prompt string, so prior turns are flattened
    // into the prompt instead of being passed as a message array.
    let prompt = render_prompt_with_history(&history, &user_message);

    // Map well-known Wealthfolio model IDs to Claude model identifiers.
    // "claude-code-default" (or None) → let the SDK pick; otherwise pass through.
    let sidecar_model = model_id.filter(|m| m != "claude-code-default" && !m.is_empty());

    if let Err(e) = sidecar
        .send(&SidecarCommand::StartQuery {
            thread_id: &thread_id,
            prompt,
            system_prompt: Some(preamble),
            tool_defs,
            max_turns: Some(25),
            model: sidecar_model,
        })
        .await
    {
        return fail(&tx, &thread_id, &run_id, &message_id, e).await;
    }

    // Drain events.
    let mut accumulated_text = String::new();
    let mut last_usage: Option<UsageStats> = None;
    let mut stream_ok = false;

    loop {
        let line = match lines.next_line().await {
            Ok(Some(l)) => l,
            Ok(None) => {
                warn!("sidecar stdout closed unexpectedly");
                break;
            }
            Err(e) => {
                error!("sidecar read error: {}", e);
                let _ = tx
                    .send(AiStreamEvent::error(
                        &thread_id,
                        &run_id,
                        Some(&message_id),
                        "sidecar_io",
                        &format!("sidecar read error: {}", e),
                    ))
                    .await;
                break;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let event: SidecarEvent = match serde_json::from_str(trimmed) {
            Ok(e) => e,
            Err(e) => {
                warn!("unparsable sidecar line: {} ({})", trimmed, e);
                continue;
            }
        };

        match event {
            // ChatService already emitted the upstream `system` event.
            SidecarEvent::System {} | SidecarEvent::ToolResultAck {} => {}

            SidecarEvent::TextDelta { text } => {
                accumulated_text.push_str(&text);
                let _ = tx
                    .send(AiStreamEvent::text_delta(
                        &thread_id,
                        &run_id,
                        &message_id,
                        &text,
                    ))
                    .await;
            }

            SidecarEvent::ReasoningDelta { text } => {
                let _ = tx
                    .send(AiStreamEvent::reasoning_delta(
                        &thread_id,
                        &run_id,
                        &message_id,
                        &text,
                    ))
                    .await;
            }

            SidecarEvent::ToolCall {
                tool_call_id,
                name,
                args,
            } => {
                let domain_call = DomainToolCall {
                    id: tool_call_id.clone(),
                    name: name.clone(),
                    arguments: args.clone(),
                };
                let _ = tx
                    .send(AiStreamEvent::tool_call(
                        &thread_id,
                        &run_id,
                        &message_id,
                        domain_call,
                    ))
                    .await;

                let (ok, content_value, error_msg) =
                    match dispatch_tool(&tool_dispatch, &name, args.clone()).await {
                        Ok(value) => (true, Some(value), None),
                        Err(err) => (false, None, Some(err.to_string())),
                    };

                let result_data = ToolResultData {
                    tool_call_id: tool_call_id.clone(),
                    success: ok,
                    data: content_value.clone().unwrap_or(Value::Null),
                    meta: HashMap::new(),
                    error: error_msg.clone(),
                };
                let _ = tx
                    .send(AiStreamEvent::tool_result(
                        &thread_id,
                        &run_id,
                        &message_id,
                        result_data,
                    ))
                    .await;

                if let Err(e) = sidecar
                    .send(&SidecarCommand::ToolResult {
                        thread_id: &thread_id,
                        tool_call_id: &tool_call_id,
                        ok,
                        content: content_value,
                        error: error_msg,
                    })
                    .await
                {
                    error!("failed to send tool_result to sidecar: {}", e);
                    break;
                }
            }

            SidecarEvent::RateLimit { status, resets_at } => {
                debug!(
                    "claude subscription rate limit: status={} resetsAt={:?}",
                    status, resets_at
                );
            }

            SidecarEvent::Usage {
                input_tokens,
                output_tokens,
            } => {
                let total = input_tokens + output_tokens;
                last_usage = Some(UsageStats {
                    prompt_tokens: input_tokens,
                    completion_tokens: output_tokens,
                    total_tokens: total,
                });

                if (total as u64) > DEFAULT_MAX_TOKENS_PER_QUERY {
                    warn!(
                        "subscription chat exceeded token cap: {} > {}",
                        total, DEFAULT_MAX_TOKENS_PER_QUERY
                    );
                    let _ = sidecar
                        .send(&SidecarCommand::Cancel {
                            thread_id: &thread_id,
                        })
                        .await;
                    let _ = tx
                        .send(AiStreamEvent::error(
                            &thread_id,
                            &run_id,
                            Some(&message_id),
                            "token_cap_exceeded",
                            &format!(
                                "Conversation exceeded the {}-token safety cap",
                                DEFAULT_MAX_TOKENS_PER_QUERY
                            ),
                        ))
                        .await;
                    break;
                }
            }

            SidecarEvent::Error { message } => {
                let _ = tx
                    .send(AiStreamEvent::error(
                        &thread_id,
                        &run_id,
                        Some(&message_id),
                        AiError::provider(&message).code(),
                        &message,
                    ))
                    .await;
            }

            SidecarEvent::Done {
                ok,
                total_tokens,
                total_cost_usd,
            } => {
                stream_ok = ok;
                debug!(
                    "subscription chat done: ok={}, totalTokens={}, totalCostUsd={}",
                    ok, total_tokens, total_cost_usd
                );
                if let Some(u) = last_usage.as_mut() {
                    if u.total_tokens < total_tokens {
                        u.total_tokens = total_tokens;
                    }
                }
                break;
            }
        }
    }

    // Build the final ChatMessage and emit Done.
    let final_message = ChatMessage {
        id: message_id.clone(),
        role: ChatMessageRole::Assistant,
        content: ChatMessageContent::new(vec![ChatMessagePart::Text {
            content: accumulated_text,
        }]),
        thread_id: thread_id.clone(),
        created_at: chrono::Utc::now(),
    };

    if !stream_ok {
        // We still send Done so the frontend can close the stream.
        debug!("subscription chat finished with stream_ok=false");
    }

    // Persist the assistant message so chat history survives app restarts.
    // This mirrors the rig-core path in chat.rs (line ~1675).
    if let Err(e) = env
        .chat_repository()
        .create_message(final_message.clone())
        .await
    {
        error!("Failed to save subscription assistant message: {}", e);
    }

    let _ = tx
        .send(AiStreamEvent::done(
            &thread_id, &run_id, final_message, last_usage,
        ))
        .await;

    Ok(())
}

async fn dispatch_tool(
    dispatch: &HashMap<String, Box<dyn ToolDyn>>,
    name: &str,
    args: Value,
) -> Result<Value, AiError> {
    let tool = dispatch
        .get(name)
        .ok_or_else(|| AiError::ToolNotAllowed(name.to_string()))?;

    let args_str = serde_json::to_string(&args)
        .map_err(|e| AiError::Internal(format!("serialize tool args: {}", e)))?;

    let raw = tool
        .call(args_str)
        .await
        .map_err(|e| AiError::ToolExecutionFailed(format!("{}: {}", name, e)))?;

    // ToolDyn outputs are JSON strings; deserialize back to structured JSON
    // when possible so the UI can render results richly.
    Ok(serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!(raw)))
}

fn render_prompt_with_history(history: &[SimpleChatMessage], user_message: &str) -> String {
    if history.is_empty() {
        return user_message.to_string();
    }
    let mut out = String::with_capacity(user_message.len() + history.len() * 64);
    out.push_str("# Prior conversation\n\n");
    for msg in history {
        let role = if msg.role.eq_ignore_ascii_case("user") {
            "User"
        } else {
            "Assistant"
        };
        out.push_str(&format!("**{}**: {}\n\n", role, msg.content));
    }
    out.push_str("# Current request\n\n");
    out.push_str(user_message);
    out
}

