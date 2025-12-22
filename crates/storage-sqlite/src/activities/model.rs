//! Database models for activities.

use chrono::{NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use wealthfolio_core::activities::{Activity, ActivityUpdate, NewActivity};
use wealthfolio_core::constants::CASH_ASSET_PREFIX;

/// Helper function to parse a string into a Decimal,
/// with a fallback for scientific notation by parsing as f64 first.
fn parse_decimal_string_tolerant(value_str: &str, field_name: &str) -> Decimal {
    match Decimal::from_str(value_str) {
        Ok(d) => d,
        Err(e_decimal) => {
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
    pub fx_rate: Option<String>,
    pub provider_type: Option<String>,
    pub external_provider_id: Option<String>,
    pub external_broker_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for activity details including related data
#[derive(Queryable, QueryableByName, Serialize, Deserialize, Clone, Debug)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct ActivityDetailsDB {
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
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub fx_rate: Option<String>,
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

impl ActivityDetailsDB {
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
    pub field_mappings: String,
    pub activity_mappings: String,
    pub symbol_mappings: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub account_mappings: String,
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
        Self {
            id: db.id,
            account_id: db.account_id,
            asset_id: db.asset_id,
            activity_type: db.activity_type,
            date: db.date,
            quantity: db.quantity,
            unit_price: db.unit_price,
            currency: db.currency,
            fee: db.fee,
            amount: db.amount,
            is_draft: db.is_draft,
            comment: db.comment,
            fx_rate: db.fx_rate,
            created_at: db.created_at,
            updated_at: db.updated_at,
            account_name: db.account_name,
            account_currency: db.account_currency,
            asset_symbol: db.asset_symbol,
            asset_name: db.asset_name,
            asset_data_source: db.asset_data_source,
        }
    }
}

impl From<ImportMappingDB> for wealthfolio_core::activities::ImportMapping {
    fn from(db: ImportMappingDB) -> Self {
        Self {
            account_id: db.account_id,
            field_mappings: db.field_mappings,
            activity_mappings: db.activity_mappings,
            symbol_mappings: db.symbol_mappings,
            created_at: db.created_at,
            updated_at: db.updated_at,
            account_mappings: db.account_mappings,
        }
    }
}

impl From<wealthfolio_core::activities::ImportMapping> for ImportMappingDB {
    fn from(domain: wealthfolio_core::activities::ImportMapping) -> Self {
        Self {
            account_id: domain.account_id,
            field_mappings: domain.field_mappings,
            activity_mappings: domain.activity_mappings,
            symbol_mappings: domain.symbol_mappings,
            created_at: domain.created_at,
            updated_at: domain.updated_at,
            account_mappings: domain.account_mappings,
        }
    }
}

// Conversion implementations

impl From<ActivityDB> for Activity {
    fn from(db: ActivityDB) -> Self {
        use chrono::DateTime;

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
                    Utc::now()
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
            fx_rate: db
                .fx_rate
                .as_deref()
                .map(|s| parse_decimal_string_tolerant(s, "fx_rate")),
            provider_type: db.provider_type,
            external_provider_id: db.external_provider_id,
            external_broker_id: db.external_broker_id,
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

        // Handle cash activities and splits
        let activity_type = domain.activity_type.as_str();
        let is_transfer = activity_type == "TRANSFER_IN" || activity_type == "TRANSFER_OUT";
        let is_cash_asset = domain.asset_id.starts_with(CASH_ASSET_PREFIX);
        let is_cash_or_split = activity_type == "DEPOSIT"
            || activity_type == "WITHDRAWAL"
            || activity_type == "FEE"
            || activity_type == "INTEREST"
            || activity_type == "DIVIDEND"
            || activity_type == "SPLIT"
            || (is_transfer && is_cash_asset);

        let (quantity, unit_price, amount) = if is_cash_or_split {
            let amount_str = match &domain.amount {
                Some(amount) => amount.to_string(),
                None => domain.quantity.unwrap_or(Decimal::ZERO).to_string(),
            };
            ("0".to_string(), "0".to_string(), Some(amount_str))
        } else if is_transfer && !is_cash_asset {
            (
                domain.quantity.unwrap_or(Decimal::ZERO).to_string(),
                domain.unit_price.unwrap_or(Decimal::ZERO).to_string(),
                domain.amount.as_ref().map(|a| a.to_string()),
            )
        } else {
            (
                domain.quantity.unwrap_or(Decimal::ZERO).to_string(),
                domain.unit_price.unwrap_or(Decimal::ZERO).to_string(),
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
            fee: domain.fee.unwrap_or(Decimal::ZERO).to_string(),
            amount,
            is_draft: domain.is_draft,
            comment: domain.comment,
            fx_rate: domain.fx_rate.map(|d| d.to_string()),
            provider_type: domain.provider_type,
            external_provider_id: domain.external_provider_id,
            external_broker_id: domain.external_broker_id,
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
            let amount_str = match &domain.amount {
                Some(amount) => amount.to_string(),
                None => domain.quantity.unwrap_or(Decimal::ZERO).to_string(),
            };
            ("0".to_string(), "0".to_string(), Some(amount_str))
        } else {
            (
                domain.quantity.unwrap_or(Decimal::ZERO).to_string(),
                domain.unit_price.unwrap_or(Decimal::ZERO).to_string(),
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
            fee: domain.fee.unwrap_or(Decimal::ZERO).to_string(),
            amount,
            is_draft: domain.is_draft,
            comment: domain.comment,
            fx_rate: domain.fx_rate.map(|d| d.to_string()),
            provider_type: domain.provider_type,
            external_provider_id: domain.external_provider_id,
            external_broker_id: domain.external_broker_id,
            created_at: now.to_rfc3339(),
            updated_at: now.to_rfc3339(),
        }
    }
}
