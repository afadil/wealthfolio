use crate::activities::activities_errors::ActivityError;
use crate::Result;
use chrono::{DateTime, NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

/// Helper function to parse a string into a Decimal,
/// with a fallback for scientific notation by parsing as f64 first.
fn parse_decimal_string_tolerant(value_str: &str, field_name: &str) -> Decimal {
    // Attempt to parse directly as Decimal
    match Decimal::from_str(value_str) {
        Ok(d) => d,
        Err(e_decimal) => {
            // If direct parsing fails, try parsing as f64 (to handle scientific notation)
            // and then convert to Decimal
            match f64::from_str(value_str) {
                Ok(f_val) => match Decimal::from_f64(f_val) {
                    Some(dec_val) => dec_val,
                    None => {
                        log::error!(
                            "Failed to convert {} '{}' (parsed as f64: {}) to Decimal.",
                            field_name,
                            value_str,
                            f_val
                        );
                        Decimal::ZERO
                    }
                },
                Err(e_f64) => {
                    // If both attempts fail, log the original decimal error and the f64 error.
                    log::error!(
                        "Failed to parse {} '{}': as Decimal (err: {}), and as f64 (err: {}). Falling back to ZERO.",
                        field_name, value_str, e_decimal, e_f64
                    );
                    Decimal::ZERO
                }
            }
        }
    }
}

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
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
    Default,
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
    pub fn validate(&self) -> std::result::Result<(), ActivityError> {
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
            && NaiveDate::parse_from_str(&self.activity_date, "%Y-%m-%d").is_err()
        {
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
    pub fn validate(&self) -> Result<()> {
        if self.id.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Activity ID is required for updates".to_string(),
            )
            .into());
        }
        if self.account_id.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Account ID cannot be empty".to_string(),
            )
            .into());
        }
        if self.asset_id.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Asset ID cannot be empty".to_string(),
            )
            .into());
        }
        if self.activity_type.trim().is_empty() {
            return Err(crate::activities::ActivityError::InvalidData(
                "Activity type cannot be empty".to_string(),
            )
            .into());
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
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub date: String,
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
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub created_at: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub updated_at: String,
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
        parse_decimal_string_tolerant(&self.quantity, "quantity")
    }

    pub fn get_unit_price(&self) -> Decimal {
        parse_decimal_string_tolerant(&self.unit_price, "unit_price")
    }

    pub fn get_fee(&self) -> Decimal {
        parse_decimal_string_tolerant(&self.fee, "fee")
    }

    pub fn get_amount(&self) -> Option<Decimal> {
        self.amount
            .as_ref()
            .map(|s| parse_decimal_string_tolerant(s, "amount"))
    }

    // Helper to parse the date string
    pub fn get_date(&self) -> std::result::Result<DateTime<Utc>, chrono::ParseError> {
        DateTime::parse_from_rfc3339(&self.date).map(|dt| dt.with_timezone(&Utc))
    }

    // Helper to parse the created_at string
    pub fn get_created_at(&self) -> std::result::Result<DateTime<Utc>, chrono::ParseError> {
        DateTime::parse_from_rfc3339(&self.created_at).map(|dt| dt.with_timezone(&Utc))
    }

    // Helper to parse the updated_at string
    pub fn get_updated_at(&self) -> std::result::Result<DateTime<Utc>, chrono::ParseError> {
        DateTime::parse_from_rfc3339(&self.updated_at).map(|dt| dt.with_timezone(&Utc))
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
    pub errors: Option<std::collections::HashMap<String, Vec<String>>>,
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
    pub account_mappings: String,
}

/// Model for activity import mapping data with structured mappings
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMappingData {
    pub account_id: String,
    pub field_mappings: std::collections::HashMap<String, String>,
    pub activity_mappings: std::collections::HashMap<String, Vec<String>>,
    pub symbol_mappings: std::collections::HashMap<String, String>,
    pub account_mappings: std::collections::HashMap<String, String>,
}

