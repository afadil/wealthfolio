use chrono::{DateTime, Utc, NaiveDateTime, NaiveDate};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use crate::accounts::Account;

/// Domain model representing an activity in the system
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub activity_type: String,
    #[serde(with = "timestamp_format")]
    pub activity_date: DateTime<Utc>,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub is_draft: bool,
    pub comment: Option<String>,
    #[serde(with = "timestamp_format")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "timestamp_format")]
    pub updated_at: DateTime<Utc>,
}

/// Database model for activities
#[derive(
    Queryable,
    Selectable,
    Identifiable,
    Associations,
    Insertable,
    AsChangeset,
    PartialEq,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::activities)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[diesel(belongs_to(Account))]
#[diesel(treat_none_as_null = true)]
pub struct ActivityDB {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub activity_type: String,
    pub activity_date: NaiveDateTime,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub is_draft: bool,
    pub comment: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Input model for creating a new activity
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewActivity {
    pub id: Option<String>,
    pub account_id: String,
    pub asset_id: String,
    pub activity_type: String,
    pub activity_date: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub is_draft: bool,
    pub comment: Option<String>,
}

impl NewActivity {
    /// Validates the new activity data
    pub fn validate(&self) -> crate::activities::Result<()> {
        if self.account_id.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Account ID cannot be empty".to_string(),
            ));
        }
        if self.asset_id.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Asset ID cannot be empty".to_string(),
            ));
        }
        if self.activity_type.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Activity type cannot be empty".to_string(),
            ));
        }
        
        // Validate date format
        if DateTime::parse_from_rfc3339(&self.activity_date).is_err() 
            && NaiveDate::parse_from_str(&self.activity_date, "%Y-%m-%d").is_err() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Invalid date format. Expected ISO 8601/RFC3339 or YYYY-MM-DD".to_string(),
            ));
        }
        
        Ok(())
    }
}

/// Input model for updating an existing activity
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityUpdate {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub activity_type: String,
    pub activity_date: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub is_draft: bool,
    pub comment: Option<String>,
}

impl ActivityUpdate {
    /// Validates the activity update data
    pub fn validate(&self) -> crate::activities::Result<()> {
        if self.id.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Activity ID is required for updates".to_string(),
            ));
        }
        if self.account_id.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Account ID cannot be empty".to_string(),
            ));
        }
        if self.asset_id.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Asset ID cannot be empty".to_string(),
            ));
        }
        if self.activity_type.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Activity type cannot be empty".to_string(),
            ));
        }
        Ok(())
    }
}

/// Model for activity details including related data
#[derive(Queryable, Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDetails {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub activity_type: String,
    pub date: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub is_draft: bool,
    pub comment: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub account_name: String,
    pub account_currency: String,
    pub asset_symbol: String,
    pub asset_name: Option<String>,
    pub asset_data_source: String,
}

/// Model for activity search response metadata
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySearchResponseMeta {
    pub total_row_count: i64,
}

/// Model for activity search response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySearchResponse {
    pub data: Vec<ActivityDetails>,
    pub meta: ActivitySearchResponseMeta,
}

/// Model for importing activities
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActivityImport {
    pub id: Option<String>,
    pub date: String,
    pub symbol: String,
    pub activity_type: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub currency: String,
    pub fee: f64,
    pub comment: Option<String>,
    pub account_id: Option<String>,
    pub account_name: Option<String>,
    pub symbol_name: Option<String>,
    pub error: Option<String>,
    pub is_draft: bool,
    pub is_valid: bool,
    pub line_number: Option<i32>,
}

/// Model for sorting activities
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sort {
    pub id: String,
    pub desc: bool,
}

/// Model for activity import profile mapping
#[derive(
    Debug, Clone, Serialize, Deserialize, Queryable, Identifiable, AsChangeset, Insertable,
)]
#[diesel(primary_key(account_id))]
#[diesel(table_name = crate::schema::activity_import_profiles)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct ImportMapping {
    pub account_id: String,
    pub field_mappings: String,
    pub activity_mappings: String,
    pub symbol_mappings: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Model for activity import mapping data with structured mappings
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMappingData {
    pub account_id: String,
    pub field_mappings: std::collections::HashMap<String, String>,
    pub activity_mappings: std::collections::HashMap<String, Vec<String>>,
    pub symbol_mappings: std::collections::HashMap<String, String>,
}

