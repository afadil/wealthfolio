//! AI Chat persistence module.
//!
//! Provides SQLite storage for chat threads and messages with structured
//! content parts representing the full agent loop.

pub mod model;
pub mod repository;

pub use model::*;
pub use repository::AiChatRepository;
