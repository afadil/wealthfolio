//! Stream-level guard rails for the agentic loop.
//!
//! Implements rig's `AgentHook` to prevent three failure modes we see
//! with small open-source models (qwen, ministral, etc.):
//!
//! 1. **Tool-call storms** — the model re-emits the same tool call dozens of
//!    times per turn. Detected via a per-`(tool, args)` counter in
//!    [`WealthfolioStreamHook::on_dispatch`]. Repeated calls are short-circuited
//!    with `DispatchAction::skip(reason)` — which rig feeds back to the
//!    model as the tool result, so the model sees the cached data it already
//!    received and a nudge to stop re-calling.
//!
//! 2. **Global runaway** — total tool calls across a turn can still blow up even
//!    with dedup. Hard cap via `DispatchAction::stop` when over
//!    [`MAX_TOTAL_TOOL_CALLS`].
//!
//! 3. **Token-level repetition loops** — the model streams
//!    `"get_performance, get_performance, ..."` indefinitely without ever
//!    emitting a well-formed tool call (qwen thinking mode). Detected in
//!    [`WealthfolioStreamHook::on_text_delta`] by looking for a short suffix
//!    that already appears many times in the trailing buffer, or by the
//!    stream exceeding [`MAX_STREAM_CHARS`].
//!
//! The hook is cheaply cloneable because state is behind
//! an `Arc<Mutex<_>>`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use log::{debug, warn};
use rig::agent::{
    AgentHook, CompletionCallAction, CompletionCallEvent, DispatchAction, DispatchEvent,
    HookContext, ObservationAction, OutcomeAction, OutcomeEvent, RequestPatch, TextDelta,
};
use rig::completion::{Message, PromptError};

/// Maximum distinct identical `(tool_name, args_json)` calls we'll execute.
/// Beyond this count the hook returns a "stop calling this" skip. Two is
/// enough: first call executes, second re-request serves as a tolerance for
/// benign retries, third and beyond get the nudge.
const MAX_DUPLICATE_CALLS: usize = 2;
const ASSET_SELECTION_PAUSE: &str = "Waiting for asset selection";

/// Absolute cap on tool calls across one streamed turn. Calibrated against
/// LibreChat's `recursionLimit` (default 25) — we're slightly tighter because
/// this is a desktop UX, not a server agent.
const MAX_TOTAL_TOOL_CALLS: usize = 20;

/// Maximum streamed text+reasoning characters before we assume runaway
/// generation and terminate. Jan's default `max_tokens` is 2048 (~8000 chars);
/// we allow significantly more so legitimate long answers pass through.
const MAX_STREAM_CHARS: usize = 80_000;

/// Trailing window inspected for repetition at the end of the stream.
const REPETITION_TAIL_WINDOW: usize = 1024;

/// Length of the suffix used as the repetition probe.
const REPETITION_PROBE_LEN: usize = 24;

/// How many times the probe must appear in the tail to count as a loop.
const REPETITION_MIN_REPEATS: usize = 8;

#[derive(Default)]
struct HookState {
    /// Per `(tool_name, args_json)` call counter.
    tool_call_counts: HashMap<String, usize>,
    /// Previously executed tool results, keyed the same way. Populated by
    /// `on_outcome` so that a skip can feed the real data back to the model
    /// instead of a bare error.
    tool_result_cache: HashMap<String, String>,
    /// Total tool calls seen this stream.
    total_tool_calls: usize,
    pause_for_asset_selection: bool,
}

#[derive(Default, Clone)]
pub struct WealthfolioStreamHook {
    state: Arc<Mutex<HookState>>,
    omit_reasoning_history: bool,
}

impl WealthfolioStreamHook {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn for_provider(provider_id: &str) -> Self {
        Self {
            omit_reasoning_history: provider_id == "groq",
            ..Self::default()
        }
    }

    pub fn paused_for_asset_selection(&self) -> bool {
        self.state
            .lock()
            .map(|state| state.pause_for_asset_selection)
            .unwrap_or(false)
    }

    pub fn is_asset_selection_pause(&self, error: &PromptError) -> bool {
        self.paused_for_asset_selection()
            && matches!(error, PromptError::Cancelled { reason, .. } if reason == ASSET_SELECTION_PAUSE)
    }

    fn key(tool_name: &str, args: &str) -> String {
        format!("{}::{}", tool_name, canonical_args(args))
    }
}

