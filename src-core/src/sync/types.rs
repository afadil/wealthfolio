use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WireMessage {
    Hello {
        message_id: Uuid,
        device_id: Uuid,
        app: String,
        schema: u32,
        capabilities: Vec<String>, // ["lww"]
                                   // Optional: dataset_id if you separate device_id and dataset/workspace id
                                   // dataset_id: String,
    },
    Pull {
        message_id: Uuid,
        since: i64,
        limit: i64,
    },
    AccountsBatch {
        message_id: Uuid,
        rows: Vec<AccountSyncRow>,
        max_version: i64,
        done: bool,
    },
    AssetsBatch {
        message_id: Uuid,
        rows: Vec<AssetSyncRow>,
        max_version: i64,
        done: bool,
    },
    ActivitiesBatch {
        message_id: Uuid,
        rows: Vec<ActivitySyncRow>,
        max_version: i64,
        done: bool,
    },
    ActivityImportProfilesBatch {
        message_id: Uuid,
        rows: Vec<ActivityImportProfileSyncRow>,
        max_version: i64,
        done: bool,
    },
    AppSettingsBatch {
        message_id: Uuid,
        rows: Vec<AppSettingSyncRow>,
        max_version: i64,
        done: bool,
    },
    ContributionLimitsBatch {
        message_id: Uuid,
        rows: Vec<ContributionLimitSyncRow>,
        max_version: i64,
        done: bool,
    },
    GoalsBatch {
        message_id: Uuid,
        rows: Vec<GoalSyncRow>,
        max_version: i64,
        done: bool,
    },
    GoalsAllocationBatch {
        message_id: Uuid,
        rows: Vec<GoalAllocationSyncRow>,
        max_version: i64,
        done: bool,
    },
    Ack {
        message_id: Uuid,
        applied_through: i64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountSyncRow {
    pub id: String,
    pub name: String,
    pub account_type: String,
    pub group: Option<String>,
    pub currency: String,
    pub is_default: bool,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub platform_id: Option<String>,
    pub updated_version: i64,
    pub origin: String,
    pub deleted: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetSyncRow {
    pub id: String,
    pub isin: Option<String>,
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub symbol: String,
    pub symbol_mapping: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub notes: Option<String>,
    pub countries: Option<String>,
    pub categories: Option<String>,
    pub classes: Option<String>,
    pub attributes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub currency: String,
    pub data_source: String,
    pub sectors: Option<String>,
    pub url: Option<String>,

    pub updated_version: i64,
    pub origin: String,
    pub deleted: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivitySyncRow {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub activity_type: String,
    pub activity_date: String,
    pub quantity: String,
    pub unit_price: String,
    pub currency: String,
    pub fee: String,
    pub amount: Option<String>,
    pub is_draft: bool,
    pub comment: Option<String>,
    pub created_at: String,
    pub updated_at: String,

    pub updated_version: i64,
    pub origin: String,
    pub deleted: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityImportProfileSyncRow {
    pub account_id: String,
    pub field_mappings: String,
    pub activity_mappings: String,
    pub symbol_mappings: String,
    pub created_at: String,
    pub updated_at: String,

    pub updated_version: i64,
    pub origin: String,
    pub deleted: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettingSyncRow {
    pub setting_key: String,
    pub setting_value: String,

    pub updated_version: i64,
    pub origin: String,
    pub deleted: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionLimitSyncRow {
    pub id: String,
    pub group_name: String,
    pub contribution_year: i32,
    pub limit_amount: String,
    pub account_ids: Option<String>,
    pub created_at: String,
    pub updated_at: String,

    pub updated_version: i64,
    pub origin: String,
    pub deleted: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalSyncRow {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub target_amount: f64,
    pub is_achieved: Option<bool>,

    pub updated_version: i64,
    pub origin: String,
    pub deleted: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalAllocationSyncRow {
    pub id: String,
    pub percent_allocation: i32,
    pub goal_id: String,
    pub account_id: String,

    pub updated_version: i64,
    pub origin: String,
    pub deleted: i64,
}
