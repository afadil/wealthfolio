use chrono::{DateTime, Utc, NaiveDateTime, NaiveDate};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use rust_decimal::Decimal;

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
    pub quantity: Decimal,
    pub unit_price: Decimal,
    pub currency: String,
    pub fee: Decimal,
    pub amount: Option<Decimal>,
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
    pub quantity: String,
    pub unit_price: String,
    pub currency: String,
    pub fee: String,
    pub amount: Option<String>,
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
    pub quantity: Option<Decimal>,
    pub unit_price: Option<Decimal>,
    pub currency: String,
    pub fee: Option<Decimal>,
    pub amount: Option<Decimal>,
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
    pub quantity: Option<Decimal>,
    pub unit_price: Option<Decimal>,
    pub currency: String,
    pub fee: Option<Decimal>,
    pub amount: Option<Decimal>,
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
#[derive(Queryable, QueryableByName, Serialize, Deserialize, Clone, Debug)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct ActivityDetails {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub id: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub account_id: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub asset_id: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub activity_type: String,
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub date: NaiveDateTime,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub quantity: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub unit_price: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub currency: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub fee: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub amount: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Bool)]
    pub is_draft: bool,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub comment: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub created_at: NaiveDateTime,
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub updated_at: NaiveDateTime,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub account_name: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub account_currency: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub asset_symbol: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub asset_name: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub asset_data_source: String,
}

impl ActivityDetails {
    pub fn get_quantity(&self) -> Decimal {
        Decimal::from_str(&self.quantity).unwrap_or_else(|e| {
            log::error!("Failed to parse quantity '{}': {}", self.quantity, e);
            Decimal::ZERO
        })
    }

    pub fn get_unit_price(&self) -> Decimal {
        Decimal::from_str(&self.unit_price).unwrap_or_else(|e| {
            log::error!("Failed to parse unit_price '{}': {}", self.unit_price, e);
            Decimal::ZERO
        })
    }

    pub fn get_fee(&self) -> Decimal {
        Decimal::from_str(&self.fee).unwrap_or_else(|e| {
            log::error!("Failed to parse fee '{}': {}", self.fee, e);
            Decimal::ZERO
        })
    }

    pub fn get_amount(&self) -> Option<Decimal> {
        self.amount.as_ref().map(|s| Decimal::from_str(s).unwrap_or_else(|e| {
            log::error!("Failed to parse amount '{}': {}", s, e);
            Decimal::ZERO
        }))
    }
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
    pub quantity: Decimal,
    pub unit_price: Decimal,
    pub currency: String,
    pub fee: Decimal,
    pub amount: Option<Decimal>,
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
    AddHolding,
    RemoveHolding,
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
            ActivityType::AddHolding => ACTIVITY_TYPE_ADD_HOLDING,
            ActivityType::RemoveHolding => ACTIVITY_TYPE_REMOVE_HOLDING,
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
            s if s == ACTIVITY_TYPE_ADD_HOLDING => Ok(ActivityType::AddHolding),
            s if s == ACTIVITY_TYPE_REMOVE_HOLDING => Ok(ActivityType::RemoveHolding),
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
            quantity: Decimal::from_str(&db.quantity).unwrap_or_else(|e| {
                log::error!("Failed to parse quantity '{}': {}", db.quantity, e);
                Decimal::ZERO
            }),
            unit_price: Decimal::from_str(&db.unit_price).unwrap_or_else(|e| {
                log::error!("Failed to parse unit_price '{}': {}", db.unit_price, e);
                Decimal::ZERO
            }),
            currency: db.currency,
            fee: Decimal::from_str(&db.fee).unwrap_or_else(|e| {
                log::error!("Failed to parse fee '{}': {}", db.fee, e);
                Decimal::ZERO
            }),
            amount: db.amount.map(|s| Decimal::from_str(&s).unwrap_or_else(|e| {
                log::error!("Failed to parse amount '{}': {}", s, e);
                Decimal::ZERO
            })),
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

        // Handle cash activities and splits
        let activity_type = domain.activity_type.as_str();
        let is_cash_or_split = activity_type == "DEPOSIT" || 
                              activity_type == "WITHDRAWAL" || 
                              activity_type == "FEE" || 
                              activity_type == "INTEREST" ||
                              activity_type == "DIVIDEND" ||
                              activity_type == "SPLIT" ||
                              activity_type == "CONVERSION_IN" ||
                              activity_type == "CONVERSION_OUT" ||
                              activity_type == "TRANSFER_IN" ||
                              activity_type == "TRANSFER_OUT";

        let (quantity, unit_price, amount) = if is_cash_or_split {
            // For cash activities and splits, set quantity and unit_price to 0
            // Use amount if provided, otherwise use quantity
            let amount_str = match &domain.amount {
                Some(amount) => amount.to_string(),
                None => domain.quantity.unwrap_or_else(|| Decimal::ZERO).to_string()
            };
            ("0".to_string(), "0".to_string(), Some(amount_str))
        } else {
            // For other activities, use the provided values
            (
                domain.quantity.unwrap_or_else(|| Decimal::ZERO).to_string(),
                domain.unit_price.unwrap_or_else(|| Decimal::ZERO).to_string(),
                domain.amount.as_ref().map(|a| a.to_string())
            )
        };

        Self {
            id: domain.id.unwrap_or_default(),
            account_id: domain.account_id,
            asset_id: domain.asset_id,
            activity_type: domain.activity_type,
            activity_date,
            quantity,
            unit_price,
            currency: domain.currency,
            fee: domain.fee.unwrap_or_else(|| Decimal::ZERO).to_string(),
            amount,
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

        // Handle cash activities and splits
        let activity_type = domain.activity_type.as_str();
        let is_cash_or_split = activity_type == "DEPOSIT" || 
                              activity_type == "WITHDRAWAL" || 
                              activity_type == "FEE" || 
                              activity_type == "INTEREST" ||
                              activity_type == "DIVIDEND" ||
                              activity_type == "SPLIT" ||
                              activity_type == "CONVERSION_IN" ||
                              activity_type == "CONVERSION_OUT" ||
                              activity_type == "TRANSFER_IN" ||
                              activity_type == "TRANSFER_OUT";

        let (quantity, unit_price, amount) = if is_cash_or_split {
            // For cash activities and splits, set quantity and unit_price to 0
            // Use amount if provided, otherwise use quantity
            let amount_str = match &domain.amount {
                Some(amount) => amount.to_string(),
                None => domain.quantity.unwrap_or_else(|| Decimal::ZERO).to_string()
            };
            ("0".to_string(), "0".to_string(), Some(amount_str))
        } else {
            // For other activities, use the provided values
            (
                domain.quantity.unwrap_or_else(|| Decimal::ZERO).to_string(),
                domain.unit_price.unwrap_or_else(|| Decimal::ZERO).to_string(),
                domain.amount.as_ref().map(|a| a.to_string())
            )
        };

        Self {
            id: domain.id,
            account_id: domain.account_id,
            asset_id: domain.asset_id,
            activity_type: domain.activity_type,
            activity_date,
            quantity,
            unit_price,
            currency: domain.currency,
            fee: domain.fee.unwrap_or_else(|| Decimal::ZERO).to_string(),
            amount,
            is_draft: domain.is_draft,
            comment: domain.comment,
            created_at: now,
            updated_at: now,
        }
    }
}