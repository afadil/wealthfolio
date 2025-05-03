use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, NaiveDate, Utc};
use std::collections::VecDeque;

// Import Lot from its definition
use crate::portfolio::snapshot::Lot;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum HoldingType {
    Cash,
    Security,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Sector {
    pub name: String,
    pub weight: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Country {
    pub name: String,
    pub weight: f64,
}

/// Instrument data needed for display
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Instrument {
    pub id: String,
    pub symbol: String,
    pub name: Option<String>,
    pub currency: String,
    pub notes: Option<String>,
    pub data_source: Option<String>,
    
    // Classification
    pub asset_class: Option<String>,
    pub asset_subclass: Option<String>,
    
    // Display categorization
    pub countries: Option<Vec<Country>>,
    pub sectors: Option<Vec<Sector>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonetaryValue {
    pub local: Decimal,
    pub base: Decimal,
}

impl MonetaryValue {
    pub fn zero() -> Self {
        MonetaryValue {
            local: Decimal::ZERO,
            base: Decimal::ZERO,
        }
    }
}

/// Position view model for frontend display with daily and total performance
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Holding {
    // Core identification
    pub id: String,
    pub account_id: String,
    
    // Position type and instrument info
    pub holding_type: HoldingType,
    pub instrument: Option<Instrument>,
    
    // Position data
    pub quantity: Decimal,
    pub open_date: Option<DateTime<Utc>>,
    pub lots: Option<VecDeque<Lot>>,
    
    // Currency info
    pub local_currency: String,
    pub base_currency: String,
    pub fx_rate: Option<Decimal>,
    
    // Current valuation
    pub market_value: MonetaryValue,
    pub cost_basis: Option<MonetaryValue>,
    pub price: Option<Decimal>,
    
    // Total performance (since inception or purchase)
    pub unrealized_gain: Option<MonetaryValue>,
    pub unrealized_gain_pct: Option<Decimal>,
    pub realized_gain: Option<MonetaryValue>,
    pub realized_gain_pct: Option<Decimal>,
    pub total_gain: Option<MonetaryValue>,
    pub total_gain_pct: Option<Decimal>,
    
    // Daily performance
    pub day_change: Option<MonetaryValue>,
    pub day_change_pct: Option<Decimal>,
    pub prev_close_value: Option<MonetaryValue>,
    
    // Portfolio allocation
    pub weight: Decimal,
    
    // Reference date for performance calculations
    pub as_of_date: NaiveDate,
}