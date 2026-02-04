use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::{errors::ValidationError, schema::portfolios, Error, Result};

/// Domain model representing a portfolio (grouping of accounts)
#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
)]
#[diesel(table_name = portfolios)]
#[serde(rename_all = "camelCase")]
pub struct Portfolio {
    pub id: String,
    pub name: String,
    pub account_ids: String, // JSON array
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Input model for creating a new portfolio
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPortfolio {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub account_ids: Vec<String>, // Accepts array, will be JSON-encoded
}

/// Input model for updating an existing portfolio
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePortfolio {
    pub id: String,
    pub name: Option<String>,
    pub account_ids: Option<Vec<String>>,
}

impl NewPortfolio {
    /// Validates the new portfolio data
    pub fn validate(&self) -> Result<()> {
        if self.name.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Portfolio name cannot be empty".to_string(),
            )));
        }

        if self.account_ids.len() < 2 {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Portfolio must contain at least 2 accounts".to_string(),
            )));
        }

        // Check for duplicate account IDs
        let unique_ids: std::collections::HashSet<_> = self.account_ids.iter().collect();
        if unique_ids.len() != self.account_ids.len() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Portfolio cannot contain duplicate accounts".to_string(),
            )));
        }

        Ok(())
    }

    /// Converts account IDs array to JSON string for database storage
    pub fn account_ids_json(&self) -> Result<String> {
        serde_json::to_string(&self.account_ids).map_err(|e| {
            Error::Validation(ValidationError::InvalidInput(format!(
                "Invalid account IDs: {}",
                e
            )))
        })
    }
}

impl UpdatePortfolio {
    /// Validates the update portfolio data
    pub fn validate(&self) -> Result<()> {
        if let Some(ref name) = self.name {
            if name.trim().is_empty() {
                return Err(Error::Validation(ValidationError::InvalidInput(
                    "Portfolio name cannot be empty".to_string(),
                )));
            }
        }

        if let Some(ref account_ids) = self.account_ids {
            if account_ids.len() < 2 {
                return Err(Error::Validation(ValidationError::InvalidInput(
                    "Portfolio must contain at least 2 accounts".to_string(),
                )));
            }

            // Check for duplicate account IDs
            let unique_ids: std::collections::HashSet<_> = account_ids.iter().collect();
            if unique_ids.len() != account_ids.len() {
                return Err(Error::Validation(ValidationError::InvalidInput(
                    "Portfolio cannot contain duplicate accounts".to_string(),
                )));
            }
        }

        Ok(())
    }

    /// Converts account IDs array to JSON string for database storage if present
    pub fn account_ids_json(&self) -> Result<Option<String>> {
        if let Some(ref ids) = self.account_ids {
            Ok(Some(serde_json::to_string(ids).map_err(|e| {
                Error::Validation(ValidationError::InvalidInput(format!(
                    "Invalid account IDs: {}",
                    e
                )))
            })?))
        } else {
            Ok(None)
        }
    }
}

impl Portfolio {
    /// Parses the JSON account_ids string into a Vec
    pub fn get_account_ids(&self) -> Result<Vec<String>> {
        serde_json::from_str(&self.account_ids).map_err(|e| {
            Error::Validation(ValidationError::InvalidInput(format!(
                "Invalid account IDs JSON: {}",
                e
            )))
        })
    }
}