impl Default for ImportMappingData {
    fn default() -> Self {
        let mut field_mappings = std::collections::HashMap::new();
        field_mappings.insert("date".to_string(), "date".to_string());
        field_mappings.insert("symbol".to_string(), "symbol".to_string());
        field_mappings.insert("quantity".to_string(), "quantity".to_string());
        field_mappings.insert("activityType".to_string(), "activityType".to_string());
        field_mappings.insert("unitPrice".to_string(), "unitPrice".to_string());
        field_mappings.insert("currency".to_string(), "currency".to_string());
        field_mappings.insert("fee".to_string(), "fee".to_string());

        let mut activity_mappings = std::collections::HashMap::new();
        activity_mappings.insert("BUY".to_string(), vec!["BUY".to_string()]);
        activity_mappings.insert("SELL".to_string(), vec!["SELL".to_string()]);
        activity_mappings.insert("DIVIDEND".to_string(), vec!["DIVIDEND".to_string()]);
        activity_mappings.insert("INTEREST".to_string(), vec!["INTEREST".to_string()]);
        activity_mappings.insert("DEPOSIT".to_string(), vec!["DEPOSIT".to_string()]);
        activity_mappings.insert("WITHDRAWAL".to_string(), vec!["WITHDRAWAL".to_string()]);
        activity_mappings.insert("TRANSFER_IN".to_string(), vec!["TRANSFER_IN".to_string()]);
        activity_mappings.insert("TRANSFER_OUT".to_string(), vec!["TRANSFER_OUT".to_string()]);
        activity_mappings.insert("SPLIT".to_string(), vec!["SPLIT".to_string()]);
        activity_mappings.insert(
            "CONVERSION_IN".to_string(),
            vec!["CONVERSION_IN".to_string()],
        );
        activity_mappings.insert(
            "CONVERSION_OUT".to_string(),
            vec!["CONVERSION_OUT".to_string()],
        );
        activity_mappings.insert("FEE".to_string(), vec!["FEE".to_string()]);
        activity_mappings.insert("TAX".to_string(), vec!["TAX".to_string()]);

        ImportMappingData {
            account_id: String::new(),
            field_mappings,
            activity_mappings,
            symbol_mappings: std::collections::HashMap::new(),
        }
    }
}

impl ImportMapping {
    pub fn to_mapping_data(&self) -> Result<ImportMappingData, serde_json::Error> {
        Ok(ImportMappingData {
            account_id: self.account_id.clone(),
            field_mappings: serde_json::from_str(&self.field_mappings)?,
            activity_mappings: serde_json::from_str(&self.activity_mappings)?,
            symbol_mappings: serde_json::from_str(&self.symbol_mappings)?,
        })
    }

    pub fn from_mapping_data(data: &ImportMappingData) -> Result<Self, serde_json::Error> {
        Ok(Self {
            account_id: data.account_id.clone(),
            field_mappings: serde_json::to_string(&data.field_mappings)?,
            activity_mappings: serde_json::to_string(&data.activity_mappings)?,
            symbol_mappings: serde_json::to_string(&data.symbol_mappings)?,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        })
    }
}

/// Enum representing different types of activities
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ActivityType {
    Buy,
    Sell,
    Dividend,
    Interest,
    Deposit,
    Withdrawal,
    TransferIn,
    TransferOut,
    ConversionIn,
    ConversionOut,
    Fee,
    Tax,
    Split,
}

impl ActivityType {
    pub fn as_str(&self) -> &'static str {
        use crate::activities::activities_constants::*;
        match self {
            ActivityType::Buy => ACTIVITY_TYPE_BUY,
            ActivityType::Sell => ACTIVITY_TYPE_SELL,
            ActivityType::Dividend => ACTIVITY_TYPE_DIVIDEND,
            ActivityType::Interest => ACTIVITY_TYPE_INTEREST,
            ActivityType::Deposit => ACTIVITY_TYPE_DEPOSIT,
            ActivityType::Withdrawal => ACTIVITY_TYPE_WITHDRAWAL,
            ActivityType::TransferIn => ACTIVITY_TYPE_TRANSFER_IN,
            ActivityType::TransferOut => ACTIVITY_TYPE_TRANSFER_OUT,
            ActivityType::ConversionIn => ACTIVITY_TYPE_CONVERSION_IN,
            ActivityType::ConversionOut => ACTIVITY_TYPE_CONVERSION_OUT,
            ActivityType::Fee => ACTIVITY_TYPE_FEE,
            ActivityType::Tax => ACTIVITY_TYPE_TAX,
            ActivityType::Split => ACTIVITY_TYPE_SPLIT,
        }
    }
}

impl FromStr for ActivityType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        use crate::activities::activities_constants::*;
        match s {
            s if s == ACTIVITY_TYPE_BUY => Ok(ActivityType::Buy),
            s if s == ACTIVITY_TYPE_SELL => Ok(ActivityType::Sell),
            s if s == ACTIVITY_TYPE_DIVIDEND => Ok(ActivityType::Dividend),
            s if s == ACTIVITY_TYPE_INTEREST => Ok(ActivityType::Interest),
            s if s == ACTIVITY_TYPE_DEPOSIT => Ok(ActivityType::Deposit),
            s if s == ACTIVITY_TYPE_WITHDRAWAL => Ok(ActivityType::Withdrawal),
            s if s == ACTIVITY_TYPE_TRANSFER_IN => Ok(ActivityType::TransferIn),
            s if s == ACTIVITY_TYPE_TRANSFER_OUT => Ok(ActivityType::TransferOut),
            s if s == ACTIVITY_TYPE_CONVERSION_IN => Ok(ActivityType::ConversionIn),
            s if s == ACTIVITY_TYPE_CONVERSION_OUT => Ok(ActivityType::ConversionOut),
            s if s == ACTIVITY_TYPE_FEE => Ok(ActivityType::Fee),
            s if s == ACTIVITY_TYPE_TAX => Ok(ActivityType::Tax),
            s if s == ACTIVITY_TYPE_SPLIT => Ok(ActivityType::Split),
            _ => Err(format!("Unknown activity type: {}", s)),
        }
    }
}

