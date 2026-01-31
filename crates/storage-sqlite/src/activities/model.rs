//! Database models for activities.

use chrono::{NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use wealthfolio_core::activities::{
    Activity, ActivityStatus, ActivityUpdate, ActivityUpsert, NewActivity,
};

/// Helper function to parse a string into a Decimal,
/// with a fallback for scientific notation by parsing as f64 first.
fn parse_decimal_string_tolerant(value_str: &str, field_name: &str) -> Decimal {
    match Decimal::from_str(value_str) {
        Ok(d) => d,
        Err(e_decimal) => match f64::from_str(value_str) {
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
                log::error!(
                        "Failed to parse {} '{}': as Decimal (err: {}), and as f64 (err: {}). Falling back to ZERO.",
                        field_name, value_str, e_decimal, e_f64
                    );
                Decimal::ZERO
            }
        },
    }
}

/// Database model for activities - COMPLETELY REDESIGNED
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
pub struct ActivityDB {
    pub id: String,
    pub account_id: String,
    pub asset_id: Option<String>, // NOW NULLABLE

    // Classification
    pub activity_type: String,
    pub activity_type_override: Option<String>,
    pub source_type: Option<String>,
    pub subtype: Option<String>,
    pub status: String,

    // Timing
    pub activity_date: String,
    pub settlement_date: Option<String>,

    // Quantities - NOW ALL NULLABLE
    // treat_none_as_null: When None, Diesel sets column to NULL instead of skipping
    #[diesel(treat_none_as_null = true)]
    pub quantity: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub unit_price: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub amount: Option<String>,
    #[diesel(treat_none_as_null = true)]
    pub fee: Option<String>,
    pub currency: String,
    pub fx_rate: Option<String>,

    // Metadata
    #[diesel(treat_none_as_null = true)]
    pub notes: Option<String>,
    pub metadata: Option<String>,

    // Source identity
    pub source_system: Option<String>,
    pub source_record_id: Option<String>,
    pub source_group_id: Option<String>,
    pub idempotency_key: Option<String>,
    pub import_run_id: Option<String>,

    // Sync flags (i32 for SQLite INTEGER)
    pub is_user_modified: i32,
    pub needs_review: i32,

    // Audit
    pub created_at: String,
    pub updated_at: String,
}

/// Model for activity details including related data
/// Field order MUST match the select() order in repository.rs
#[derive(Queryable, QueryableByName, Serialize, Deserialize, Clone, Debug)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct ActivityDetailsDB {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub id: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub account_id: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub asset_id: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub activity_type: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub subtype: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub status: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub date: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub quantity: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub unit_price: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub currency: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub fee: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub amount: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub notes: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub fx_rate: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Integer)]
    pub needs_review: i32,
    #[diesel(sql_type = diesel::sql_types::Integer)]
    pub is_user_modified: i32,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub source_system: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub source_record_id: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub idempotency_key: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub import_run_id: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub created_at: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub updated_at: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub account_name: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub account_currency: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub asset_symbol: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub asset_name: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub asset_pricing_mode: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub metadata: Option<String>,
}

impl ActivityDetailsDB {
    pub fn get_quantity(&self) -> Decimal {
        self.quantity
            .as_ref()
            .map(|s| parse_decimal_string_tolerant(s, "quantity"))
            .unwrap_or(Decimal::ZERO)
    }

    pub fn get_unit_price(&self) -> Decimal {
        self.unit_price
            .as_ref()
            .map(|s| parse_decimal_string_tolerant(s, "unit_price"))
            .unwrap_or(Decimal::ZERO)
    }

    pub fn get_fee(&self) -> Decimal {
        self.fee
            .as_ref()
            .map(|s| parse_decimal_string_tolerant(s, "fee"))
            .unwrap_or(Decimal::ZERO)
    }

    pub fn get_amount(&self) -> Option<Decimal> {
        self.amount
            .as_ref()
            .map(|s| parse_decimal_string_tolerant(s, "amount"))
    }
}