impl Default for ImportMappingData {
    fn default() -> Self {
        let mut field_mappings = std::collections::HashMap::new();
        field_mappings.insert("date".to_string(), "date".to_string());
        field_mappings.insert("symbol".to_string(), "symbol".to_string());
        field_mappings.insert("quantity".to_string(), "quantity".to_string());
        field_mappings.insert("activityType".to_string(), "activityType".to_string());
        field_mappings.insert("unitPrice".to_string(), "unitPrice".to_string());
        field_mappings.insert("amount".to_string(), "amount".to_string());
        field_mappings.insert("comment".to_string(), "comment".to_string());
        field_mappings.insert("currency".to_string(), "currency".to_string());
        field_mappings.insert("fee".to_string(), "fee".to_string());
        field_mappings.insert("account".to_string(), "account".to_string());

        let mut activity_mappings = std::collections::HashMap::new();
        activity_mappings.insert("BUY".to_string(), vec!["BUY".to_string()]);
        activity_mappings.insert("SELL".to_string(), vec!["SELL".to_string()]);
        activity_mappings.insert("DIVIDEND".to_string(), vec!["DIVIDEND".to_string()]);
        activity_mappings.insert("INTEREST".to_string(), vec!["INTEREST".to_string()]);
        activity_mappings.insert("DEPOSIT".to_string(), vec!["DEPOSIT".to_string()]);
        activity_mappings.insert("WITHDRAWAL".to_string(), vec!["WITHDRAWAL".to_string()]);
        activity_mappings.insert("TRANSFER_IN".to_string(), vec!["TRANSFER_IN".to_string()]);
        activity_mappings.insert("TRANSFER_OUT".to_string(), vec!["TRANSFER_OUT".to_string()]);
        activity_mappings.insert("ADD_HOLDING".to_string(), vec!["ADD_HOLDING".to_string()]);
        activity_mappings.insert(
            "REMOVE_HOLDING".to_string(),
            vec!["REMOVE_HOLDING".to_string()],
        );
        activity_mappings.insert("SPLIT".to_string(), vec!["SPLIT".to_string()]);
        activity_mappings.insert("FEE".to_string(), vec!["FEE".to_string()]);
        activity_mappings.insert("TAX".to_string(), vec!["TAX".to_string()]);

        ImportMappingData {
            account_id: String::new(),
            field_mappings,
            activity_mappings,
            symbol_mappings: std::collections::HashMap::new(),
            account_mappings: std::collections::HashMap::new(),
        }
    }
}

impl ImportMapping {
    pub fn to_mapping_data(&self) -> std::result::Result<ImportMappingData, serde_json::Error> {
        Ok(ImportMappingData {
            account_id: self.account_id.clone(),
            field_mappings: serde_json::from_str(&self.field_mappings)?,
            activity_mappings: serde_json::from_str(&self.activity_mappings)?,
            symbol_mappings: serde_json::from_str(&self.symbol_mappings)?,
            account_mappings: serde_json::from_str(&self.account_mappings)?,
        })
    }

    pub fn from_mapping_data(
        data: &ImportMappingData,
    ) -> std::result::Result<Self, serde_json::Error> {
        Ok(Self {
            account_id: data.account_id.clone(),
            field_mappings: serde_json::to_string(&data.field_mappings)?,
            activity_mappings: serde_json::to_string(&data.activity_mappings)?,
            symbol_mappings: serde_json::to_string(&data.symbol_mappings)?,
            account_mappings: serde_json::to_string(&data.account_mappings)?,
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

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
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
    use chrono::{DateTime, NaiveDate, TimeZone, Utc};
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
            // Use midnight UTC for date-only values
            return Ok(Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap_or_default()));
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
            activity_date: DateTime::parse_from_rfc3339(&db.activity_date)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|e| {
                    log::error!(
                        "Failed to parse activity_date '{}': {}",
                        db.activity_date,
                        e
                    );
                    Utc::now() // Fallback to now
                }),
            quantity: parse_decimal_string_tolerant(&db.quantity, "quantity"),
            unit_price: parse_decimal_string_tolerant(&db.unit_price, "unit_price"),
            currency: db.currency,
            fee: parse_decimal_string_tolerant(&db.fee, "fee"),
            amount: db
                .amount
                .map(|s| parse_decimal_string_tolerant(&s, "amount")),
            is_draft: db.is_draft,
            comment: db.comment,
            created_at: DateTime::parse_from_rfc3339(&db.created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|e| {
                    log::error!("Failed to parse created_at '{}': {}", db.created_at, e);
                    Utc::now() // Fallback to now
                }),
            updated_at: DateTime::parse_from_rfc3339(&db.updated_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|e| {
                    log::error!("Failed to parse updated_at '{}': {}", db.updated_at, e);
                    Utc::now() // Fallback to now
                }),
        }
    }
}

impl From<NewActivity> for ActivityDB {
    fn from(domain: NewActivity) -> Self {
        let now = Utc::now();

        // Parse the date and normalize to UTC
        let activity_datetime = DateTime::parse_from_rfc3339(&domain.activity_date)
            .map(|dt| dt.with_timezone(&Utc))
            .or_else(|_| {
                // If date-only format, use midnight UTC
                NaiveDate::parse_from_str(&domain.activity_date, "%Y-%m-%d").map(|date| {
                    Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap_or_default())
                })
            })
            .unwrap_or_else(|e| {
                log::error!(
                    "Failed to parse activity date '{}': {}",
                    domain.activity_date,
                    e
                );
                // If parsing fails, use midnight UTC today
                Utc.from_utc_datetime(
                    &now.date_naive()
                        .and_hms_opt(0, 0, 0)
                        .unwrap_or_else(|| now.naive_utc()),
                )
            });

