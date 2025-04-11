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
    // --- Added fields needed for summary percentage calculation ---
    #[serde(with = "decimal_serde_option")]
    pub total_cost_basis_base: Option<Decimal>, // Total cost basis (in base currency) - For Security holdings
    #[serde(with = "decimal_serde_option")]
    pub previous_market_value_base: Option<Decimal>, // Market value as of previous close (in base currency) - For Security holdings
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
            total_cost_basis_base: None, // Added default
            previous_market_value_base: None, // Added default
        }
    }
}

// --- Portfolio Summary Models ---

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountPerformanceMetrics {
    #[serde(with = "decimal_serde_option")]
    pub total_gain_loss_amount: Option<Decimal>, // In Base Currency
    #[serde(with = "decimal_serde_option")]
    pub total_gain_loss_percent: Option<Decimal>, 
    #[serde(with = "decimal_serde_option")]
    pub day_gain_loss_amount: Option<Decimal>, // In Base Currency
    #[serde(with = "decimal_serde_option")]
    pub day_gain_loss_percent: Option<Decimal>,
}


#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummaryView {
    pub account_id: String,
    pub account_name: String,
    pub account_type: String, // Added type
    pub account_group: Option<String>, // Added group for easier access if needed downstream
    pub account_currency: String,
    #[serde(with = "decimal_serde")]
    pub total_value_account_currency: Decimal, // Total value in the account's own currency
    #[serde(with = "decimal_serde")]
    pub total_value_base_currency: Decimal, // Total value converted to the portfolio base currency
    pub base_currency: String, // The base currency used for conversion
    pub performance: AccountPerformanceMetrics, // Aggregated performance for the account (in base currency)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountGroupView {
    pub group_name: String, // Name of the group (or "Uncategorized")
    pub accounts: Vec<AccountSummaryView>, // List of accounts belonging to this group
    #[serde(with = "decimal_serde")]
    pub total_value_base_currency: Decimal, // Sum of total_value_base_currency for all accounts in the group
    pub base_currency: String, // The base currency used for conversion
    pub performance: AccountPerformanceMetrics, // Aggregated performance for the group (in base currency)
     pub account_count: usize, // Number of accounts in the group
} 