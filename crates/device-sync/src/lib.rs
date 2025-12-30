//! Wealthfolio Device Sync - Cloud-based device synchronization for Wealthfolio.
//!
//! This crate provides the API client and types for device enrollment, pairing,
//! and E2EE synchronization via the Wealthfolio Connect cloud service.
//!
//! # Usage
//!
//! ```rust,ignore
//! use wealthfolio_device_sync::{DeviceSyncClient, RegisterDeviceRequest, EnrollDeviceResponse};
//!
//! let client = DeviceSyncClient::new("https://api.wealthfolio.app");
//! let result = client.enroll_device(
//!     "access_token",
//!     RegisterDeviceRequest {
//!         instance_id: "uuid".to_string(),
//!         display_name: "My Device".to_string(),
//!         platform: "mac".to_string(),
//!         os_version: Some("15.2".to_string()),
//!         app_version: Some("3.0.0".to_string()),
//!     },
//! ).await?;
//!
//! // Handle the enrollment result
//! match result {
//!     EnrollDeviceResponse::Bootstrap { device_id, .. } => {
//!         // First device - initialize team keys
//!     }
//!     EnrollDeviceResponse::Pair { device_id, trusted_devices, .. } => {
//!         // Device needs to pair with an existing trusted device
//!     }
//!     EnrollDeviceResponse::Ready { device_id, .. } => {
//!         // Device is already trusted
//!     }
//! }
//! ```

mod client;
mod error;
mod types;

pub use client::DeviceSyncClient;
pub use error::{DeviceSyncError, Result};
pub use types::*;
