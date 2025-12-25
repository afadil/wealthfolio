//! Wealthfolio Device Sync - Cloud-based device synchronization for Wealthfolio.
//!
//! This crate provides the API client and types for device registration, pairing,
//! and E2EE synchronization via the Wealthfolio Connect cloud service.
//!
//! # Usage
//!
//! ```rust,ignore
//! use wealthfolio_device_sync::{DeviceSyncClient, DeviceInfo};
//!
//! let client = DeviceSyncClient::new("https://api.wealthfolio.app");
//! let device = client.register_device(
//!     "access_token",
//!     None,
//!     DeviceInfo {
//!         name: "My Device".to_string(),
//!         platform: "server".to_string(),
//!         app_version: "2.1.0".to_string(),
//!         os_version: None,
//!     },
//! ).await?;
//! ```

mod client;
mod error;
mod types;

pub use client::DeviceSyncClient;
pub use error::{DeviceSyncError, Result};
pub use types::*;
