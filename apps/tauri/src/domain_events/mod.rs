//! Tauri domain event sink runtime bridge.
//!
//! This module provides the Tauri implementation of the domain event sink,
//! translating domain events into platform-specific actions:
//! - Portfolio recalculation (market sync + snapshots + valuations)
//! - Asset enrichment for newly created assets
//! - Broker sync for eligible tracking mode changes
//!
//! Events are debounced with a 1-second window and processed directly
//! by the queue worker (not via Tauri event emission) to ensure proper
//! tracking of in-progress work.

mod planner;
mod queue_worker;
mod sink;

pub use sink::TauriDomainEventSink;