/// The arguments with object keys sorted at every level, so a call matches
/// its repeats however the model ordered the keys. serde_json keeps insertion
/// order in this build, because rig enables its `preserve_order` feature.
fn canonical_args(args: &str) -> String {
    fn sorted(value: serde_json::Value) -> serde_json::Value {
        match value {
            serde_json::Value::Object(map) => {
                let mut entries: Vec<_> = map.into_iter().collect();
                entries.sort_by(|(a, _), (b, _)| a.cmp(b));
                serde_json::Value::Object(
                    entries.into_iter().map(|(k, v)| (k, sorted(v))).collect(),
                )
            }
            serde_json::Value::Array(items) => {
                serde_json::Value::Array(items.into_iter().map(sorted).collect())
            }
            other => other,
        }
    }
    serde_json::from_str(args)
        .map(|value| sorted(value).to_string())
        .unwrap_or_else(|_| args.to_string())
}

impl AgentHook for WealthfolioStreamHook {
    async fn on_completion_call(
        &self,
        _ctx: &HookContext,
        event: CompletionCallEvent<'_>,
    ) -> CompletionCallAction {
        if self.paused_for_asset_selection() {
            CompletionCallAction::Stop(ASSET_SELECTION_PAUSE.into())
        } else if self.omit_reasoning_history {
            // Groq rejects reasoning_content on assistant input messages. Keep
            // streamed reasoning in the UI, but omit it from provider requests.
            let mut history = event.history.to_vec();
            for message in &mut history {
                if let Message::Assistant(assistant) = message {
                    assistant.content.retain(|part| {
                        !matches!(part, rig::message::AssistantContent::Reasoning(_))
                    });
                }
            }
            history.retain(
                |message| !matches!(message, Message::Assistant(assistant) if assistant.content.is_empty()),
            );
            CompletionCallAction::Patch(RequestPatch {
                history: Some(history),
                ..Default::default()
            })
        } else {
            CompletionCallAction::Continue
        }
    }

    fn on_dispatch(
        &self,
        _ctx: &HookContext,
        event: DispatchEvent<'_>,
    ) -> impl std::future::Future<Output = DispatchAction> + Send {
        let call = event
            .tool_name()
            .zip(event.tool_args())
            .map(|(tool_name, args)| (tool_name.to_string(), args.to_string()));
        let state = self.state.clone();
        async move {
            // Completions and other effects pass through.
            let Some((tool_name, args)) = call else {
                return DispatchAction::Proceed;
            };
            let key = Self::key(&tool_name, &args);
            let Ok(mut state) = state.lock() else {
                return DispatchAction::Proceed;
            };

            state.total_tool_calls += 1;
            if state.total_tool_calls > MAX_TOTAL_TOOL_CALLS {
                warn!(
                    "Tool-call cap tripped: {} total calls this turn — terminating",
                    state.total_tool_calls
                );
                return DispatchAction::stop(
                    "The model exceeded the tool-call limit for a single turn. \
                     Ending the run; ask the user to rephrase or switch to a more capable model.",
                );
            }

            let count = state.tool_call_counts.entry(key.clone()).or_insert(0);
            *count += 1;
            let hits = *count;

            if hits > MAX_DUPLICATE_CALLS {
                warn!(
                    "Duplicate tool-call guard tripped: {}({}) called {} times",
                    tool_name, args, hits
                );
                let reason = match state.tool_result_cache.get(&key) {
                    Some(cached) => format!(
                        "You have already called `{tool_name}` with these arguments {hits} times \
                         and received this result:\n\n{cached}\n\n\
                         Stop calling this tool. Write the final answer to the user using the data above.",
                    ),
                    None => format!(
                        "You have already called `{tool_name}` with these arguments {hits} times. \
                         Stop calling this tool. Write the final answer to the user using the data \
                         you already have in the conversation."
                    ),
                };
                return DispatchAction::skip(reason);
            }

            debug!(
                "Tool call allowed: {}({}) [hit {}/{}]",
                tool_name, args, hits, MAX_DUPLICATE_CALLS
            );
            DispatchAction::Proceed
        }
    }