// Custom serialization for timestamps to ensure consistent ISO 8601 formatting
mod timestamp_format {
    use chrono::{DateTime, Utc, TimeZone, NaiveDate};
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(date: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        // Always serialize in ISO 8601 format with UTC timezone
        serializer.serialize_str(&date.to_rfc3339())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        
        // First try parsing as RFC3339/ISO8601
        if let Ok(dt) = DateTime::parse_from_rfc3339(&s) {
            return Ok(dt.with_timezone(&Utc));
        }
        
        // Then try as date-only format
        if let Ok(date) = NaiveDate::parse_from_str(&s, "%Y-%m-%d") {
            // Use noon UTC for date-only values
            return Ok(Utc.from_utc_datetime(&date.and_hms_opt(12, 0, 0).unwrap_or_default()));
        }
        
        Err(serde::de::Error::custom(format!(
            "Invalid timestamp format: {}. Expected ISO 8601/RFC3339 or YYYY-MM-DD",
            s
        )))
    }
}

// Conversion implementations
impl From<ActivityDB> for Activity {
    fn from(db: ActivityDB) -> Self {
        Self {
            id: db.id,
            account_id: db.account_id,
            asset_id: db.asset_id,
            activity_type: db.activity_type,
            activity_date: DateTime::from_naive_utc_and_offset(db.activity_date, Utc),
            quantity: db.quantity,
            unit_price: db.unit_price,
            currency: db.currency,
            fee: db.fee,
            is_draft: db.is_draft,
            comment: db.comment,
            created_at: DateTime::from_naive_utc_and_offset(db.created_at, Utc),
            updated_at: DateTime::from_naive_utc_and_offset(db.updated_at, Utc),
        }
    }
}

impl From<NewActivity> for ActivityDB {
    fn from(domain: NewActivity) -> Self {
        let now = Utc::now().naive_utc();
        
        // Parse the date and normalize to UTC
        let activity_date = DateTime::parse_from_rfc3339(&domain.activity_date)
            .map(|dt| dt.naive_utc())
            .or_else(|_| {
                // If date-only format, use noon UTC
                NaiveDate::parse_from_str(&domain.activity_date, "%Y-%m-%d")
                    .map(|date| date.and_hms_opt(12, 0, 0).unwrap_or_default())
            })
            .unwrap_or_else(|e| {
                log::error!("Failed to parse activity date '{}': {}", domain.activity_date, e);
                // If parsing fails, use noon UTC today
                now.date().and_hms_opt(12, 0, 0).unwrap_or(now)
            });

        Self {
            id: domain.id.unwrap_or_default(),
            account_id: domain.account_id,
            asset_id: domain.asset_id,
            activity_type: domain.activity_type,
            activity_date,
            quantity: domain.quantity,
            unit_price: domain.unit_price,
            currency: domain.currency,
            fee: domain.fee,
            is_draft: domain.is_draft,
            comment: domain.comment,
            created_at: now,
            updated_at: now,
        }
    }
}

impl From<ActivityUpdate> for ActivityDB {
    fn from(domain: ActivityUpdate) -> Self {
        let now = Utc::now().naive_utc();
        
        // Use the same date parsing logic as NewActivity for consistency
        let activity_date = DateTime::parse_from_rfc3339(&domain.activity_date)
            .map(|dt| dt.naive_utc())
            .or_else(|_| {
                NaiveDate::parse_from_str(&domain.activity_date, "%Y-%m-%d")
                    .map(|date| date.and_hms_opt(12, 0, 0).unwrap_or_default())
            })
            .unwrap_or_else(|e| {
                log::error!("Failed to parse activity date '{}': {}", domain.activity_date, e);
                now.date().and_hms_opt(12, 0, 0).unwrap_or(now)
            });

        Self {
            id: domain.id,
            account_id: domain.account_id,
            asset_id: domain.asset_id,
            activity_type: domain.activity_type,
            activity_date,
            quantity: domain.quantity,
            unit_price: domain.unit_price,
            currency: domain.currency,
            fee: domain.fee,
            is_draft: domain.is_draft,
            comment: domain.comment,
            created_at: now,
            updated_at: now,
        }
    }
} 