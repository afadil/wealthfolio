//! Behavioral evaluation harness for AI assistant.
//!
//! This module provides a minimal eval/regression harness that:
//! - Defines golden scenarios for common portfolio workflows
//! - Uses deterministic LLM stubs (no network calls)
//! - Runs real tools against mock data
//! - Asserts stream event ordering and guardrail compliance
//!
//! # Running evals
//!
//! ```bash
//! cargo test -p wealthfolio-ai eval:: -- --nocapture
//! ```

mod harness;
mod scenarios;

pub use harness::*;
pub use scenarios::*;