/// Database model for activity import profile mapping
#[derive(
    Debug, Clone, Serialize, Deserialize, Queryable, Identifiable, AsChangeset, Insertable,
)]
#[diesel(primary_key(account_id))]
#[diesel(table_name = crate::schema::activity_import_profiles)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct ImportMappingDB {
    pub account_id: String,
    pub name: String,
    /// JSON containing all mapping config: fieldMappings, activityMappings, symbolMappings, accountMappings, parseConfig
    pub config: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Database model for income data query results
#[derive(Debug, Serialize, QueryableByName)]
#[serde(rename_all = "camelCase")]
#[diesel(table_name = crate::schema::activities)]
pub struct IncomeDataDB {
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
    pub amount: String,
}

impl IncomeDataDB {
    pub fn get_amount(&self) -> Decimal {
        parse_decimal_string_tolerant(&self.amount, "amount")
    }
}

impl From<ActivityDetailsDB> for wealthfolio_core::activities::ActivityDetails {
    fn from(db: ActivityDetailsDB) -> Self {
        use wealthfolio_core::activities::ActivityStatus;

        // Parse status string to ActivityStatus enum
        let status = match db.status.as_str() {
            "POSTED" => ActivityStatus::Posted,
            "PENDING" => ActivityStatus::Pending,
            "DRAFT" => ActivityStatus::Draft,
            "VOID" => ActivityStatus::Void,
            _ => ActivityStatus::Posted, // Default to Posted for unknown values
        };

        Self {
            id: db.id,
            account_id: db.account_id,
            asset_id: db.asset_id.unwrap_or_default(),
            activity_type: db.activity_type,
            subtype: db.subtype,
            status,
            date: db.date,
            quantity: db.quantity.unwrap_or_else(|| "0".to_string()),
            unit_price: db.unit_price.unwrap_or_else(|| "0".to_string()),
            currency: db.currency,
            fee: db.fee.unwrap_or_else(|| "0".to_string()),
            amount: db.amount,
            needs_review: db.needs_review != 0,
            comment: db.notes,
            fx_rate: db.fx_rate,
            created_at: db.created_at,
            updated_at: db.updated_at,
            account_name: db.account_name,
            account_currency: db.account_currency,
            asset_symbol: db.asset_symbol.unwrap_or_default(),
            asset_name: db.asset_name,
            asset_pricing_mode: db
                .asset_pricing_mode
                .unwrap_or_else(|| "MARKET".to_string()),
            source_system: db.source_system,
            source_record_id: db.source_record_id,
            idempotency_key: db.idempotency_key,
            import_run_id: db.import_run_id,
            is_user_modified: db.is_user_modified != 0,
            metadata: db.metadata.and_then(|s| serde_json::from_str(&s).ok()),
        }
    }
}