    fn on_outcome(
        &self,
        _ctx: &HookContext,
        event: OutcomeEvent<'_>,
    ) -> impl std::future::Future<Output = OutcomeAction> + Send {
        let state = self.state.clone();
        let tool_name = event.tool_name().unwrap_or_default();
        let key = Self::key(tool_name, event.tool_args().unwrap_or_default());
        // A skipped call has no result to cache.
        let result = event
            .tool_result()
            .filter(|result| !result.is_skipped())
            .map(|result| result.output().render());
        let pause = tool_name == "prepare_asset_classification"
            && result
                .as_deref()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(text).ok())
                .is_some_and(|data| {
                    data.get("draftStatus").and_then(serde_json::Value::as_str)
                        == Some("needsAssetSelection")
                });
        async move {
            if let Some(result) = result {
                if let Ok(mut state) = state.lock() {
                    state.tool_result_cache.insert(key, result);
                    state.pause_for_asset_selection |= pause;
                }
            }
            OutcomeAction::Proceed
        }
    }

    fn on_text_delta(
        &self,
        _ctx: &HookContext,
        event: TextDelta<'_>,
    ) -> impl std::future::Future<Output = ObservationAction> + Send {
        let aggregated_text = event.aggregated;
        let is_repetitive = is_repetitive(aggregated_text);
        let total = aggregated_text.chars().count();
        async move {
            if total > MAX_STREAM_CHARS {
                warn!(
                    "Stream length cap tripped ({} > {} chars) — terminating",
                    total, MAX_STREAM_CHARS
                );
                return ObservationAction::stop(
                    "The model produced more text than allowed for a single turn. \
                     Ending the run; it was likely stuck.",
                );
            }
            if is_repetitive {
                warn!("Repetition guard tripped on streamed text — terminating");
                return ObservationAction::stop(
                    "The model got stuck repeating itself. \
                     Ending the run; try rephrasing the question or switching to a more capable model.",
                );
            }
            ObservationAction::Continue
        }
    }
}

/// Detects repetition at the tail of the aggregated text: look at the last
/// `REPETITION_PROBE_LEN` chars and count how many times that suffix appears
/// in the last `REPETITION_TAIL_WINDOW` chars of the stream. We only check
/// once the tail is long enough to be meaningful, and skip if the probe is
/// all whitespace (legitimate trailing newlines shouldn't trip the guard).
fn is_repetitive(aggregated_text: &str) -> bool {
    let total_bytes = aggregated_text.len();
    if total_bytes < REPETITION_PROBE_LEN * REPETITION_MIN_REPEATS {
        return false;
    }

    // Slice the trailing window on char boundaries.
    let tail_byte_start = aggregated_text
        .char_indices()
        .rev()
        .take(REPETITION_TAIL_WINDOW)
        .last()
        .map(|(i, _)| i)
        .unwrap_or(0);
    let tail = &aggregated_text[tail_byte_start..];

    if tail.len() < REPETITION_PROBE_LEN * REPETITION_MIN_REPEATS {
        return false;
    }

    // Probe = last REPETITION_PROBE_LEN chars of the tail.
    let probe_byte_start = tail
        .char_indices()
        .rev()
        .take(REPETITION_PROBE_LEN)
        .last()
        .map(|(i, _)| i)
        .unwrap_or(0);
    let probe = &tail[probe_byte_start..];
    if probe.trim().is_empty() {
        return false;
    }

    tail.matches(probe).count() >= REPETITION_MIN_REPEATS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_calls_match_whatever_the_key_order() {
        assert_eq!(
            WealthfolioStreamHook::key("t", r#"{"a":1,"b":{"d":2,"c":[{"f":3,"e":4}]}}"#),
            WealthfolioStreamHook::key("t", r#"{"b":{"c":[{"e":4,"f":3}],"d":2},"a":1}"#),
        );
        assert_ne!(
            WealthfolioStreamHook::key("t", r#"{"a":1}"#),
            WealthfolioStreamHook::key("t", r#"{"a":2}"#),
        );
    }

    #[test]
    fn non_repetitive_text_passes() {
        let text = "This is a normal response about your portfolio. \
                    It includes several different sentences with distinct content. \
                    Market values, cost basis, and performance metrics are discussed.";
        assert!(!is_repetitive(text));
    }

    #[test]
    fn short_text_passes() {
        assert!(!is_repetitive("short"));
    }

    #[test]
    fn detects_qwen_style_tool_repetition() {
        let mut buf = String::from("Let me check the tools available: ");
        for _ in 0..30 {
            buf.push_str("get_performance, ");
        }
        assert!(is_repetitive(&buf));
    }

    #[test]
    fn detects_word_level_repetition() {
        let mut buf = String::from("The user asked about performance. ");
        for _ in 0..50 {
            buf.push_str("the same answer ");
        }
        assert!(is_repetitive(&buf));
    }

    #[test]
    fn long_diverse_text_passes() {
        let mut buf = String::new();
        for i in 0..200 {
            buf.push_str(&format!("Sentence number {} with unique content. ", i));
        }
        assert!(!is_repetitive(&buf));
    }
}
