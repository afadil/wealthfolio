use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use wealthfolio_core::accounts as core_accounts;

#[derive(Serialize, Deserialize, ToSchema, Debug, Clone)]
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
    pub account_number: Option<String>,
    pub meta: Option<String>,
    pub provider: Option<String>,
    pub provider_account_id: Option<String>,
}

impl From<core_accounts::Account> for Account {
    fn from(a: core_accounts::Account) -> Self {
        Self {
            id: a.id,
            name: a.name,
            account_type: a.account_type,
            group: a.group,
            currency: a.currency,
            is_default: a.is_default,
            is_active: a.is_active,
            created_at: a.created_at,
            updated_at: a.updated_at,
            platform_id: a.platform_id,
            account_number: a.account_number,
            meta: a.meta,
            provider: a.provider,
            provider_account_id: a.provider_account_id,
        }
    }
}

#[derive(Serialize, Deserialize, ToSchema, Debug, Clone)]
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

impl From<NewAccount> for core_accounts::NewAccount {
    fn from(a: NewAccount) -> Self {
        Self {
            id: a.id,
            name: a.name,
            account_type: a.account_type,
            group: a.group,
            currency: a.currency,
            is_default: a.is_default,
            is_active: a.is_active,
            platform_id: a.platform_id,
            account_number: a.account_number,
            meta: a.meta,
            provider: a.provider,
            provider_account_id: a.provider_account_id,
        }
    }
}

#[derive(Serialize, Deserialize, ToSchema, Debug, Clone)]
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

impl From<AccountUpdate> for core_accounts::AccountUpdate {
    fn from(a: AccountUpdate) -> Self {
        Self {
            id: a.id,
            name: a.name,
            account_type: a.account_type,
            group: a.group,
            is_default: a.is_default,
            is_active: a.is_active,
            platform_id: a.platform_id,
            account_number: a.account_number,
            meta: a.meta,
            provider: a.provider,
            provider_account_id: a.provider_account_id,
        }
    }
}