impl From<ImportMappingDB> for wealthfolio_core::activities::ImportMapping {
    fn from(db: ImportMappingDB) -> Self {
        Self {
            account_id: db.account_id,
            name: db.name,
            config: db.config,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<wealthfolio_core::activities::ImportMapping> for ImportMappingDB {
    fn from(domain: wealthfolio_core::activities::ImportMapping) -> Self {
        Self {
            account_id: domain.account_id,
            name: domain.name,
            config: domain.config,
            created_at: domain.created_at,
            updated_at: domain.updated_at,
        }
    }
}

// Conversion implementations

impl From<ActivityDB> for Activity {
    fn from(db: ActivityDB) -> Self {
        use chrono::DateTime;

        // Parse status string to ActivityStatus enum
        let status = match db.status.as_str() {
            "POSTED" => ActivityStatus::Posted,
            "PENDING" => ActivityStatus::Pending,
            "DRAFT" => ActivityStatus::Draft,
            "VOID" => ActivityStatus::Void,
            _ => ActivityStatus::Posted, // Default to Posted for unknown values
        };

        // Parse metadata JSON if present
        let metadata = db
            .metadata
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        Self {
            id: db.id,
            account_id: db.account_id,
            asset_id: db.asset_id,

            // Classification
            activity_type: db.activity_type,
            activity_type_override: db.activity_type_override,
            source_type: db.source_type,
            subtype: db.subtype,
            status,

            // Timing
            activity_date: DateTime::parse_from_rfc3339(&db.activity_date)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|e| {
                    log::error!(
                        "Failed to parse activity_date '{}': {}",
                        db.activity_date,
                        e
                    );
                    Utc::now()
                }),
            settlement_date: db.settlement_date.as_ref().and_then(|s| {
                DateTime::parse_from_rfc3339(s)
                    .map(|dt| dt.with_timezone(&Utc))
                    .ok()
            }),

            // Quantities
            quantity: db
                .quantity
                .as_ref()
                .map(|s| parse_decimal_string_tolerant(s, "quantity")),
            unit_price: db
                .unit_price
                .as_ref()
                .map(|s| parse_decimal_string_tolerant(s, "unit_price")),
            amount: db
                .amount
                .as_ref()
                .map(|s| parse_decimal_string_tolerant(s, "amount")),
            fee: db
                .fee
                .as_ref()
                .map(|s| parse_decimal_string_tolerant(s, "fee")),
            currency: db.currency,
            fx_rate: db
                .fx_rate
                .as_ref()
                .map(|s| parse_decimal_string_tolerant(s, "fx_rate")),

            // Metadata
            notes: db.notes,
            metadata,

            // Source identity
            source_system: db.source_system,
            source_record_id: db.source_record_id,
            source_group_id: db.source_group_id,
            idempotency_key: db.idempotency_key,
            import_run_id: db.import_run_id,

            // Sync flags
            is_user_modified: db.is_user_modified != 0,
            needs_review: db.needs_review != 0,

            // Audit
            created_at: chrono::DateTime::parse_from_rfc3339(&db.created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|e| {
                    log::error!("Failed to parse created_at '{}': {}", db.created_at, e);
                    Utc::now()
                }),
            updated_at: chrono::DateTime::parse_from_rfc3339(&db.updated_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|e| {
                    log::error!("Failed to parse updated_at '{}': {}", db.updated_at, e);
                    Utc::now()
                }),
        }
    }
}

impl From<NewActivity> for ActivityDB {
    fn from(domain: NewActivity) -> Self {
        use chrono::DateTime;

        let now = Utc::now();

        // Parse the date and normalize to UTC
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

        // Convert ActivityStatus to string, defaulting to POSTED
        let status = domain
            .status
            .as_ref()
            .map(|s| match s {
                ActivityStatus::Posted => "POSTED",
                ActivityStatus::Pending => "PENDING",
                ActivityStatus::Draft => "DRAFT",
                ActivityStatus::Void => "VOID",
            })
            .unwrap_or("POSTED")
            .to_string();

        // Extract asset_id before consuming domain fields
        let asset_id = domain.get_asset_id().map(|s| s.to_string());

        Self {
            id: domain.id.unwrap_or_default(),
            account_id: domain.account_id,
            asset_id,

            // Classification
            activity_type: domain.activity_type,
            activity_type_override: None,
            source_type: None,
            subtype: domain.subtype,
            status,

            // Timing
            activity_date: activity_datetime.to_rfc3339(),
            settlement_date: None,

            // Quantities
            quantity: domain.quantity.map(|d| d.to_string()),
            unit_price: domain.unit_price.map(|d| d.to_string()),
            amount: domain.amount.map(|d| d.to_string()),
            fee: domain.fee.map(|d| d.to_string()),
            currency: domain.currency,
            fx_rate: domain.fx_rate.map(|d| d.to_string()),

            // Metadata
            notes: domain.notes,
            metadata: domain.metadata,

            // Source identity
            source_system: domain.source_system.or(Some("MANUAL".to_string())),
            source_record_id: domain.source_record_id,
            source_group_id: domain.source_group_id,
            idempotency_key: None,
            import_run_id: None,

            // Sync flags
            is_user_modified: 0,
            needs_review: domain.needs_review.map(|b| b as i32).unwrap_or(0),

            // Audit
            created_at: now.to_rfc3339(),
            updated_at: now.to_rfc3339(),
        }
    }
}

impl From<ActivityUpdate> for ActivityDB {
    fn from(domain: ActivityUpdate) -> Self {
        use chrono::DateTime;

        let now = Utc::now();

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

        // Convert ActivityStatus to string, defaulting to POSTED
        let status = domain
            .status
            .as_ref()
            .map(|s| match s {
                ActivityStatus::Posted => "POSTED",
                ActivityStatus::Pending => "PENDING",
                ActivityStatus::Draft => "DRAFT",
                ActivityStatus::Void => "VOID",
            })
            .unwrap_or("POSTED")
            .to_string();

        // Extract asset_id before consuming domain fields
        let asset_id = domain.get_asset_id().map(|s| s.to_string());

        Self {
            id: domain.id,
            account_id: domain.account_id,
            asset_id,

            // Classification
            activity_type: domain.activity_type,
            activity_type_override: None,
            source_type: None,
            subtype: domain.subtype,
            status,

            // Timing
            activity_date: activity_datetime.to_rfc3339(),
            settlement_date: None,

            // Quantities
            quantity: domain.quantity.map(|d| d.to_string()),
            unit_price: domain.unit_price.map(|d| d.to_string()),
            amount: domain.amount.map(|d| d.to_string()),
            fee: domain.fee.map(|d| d.to_string()),
            currency: domain.currency,
            fx_rate: domain.fx_rate.map(|d| d.to_string()),

            // Metadata
            notes: domain.notes,
            metadata: domain.metadata,

            // Source identity - these will be preserved from existing record in repository
            source_system: None,
            source_record_id: None,
            source_group_id: None,
            idempotency_key: None,
            import_run_id: None,

            // Sync flags - mark as user modified since this is an update
            is_user_modified: 1,
            needs_review: 0,

            // Audit
            created_at: now.to_rfc3339(),
            updated_at: now.to_rfc3339(),
        }
    }
}

impl From<ActivityUpsert> for ActivityDB {
    fn from(domain: ActivityUpsert) -> Self {
        use chrono::DateTime;

        let now = Utc::now();

        // Parse the date and normalize to UTC
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

        // Convert ActivityStatus to string, defaulting to POSTED
        let status = domain
            .status
            .as_ref()
            .map(|s| match s {
                ActivityStatus::Posted => "POSTED",
                ActivityStatus::Pending => "PENDING",
                ActivityStatus::Draft => "DRAFT",
                ActivityStatus::Void => "VOID",
            })
            .unwrap_or("POSTED")
            .to_string();

        Self {
            id: domain.id,
            account_id: domain.account_id,
            asset_id: domain.asset_id,

            // Classification
            activity_type: domain.activity_type,
            activity_type_override: None,
            source_type: None,
            subtype: domain.subtype,
            status,

            // Timing
            activity_date: activity_datetime.to_rfc3339(),
            settlement_date: None,

            // Quantities
            quantity: domain.quantity.map(|d| d.to_string()),
            unit_price: domain.unit_price.map(|d| d.to_string()),
            amount: domain.amount.map(|d| d.to_string()),
            fee: domain.fee.map(|d| d.to_string()),
            currency: domain.currency,
            fx_rate: domain.fx_rate.map(|d| d.to_string()),

            // Metadata
            notes: domain.notes,
            metadata: domain.metadata,

            // Source identity
            source_system: domain.source_system,
            source_record_id: domain.source_record_id,
            source_group_id: domain.source_group_id,
            idempotency_key: domain.idempotency_key,
            import_run_id: domain.import_run_id,

            // Sync flags - sync activities are not user modified by default
            is_user_modified: 0,
            needs_review: domain.needs_review.map(|b| b as i32).unwrap_or(0),

            // Audit
            created_at: now.to_rfc3339(),
            updated_at: now.to_rfc3339(),
        }
    }
}
