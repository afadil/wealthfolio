use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use crate::utils::decimal_serde::{decimal_serde, decimal_serde_option};
use crate::assets_model::AssetSummary;
use chrono::{DateTime, Utc};

// --- Enum for Holding Type ---
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum HoldingType {
    Security,
    Cash,
}

// --- Revised HoldingView ---
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HoldingView {
    pub id: String,                 // Unique ID (e.g., holding ID or composite view ID)
    pub holding_type: HoldingType, // Use Enum
    pub account_id: String,         // ID of the account (or "TOTAL")
    pub asset_id: String,           // ID of the asset (maps to Position.asset_id or currency for cash)
    pub symbol: String,             // Asset symbol (ticker or currency code)
    pub asset: Option<AssetSummary>, // Renamed from 'asset'

    // --- Core Holding Data (extracted/flattened) ---
    #[serde(with = "decimal_serde")]
    pub quantity: Decimal,          // Current quantity (for Security) or amount (for Cash)
    #[serde(with = "decimal_serde_option")] // Cost basis relevant only for Securities
    pub average_cost_price: Option<Decimal>, // Avg cost per unit
    #[serde(with = "decimal_serde_option")]
    pub total_cost_basis: Option<Decimal>, // Total cost basis
    pub currency: String,           // Holding's currency (e.g., "USD", "CAD")
    pub inception_date: Option<DateTime<Utc>>, // Optional: Date holding was initiated

    // --- Calculated Performance & Allocation ---
    pub performance: PerformanceMetrics, // Renamed for clarity
    #[serde(with = "decimal_serde")]
    pub allocation_percent: Decimal, // Allocation percentage within the account/portfolio
}

// --- Revised Performance Struct ---
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceMetrics { // Renamed from Performance
    #[serde(with = "decimal_serde_option")]
    pub market_price: Option<Decimal>, // Current market price per unit (in holding currency)
    #[serde(with = "decimal_serde_option")]
    pub market_value: Option<Decimal>, // Current market value (in base currency)
    #[serde(with = "decimal_serde_option")]
    pub total_gain_loss_amount: Option<Decimal>, // P/L Amount (in base currency)
    #[serde(with = "decimal_serde_option")]
    pub total_gain_loss_percent: Option<Decimal>, // P/L Percent
    #[serde(with = "decimal_serde_option")]
    pub day_gain_loss_amount: Option<Decimal>, // Day's P/L Amount (in base currency)
    #[serde(with = "decimal_serde_option")]
    pub day_gain_loss_percent: Option<Decimal>, // Day's P/L Percent
    pub base_currency: String,      // Portfolio's base currency (display currency)
    #[serde(with = "decimal_serde_option")] // FX rate might not apply if holding is in base currency
    pub fx_rate_to_base: Option<Decimal>, // Rate: 1 unit of holding currency = X units of base currency
}

// Default implementation for PerformanceMetrics
// Note: Consider if defaulting fx_rate_to_base to None or One is more appropriate
impl Default for PerformanceMetrics {
    fn default() -> Self {
        PerformanceMetrics {
            market_price: None,
            market_value: None,
            total_gain_loss_amount: None,
            total_gain_loss_percent: None,
            day_gain_loss_amount: None,
            day_gain_loss_percent: None,
            base_currency: String::new(),
            fx_rate_to_base: None, // Defaulting to None might be safer than assuming 1
        }
    }
} 