        // Handle cash activities and splits
        let activity_type = domain.activity_type.as_str();
        let is_cash_or_split = activity_type == "DEPOSIT"
            || activity_type == "WITHDRAWAL"
            || activity_type == "FEE"
            || activity_type == "INTEREST"
            || activity_type == "DIVIDEND"
            || activity_type == "SPLIT"
            || activity_type == "TRANSFER_IN"
            || activity_type == "TRANSFER_OUT";

        let (quantity, unit_price, amount) = if is_cash_or_split {
            // For cash activities and splits, set quantity and unit_price to 0
            // Use amount if provided, otherwise use quantity
            let amount_str = match &domain.amount {
                Some(amount) => amount.to_string(),
                None => domain.quantity.unwrap_or_else(|| Decimal::ZERO).to_string(),
            };
            ("0".to_string(), "0".to_string(), Some(amount_str))
        } else {
            // For other activities, use the provided values
            (
                domain.quantity.unwrap_or_else(|| Decimal::ZERO).to_string(),
                domain
                    .unit_price
                    .unwrap_or_else(|| Decimal::ZERO)
                    .to_string(),
                domain.amount.as_ref().map(|a| a.to_string()),
            )
        };

        Self {
            id: domain.id.unwrap_or_default(),
            account_id: domain.account_id,
            asset_id: domain.asset_id,
            activity_type: domain.activity_type,
            activity_date: activity_datetime.to_rfc3339(),
            quantity,
            unit_price,
            currency: domain.currency,
            fee: domain.fee.unwrap_or_else(|| Decimal::ZERO).to_string(),
            amount,
            is_draft: domain.is_draft,
            comment: domain.comment,
            created_at: now.to_rfc3339(),
            updated_at: now.to_rfc3339(),
        }
    }
}

impl From<ActivityUpdate> for ActivityDB {
    fn from(domain: ActivityUpdate) -> Self {
        let now = Utc::now();

        // Use the same date parsing logic as NewActivity for consistency
        let activity_datetime = DateTime::parse_from_rfc3339(&domain.activity_date)
            .map(|dt| dt.with_timezone(&Utc))
            .or_else(|_| {
                NaiveDate::parse_from_str(&domain.activity_date, "%Y-%m-%d").map(|date| {
                    Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap_or_default())
                })
            })
            .unwrap_or_else(|e| {
                log::error!(
                    "Failed to parse activity date '{}': {}",
                    domain.activity_date,
                    e
                );
                Utc.from_utc_datetime(
                    &now.date_naive()
                        .and_hms_opt(0, 0, 0)
                        .unwrap_or_else(|| now.naive_utc()),
                )
            });

        // Handle cash activities and splits
        let activity_type = domain.activity_type.as_str();
        let is_cash_or_split = activity_type == "DEPOSIT"
            || activity_type == "WITHDRAWAL"
            || activity_type == "FEE"
            || activity_type == "INTEREST"
            || activity_type == "DIVIDEND"
            || activity_type == "SPLIT"
            || activity_type == "TRANSFER_IN"
            || activity_type == "TRANSFER_OUT";

        let (quantity, unit_price, amount) = if is_cash_or_split {
            // For cash activities and splits, set quantity and unit_price to 0
            // Use amount if provided, otherwise use quantity
            let amount_str = match &domain.amount {
                Some(amount) => amount.to_string(),
                None => domain.quantity.unwrap_or_else(|| Decimal::ZERO).to_string(),
            };
            ("0".to_string(), "0".to_string(), Some(amount_str))
        } else {
            // For other activities, use the provided values
            (
                domain.quantity.unwrap_or_else(|| Decimal::ZERO).to_string(),
                domain
                    .unit_price
                    .unwrap_or_else(|| Decimal::ZERO)
                    .to_string(),
                domain.amount.as_ref().map(|a| a.to_string()),
            )
        };

        Self {
            id: domain.id,
            account_id: domain.account_id,
            asset_id: domain.asset_id,
            activity_type: domain.activity_type,
            activity_date: activity_datetime.to_rfc3339(),
            quantity,
            unit_price,
            currency: domain.currency,
            fee: domain.fee.unwrap_or_else(|| Decimal::ZERO).to_string(),
            amount,
            is_draft: domain.is_draft,
            comment: domain.comment,
            created_at: now.to_rfc3339(), // This should ideally preserve original created_at. Need to fetch before update.
            updated_at: now.to_rfc3339(),
        }
    }
}
#[derive(Debug, Serialize, QueryableByName)]
#[serde(rename_all = "camelCase")]
#[diesel(table_name = crate::schema::activities)]
pub struct IncomeData {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub date: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub income_type: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub symbol: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub symbol_name: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub currency: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub amount: Decimal,
}
