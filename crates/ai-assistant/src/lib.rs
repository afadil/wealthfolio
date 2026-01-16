//! Wealthfolio AI Assistant - LLM orchestration using rig-core.
//!
//! This crate provides the AI assistant functionality for Wealthfolio,
//! handling the model ↔ tools ↔ model orchestration loop and streaming
//! `AiStreamEvent` to Tauri/Axum consumers.
//!
//! # Architecture
//!
//! - `service`: Orchestrates the chat loop and emits `AiStreamEvent`
//! - `providers`: Provider adapters that rig-core uses (injectable for testing)
//! - `tools`: Tool registry, schemas, and result shaping
//! - `types`: Shared DTOs/events used by Axum/Tauri + frontend
//! - `env`: Environment abstraction for secrets/config/time

pub mod env;
pub mod providers;
pub mod service;
pub mod tools;
pub mod types;

// Re-export main types for convenience
pub use env::{AiEnvironment, RuntimeEnvironment};
pub use providers::{ProviderAdapter, ProviderRegistry};
pub use service::{AiAssistantService, AiAssistantServiceTrait};
pub use tools::{Tool, ToolRegistry, ToolResult};
pub use types::{AiStreamEvent, ChatMessage, ChatThread, MessageRole, ToolCall};
