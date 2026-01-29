//! Account domain models.

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{errors::ValidationError, Error, Result};

/// Tracking mode for an account - determines how holdings are tracked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TrackingMode {
    /// Holdings are calculated from transaction history
    Transactions,
    /// Holdings are manually entered or imported directly
    Holdings,
    /// Tracking mode has not been set yet
    #[default]
    NotSet,
}

/// Gets the tracking mode from an account's meta JSON field.
///
/// Returns `TrackingMode::NotSet` if:
/// - meta is None
/// - meta is empty or invalid JSON
/// - trackingMode field is missing or invalid
pub fn get_tracking_mode(account: &Account) -> TrackingMode {
    account
        .meta
        .as_ref()
        .and_then(|meta_str| {
            if meta_str.is_empty() {
                return None;
            }
            serde_json::from_str::<Value>(meta_str).ok()
        })
        .and_then(|json| {
            json.get("wealthfolio")
                .and_then(|w| w.get("trackingMode"))
                .cloned()
        })
        .and_then(|mode_value| serde_json::from_value::<TrackingMode>(mode_value).ok())
        .unwrap_or(TrackingMode::NotSet)
}

/// Sets the tracking mode in an account's meta JSON, preserving other fields.
///
/// Returns a JSON string with the trackingMode field set.
/// If meta is None, empty, or invalid JSON, creates a new JSON object.
pub fn set_tracking_mode(meta: Option<String>, mode: TrackingMode) -> String {
    let mut json_obj = meta
        .as_ref()
        .filter(|s| !s.is_empty())
        .and_then(|meta_str| serde_json::from_str::<Value>(meta_str).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    // Serialize the mode enum to its string representation
    let mode_value = serde_json::to_value(mode).unwrap_or(Value::String("NOT_SET".to_string()));

    // Ensure wealthfolio object exists and set trackingMode inside it
    let wealthfolio_obj = json_obj
        .entry("wealthfolio".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));

    if let Value::Object(ref mut wf_map) = wealthfolio_obj {
        wf_map.insert("trackingMode".to_string(), mode_value);
    }

    serde_json::to_string(&json_obj)
        .unwrap_or_else(|_| r#"{"wealthfolio":{"trackingMode":"NOT_SET"}}"#.to_string())
}

/// Domain model representing an account in the system.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub account_type: String,
    pub group: Option<String>,
    pub currency: String,
    pub is_default: bool,
    pub is_active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub platform_id: Option<String>,
    /// Account number from the broker
    pub account_number: Option<String>,
    /// Additional metadata as JSON string
    pub meta: Option<String>,
    /// Provider name (e.g., 'SNAPTRADE', 'PLAID', 'MANUAL')
    pub provider: Option<String>,
    /// Account ID in the provider's system
    pub provider_account_id: Option<String>,
}

/// Input model for creating a new account.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAccount {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub account_type: String,
    pub group: Option<String>,
    pub currency: String,
    pub is_default: bool,
    pub is_active: bool,
    pub platform_id: Option<String>,
    pub account_number: Option<String>,
    pub meta: Option<String>,
    pub provider: Option<String>,
    pub provider_account_id: Option<String>,
}

impl NewAccount {
    /// Validates the new account data.
    pub fn validate(&self) -> Result<()> {
        if self.name.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Account name cannot be empty".to_string(),
            )));
        }
        if self.currency.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Currency cannot be empty".to_string(),
            )));
        }
        Ok(())
    }
}

/// Input model for updating an existing account.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountUpdate {
    pub id: Option<String>,
    pub name: String,
    pub account_type: String,
    pub group: Option<String>,
    pub is_default: bool,
    pub is_active: bool,
    pub platform_id: Option<String>,
    pub account_number: Option<String>,
    pub meta: Option<String>,
    pub provider: Option<String>,
    pub provider_account_id: Option<String>,
}

impl AccountUpdate {
    /// Validates the account update data.
    pub fn validate(&self) -> Result<()> {
        if self.id.is_none() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Account ID is required for updates".to_string(),
            )));
        }
        if self.name.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Account name cannot be empty".to_string(),
            )));
        }
        Ok(())
    }
}
