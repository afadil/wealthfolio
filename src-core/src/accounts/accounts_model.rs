use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::{errors::ValidationError, Error, Result};

/// Domain model representing an account in the system
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
}

/// Input model for creating a new account
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
}

impl NewAccount {
    /// Validates the new account data
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

/// Input model for updating an existing account
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
}

impl AccountUpdate {
    /// Validates the account update data
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

/// Database model for accounts
#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::accounts)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct AccountDB {
    #[diesel(column_name = id)]
    pub id: String,
    pub name: String,
    pub account_type: String,
    pub group: Option<String>,
    pub currency: String,
    pub is_default: bool,
    pub is_active: bool,
    #[diesel(skip_insertion)]
    pub created_at: NaiveDateTime,
    #[diesel(skip_insertion)]
    pub updated_at: NaiveDateTime,
    pub platform_id: Option<String>,
}

// Conversion implementations
impl From<AccountDB> for Account {
    fn from(db: AccountDB) -> Self {
        Self {
            id: db.id,
            name: db.name,
            account_type: db.account_type,
            group: db.group,
            currency: db.currency,
            is_default: db.is_default,
            is_active: db.is_active,
            created_at: db.created_at,
            updated_at: db.updated_at,
            platform_id: db.platform_id,
        }
    }
}

impl From<NewAccount> for AccountDB {
    fn from(domain: NewAccount) -> Self {
        let now = chrono::Utc::now().naive_utc();
        Self {
            id: domain.id.unwrap_or_default(),
            name: domain.name,
            account_type: domain.account_type,
            group: domain.group,
            currency: domain.currency,
            is_default: domain.is_default,
            is_active: domain.is_active,
            created_at: now,
            updated_at: now,
            platform_id: domain.platform_id,
        }
    }
}

impl From<AccountUpdate> for AccountDB {
    fn from(domain: AccountUpdate) -> Self {
        Self {
            id: domain.id.unwrap_or_default(),
            name: domain.name,
            account_type: domain.account_type,
            group: domain.group,
            currency: String::new(), // This will be filled from existing record
            is_default: domain.is_default,
            is_active: domain.is_active,
            created_at: NaiveDateTime::default(), // This will be filled from existing record
            updated_at: chrono::Utc::now().naive_utc(),
            platform_id: domain.platform_id,
        }
    }
}
