//! Domain events module.
//!
//! Provides domain event types and the sink trait for emitting events
//! after successful domain mutations. Runtime adapters (Tauri/Web) implement
//! the sink to translate domain events into platform-specific actions.

mod domain_event;
mod sink;

pub use domain_event::*;
pub use sink::*;
