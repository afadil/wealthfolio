//! Cache data models

use chrono::{NaiveDate, Utc};
use diesel::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use crate::schema::vn_historical_records;

/// Asset types for VN market
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum VnAssetType {
    Stock,
    Fund,
    Gold,
    Index,
}

impl VnAssetType {
    pub fn as_str(&self) -> &'static str {
        match self {
            VnAssetType::Stock => "STOCK",
            VnAssetType::Fund => "FUND",
            VnAssetType::Gold => "GOLD",
            VnAssetType::Index => "INDEX",
        }
    }

    /// TTL in seconds for quote cache
    pub fn quote_ttl_secs(&self) -> u64 {
        match self {
            VnAssetType::Stock => 3600,      // 1 hour
            VnAssetType::Index => 3600,      // 1 hour
            VnAssetType::Fund => 86400,      // 24 hours (NAV updates once daily)
            VnAssetType::Gold => 1800,       // 30 minutes
        }
    }
}

impl FromStr for VnAssetType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "STOCK" => Ok(VnAssetType::Stock),
            "FUND" => Ok(VnAssetType::Fund),
            "GOLD" => Ok(VnAssetType::Gold),
            "INDEX" => Ok(VnAssetType::Index),
            _ => Err(format!("Unknown asset type: {}", s)),
        }
    }
}

impl std::fmt::Display for VnAssetType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Historical record for domain logic
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VnHistoricalRecord {
    pub id: String,
    pub symbol: String,
    pub asset_type: VnAssetType,
    pub date: NaiveDate,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub adjclose: Decimal,
    pub volume: Decimal,
    pub nav: Option<Decimal>,
    pub buy_price: Option<Decimal>,
    pub sell_price: Option<Decimal>,
    pub currency: String,
}

impl VnHistoricalRecord {
    /// Create a new record with auto-generated ID
    pub fn new(
        symbol: &str,
        asset_type: VnAssetType,
        date: NaiveDate,
        open: Decimal,
        high: Decimal,
        low: Decimal,
        close: Decimal,
        volume: Decimal,
    ) -> Self {
        let id = format!("{}_{}_{}",
            symbol,
            date.format("%Y%m%d"),
            asset_type.as_str()
        );

        Self {
            id,
            symbol: symbol.to_string(),
            asset_type,
            date,
            open,
            high,
            low,
            close,
            adjclose: close,
            volume,
            nav: None,
            buy_price: None,
            sell_price: None,
            currency: "VND".to_string(),
        }
    }

    /// Set NAV (for funds)
    pub fn with_nav(mut self, nav: Decimal) -> Self {
        self.nav = Some(nav);
        self
    }

    /// Set gold prices
    pub fn with_gold_prices(mut self, buy: Decimal, sell: Decimal) -> Self {
        self.buy_price = Some(buy);
        self.sell_price = Some(sell);
        self
    }
}

/// Database model for vn_historical_records table
#[derive(
    Debug, Clone, Queryable, Identifiable, Selectable, Insertable, AsChangeset, Serialize, Deserialize,
)]
#[diesel(table_name = vn_historical_records)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct VnHistoricalRecordDb {
    pub id: String,
    pub symbol: String,
    pub asset_type: String,
    pub date: String,
    pub open: String,
    pub high: String,
    pub low: String,
    pub close: String,
    pub adjclose: String,
    pub volume: String,
    pub nav: Option<String>,
    pub buy_price: Option<String>,
    pub sell_price: Option<String>,
    pub currency: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<VnHistoricalRecord> for VnHistoricalRecordDb {
    fn from(record: VnHistoricalRecord) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: record.id,
            symbol: record.symbol,
            asset_type: record.asset_type.as_str().to_string(),
            date: record.date.to_string(),
            open: record.open.to_string(),
            high: record.high.to_string(),
            low: record.low.to_string(),
            close: record.close.to_string(),
            adjclose: record.adjclose.to_string(),
            volume: record.volume.to_string(),
            nav: record.nav.map(|v| v.to_string()),
            buy_price: record.buy_price.map(|v| v.to_string()),
            sell_price: record.sell_price.map(|v| v.to_string()),
            currency: record.currency,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl From<VnHistoricalRecordDb> for VnHistoricalRecord {
    fn from(db: VnHistoricalRecordDb) -> Self {
        Self {
            id: db.id,
            symbol: db.symbol,
            asset_type: VnAssetType::from_str(&db.asset_type).unwrap_or(VnAssetType::Stock),
            date: NaiveDate::parse_from_str(&db.date, "%Y-%m-%d").unwrap_or_default(),
            open: Decimal::from_str(&db.open).unwrap_or_default(),
            high: Decimal::from_str(&db.high).unwrap_or_default(),
            low: Decimal::from_str(&db.low).unwrap_or_default(),
            close: Decimal::from_str(&db.close).unwrap_or_default(),
            adjclose: Decimal::from_str(&db.adjclose).unwrap_or_default(),
            volume: Decimal::from_str(&db.volume).unwrap_or_default(),
            nav: db.nav.and_then(|v| Decimal::from_str(&v).ok()),
            buy_price: db.buy_price.and_then(|v| Decimal::from_str(&v).ok()),
            sell_price: db.sell_price.and_then(|v| Decimal::from_str(&v).ok()),
            currency: db.currency,
        }
    }
}

/// Cached quote for in-memory storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedQuote {
    pub symbol: String,
    pub asset_type: VnAssetType,
    pub date: NaiveDate,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub volume: Decimal,
    pub nav: Option<Decimal>,
    pub buy_price: Option<Decimal>,
    pub sell_price: Option<Decimal>,
    pub currency: String,
}

impl From<VnHistoricalRecord> for CachedQuote {
    fn from(record: VnHistoricalRecord) -> Self {
        Self {
            symbol: record.symbol,
            asset_type: record.asset_type,
            date: record.date,
            open: record.open,
            high: record.high,
            low: record.low,
            close: record.close,
            volume: record.volume,
            nav: record.nav,
            buy_price: record.buy_price,
            sell_price: record.sell_price,
            currency: record.currency,
        }
    }
}
