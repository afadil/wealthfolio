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
//! - `portfolio_data`: Data provider trait for portfolio tools
//! - `types`: Shared DTOs/events used by Axum/Tauri + frontend
//! - `env`: Environment abstraction for secrets/config/time
//! - `title_generator`: Auto-generates thread titles from user messages

pub mod env;
#[cfg(test)]
pub mod eval;
pub mod portfolio_data;
pub mod providers;
pub mod service;
pub mod title_generator;
pub mod tools;
pub mod types;

// Re-export main types for convenience
pub use env::{AiEnvironment, RuntimeEnvironment};
pub use portfolio_data::{MockPortfolioDataProvider, PortfolioDataProvider};
pub use providers::{ProviderAdapter, ProviderRegistry};
pub use service::{AiAssistantService, AiAssistantServiceTrait};
pub use title_generator::{
    truncate_to_title, FakeTitleGenerator, TitleGenerator, TitleGeneratorConfig,
    TitleGeneratorTrait,
};
pub use tools::{
    create_portfolio_tools_registry, Tool, ToolContext, ToolRegistry, ToolResult,
    DEFAULT_ACTIVITIES_DAYS, DEFAULT_VALUATIONS_DAYS, MAX_ACTIVITIES_ROWS, MAX_VALUATIONS_POINTS,
};
pub use types::{AiStreamEvent, ChatMessage, ChatThread, MessageRole, ToolCall};
