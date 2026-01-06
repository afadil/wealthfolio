//! Asset domain models.

use std::borrow::Cow;
use std::sync::Arc;

use chrono::NaiveDateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::errors::Result;
use crate::errors::ValidationError;
use crate::Error;

use super::assets_constants::*;

// Re-export InstrumentId from market-data crate for convenience
pub use wealthfolio_market_data::InstrumentId;

/// Asset behavior classification
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssetKind {
    #[default]
    Security, // Stocks, ETFs, bonds, funds
    Crypto,           // Cryptocurrencies
    Cash,             // Holdable cash position ($CASH-USD)
    FxRate,           // Currency exchange rate (not holdable)
    Option,           // Options contracts
    Commodity,        // Physical commodities (ETFs/futures)
    PrivateEquity,    // Private shares, startup equity
    Property,         // Real estate (any type)
    Vehicle,          // Cars, motorcycles, boats, RVs
    Collectible,      // Art, wine, watches, jewelry, memorabilia
    PhysicalPrecious, // Physical gold/silver bars, coins (not ETFs)
    Liability,        // Debts (mortgages, loans, credit cards)
    Other,            // Catch-all for uncategorized assets
}

/// How the asset is priced
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PricingMode {
    #[default]
    Market,  // Priced via market data providers
    Manual,  // User-entered quotes only
    Derived, // Calculated from other assets (e.g., options from underlying)
    None,    // No pricing needed (e.g., cash is always 1:1)
}

impl PricingMode {
    /// Returns the database string representation (SCREAMING_SNAKE_CASE).
    /// Use this instead of magic strings in SQL queries and database operations.
    pub const fn as_db_str(&self) -> &'static str {
        match self {
            PricingMode::Market => "MARKET",
            PricingMode::Manual => "MANUAL",
            PricingMode::Derived => "DERIVED",
            PricingMode::None => "NONE",
        }
    }
}

/// Option contract specification stored in Asset.metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionSpec {
    pub underlying_asset_id: String,
    pub expiration: chrono::NaiveDate,
    pub right: String, // CALL or PUT
    pub strike: Decimal,
    pub multiplier: Decimal,
    pub occ_symbol: Option<String>,
}

/// Domain model representing an asset in the system
/// Provider-agnostic: no data_source or quote_symbol (use provider_overrides instead)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,

    // Core identity
    pub kind: AssetKind,           // Behavior classification (NOT NULL)
    pub name: Option<String>,
    pub symbol: String,            // Canonical ticker (no provider suffix)

    // Market identity (for SECURITY)
    pub exchange_mic: Option<String>, // ISO 10383 MIC code

    // Currency
    pub currency: String,

    // Pricing configuration
    pub pricing_mode: PricingMode,          // How this asset is priced
    pub preferred_provider: Option<String>, // Provider hint (YAHOO, ALPHA_VANTAGE)
    pub provider_overrides: Option<Value>,  // JSON for per-provider overrides

    // Classification
    pub isin: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,

    // Metadata
    pub notes: Option<String>,
    pub profile: Option<Value>,  // JSON: sectors, countries, website, description
    pub metadata: Option<Value>, // JSON for extensions (OptionSpec, etc.)

    // Status
    #[serde(default = "default_is_active")]
    pub is_active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

fn default_is_active() -> bool {
    true
}

impl AssetKind {
    /// Returns the database string representation (SCREAMING_SNAKE_CASE).
    /// Use this instead of magic strings in SQL queries and database operations.
    pub const fn as_db_str(&self) -> &'static str {
        match self {
            AssetKind::Security => "SECURITY",
            AssetKind::Crypto => "CRYPTO",
            AssetKind::Cash => "CASH",
            AssetKind::FxRate => "FX_RATE",
            AssetKind::Option => "OPTION",
            AssetKind::Commodity => "COMMODITY",
            AssetKind::PrivateEquity => "PRIVATE_EQUITY",
            AssetKind::Property => "PROPERTY",
            AssetKind::Vehicle => "VEHICLE",
            AssetKind::Collectible => "COLLECTIBLE",
            AssetKind::PhysicalPrecious => "PHYSICAL_PRECIOUS",
            AssetKind::Liability => "LIABILITY",
            AssetKind::Other => "OTHER",
        }
    }

    /// Check if this asset kind is an alternative asset (Property, Vehicle, Collectible, etc.)
    /// Alternative assets are excluded from TWR/IRR performance calculations.
    pub fn is_alternative(&self) -> bool {
        matches!(
            self,
            AssetKind::Property
                | AssetKind::Vehicle
                | AssetKind::Collectible
                | AssetKind::PhysicalPrecious
                | AssetKind::Liability
                | AssetKind::Other
        )
    }

    /// Check if this asset kind should be included in investment performance calculations (TWR/IRR).
    /// Only Security, Crypto, Option, Commodity, and PrivateEquity are included.
    pub fn is_investment(&self) -> bool {
        matches!(
            self,
            AssetKind::Security
                | AssetKind::Crypto
                | AssetKind::Option
                | AssetKind::Commodity
                | AssetKind::PrivateEquity
        )
    }

    /// Check if this asset kind is a liability (debts that reduce net worth).
    pub fn is_liability(&self) -> bool {
        matches!(self, AssetKind::Liability)
    }
}

impl Asset {
    /// Check if this asset is holdable (can have positions)
    pub fn is_holdable(&self) -> bool {
        !matches!(self.kind, AssetKind::FxRate)
    }

    /// Check if this asset needs pricing
    pub fn needs_pricing(&self) -> bool {
        self.pricing_mode == PricingMode::Market
    }

    /// Check if this asset is an alternative asset type.
    /// Alternative assets use MANUAL pricing mode for valuations.
    pub fn is_alternative(&self) -> bool {
        self.kind.is_alternative()
    }

    /// Check if this asset is included in investment performance calculations.
    pub fn is_investment(&self) -> bool {
        self.kind.is_investment()
    }

    /// Check if this asset is a liability.
    pub fn is_liability(&self) -> bool {
        self.kind.is_liability()
    }

    /// Get option metadata if this is an option
    pub fn option_spec(&self) -> Option<OptionSpec> {
        if self.kind != AssetKind::Option {
            return None;
        }
        self.metadata
            .as_ref()
            .and_then(|m| m.get("option"))
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    /// Get the kind (backward compat alias)
    pub fn effective_kind(&self) -> AssetKind {
        self.kind.clone()
    }

    /// Convert to canonical instrument for market data resolution.
    /// Returns None for asset kinds that are not resolvable to market data.
    pub fn to_instrument_id(&self) -> Option<InstrumentId> {
        match &self.kind {
            AssetKind::Security => Some(InstrumentId::Equity {
                ticker: Arc::from(self.symbol.as_str()),
                mic: self.exchange_mic.as_ref().map(|s| Cow::Owned(s.clone())),
            }),
            AssetKind::Crypto => Some(InstrumentId::Crypto {
                base: Arc::from(self.symbol.as_str()),
                quote: Cow::Owned(self.currency.clone()),
            }),
            AssetKind::FxRate => {
                // New canonical format: symbol = base currency (EUR), currency = quote (USD)
                // Legacy format: symbol = "EURUSD" or "EURUSD=X"
                // Detect legacy format by checking if symbol contains the currency
                let base = if self.symbol.len() > 3 {
                    // Legacy format - extract base from first 3 chars
                    let base_symbol = self.symbol.strip_suffix("=X").unwrap_or(&self.symbol);
                    base_symbol[..3].to_string()
                } else {
                    // New canonical format - symbol is already the base currency
                    self.symbol.clone()
                };
                Some(InstrumentId::Fx {
                    base: Cow::Owned(base),
                    quote: Cow::Owned(self.currency.clone()),
                })
            }
            AssetKind::Commodity if self.is_precious_metal() => Some(InstrumentId::Metal {
                code: Arc::from(self.symbol.as_str()),
                quote: Cow::Owned(self.currency.clone()),
            }),
            // These kinds are not resolvable to market data
            AssetKind::Cash
            | AssetKind::Option
            | AssetKind::Commodity
            | AssetKind::PrivateEquity
            | AssetKind::Property
            | AssetKind::Vehicle
            | AssetKind::Collectible
            | AssetKind::PhysicalPrecious
            | AssetKind::Liability
            | AssetKind::Other => None,
        }
    }

    /// Check if this asset represents a precious metal commodity
    fn is_precious_metal(&self) -> bool {
        matches!(self.symbol.as_str(), "XAU" | "XAG" | "XPT" | "XPD")
    }
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

/// Input model for creating a new asset
/// Provider-agnostic: no data_source or quote_symbol (use provider_overrides instead)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewAsset {
    pub id: Option<String>,

    // Core identity
    pub kind: AssetKind,             // Behavior classification (NOT NULL)
    pub name: Option<String>,
    pub symbol: String,              // Canonical ticker (no provider suffix)

    // Market identity (for SECURITY)
    pub exchange_mic: Option<String>, // ISO 10383 MIC code

    // Currency
    pub currency: String,

    // Pricing configuration
    pub pricing_mode: PricingMode,          // How this asset is priced
    pub preferred_provider: Option<String>, // Provider hint (YAHOO, ALPHA_VANTAGE)
    pub provider_overrides: Option<Value>,  // JSON for per-provider overrides

    // Classification
    pub isin: Option<String>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,

    // Metadata
    pub notes: Option<String>,
    pub profile: Option<Value>,  // JSON: sectors, countries, website, description
    pub metadata: Option<Value>, // JSON for extensions

    // Status
    #[serde(default = "default_is_active")]
    pub is_active: bool,
}

impl NewAsset {
    /// Validates the new asset data
    pub fn validate(&self) -> Result<()> {
        if self.symbol.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Asset symbol cannot be empty".to_string(),
            )));
        }
        if self.currency.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Currency cannot be empty".to_string(),
            )));
        }
        Ok(())
    }

    /// Creates a new cash asset
    pub fn new_cash_asset(currency: &str) -> Self {
        let asset_id = format!("$CASH-{}", currency);
        Self {
            id: Some(asset_id.clone()),
            kind: AssetKind::Cash,
            symbol: asset_id,
            currency: currency.to_string(),
            pricing_mode: PricingMode::None,
            asset_class: Some(CASH_ASSET_CLASS.to_string()),
            asset_sub_class: Some(CASH_ASSET_CLASS.to_string()),
            is_active: true,
            ..Default::default()
        }
    }

    /// Creates a new FX asset following the canonical format:
    /// - `id`: "EUR/USD" format
    /// - `symbol`: Base currency only (e.g., "EUR")
    /// - `currency`: Quote currency (e.g., "USD")
    /// - `provider_overrides`: Contains provider-specific symbol formats (e.g., "EURUSD=X" for Yahoo)
    pub fn new_fx_asset(base_currency: &str, quote_currency: &str, provider: &str) -> Self {
        // Canonical ID format: EUR/USD
        let asset_id = format!("{}/{}", base_currency, quote_currency);
        let readable_name = format!("{}/{} Exchange Rate", base_currency, quote_currency);
        let notes = format!(
            "Currency pair for converting from {} to {}",
            base_currency, quote_currency
        );

        // Build provider_overrides with provider-specific symbol format
        let provider_overrides = if provider == "YAHOO" {
            Some(serde_json::json!({
                "YAHOO": {
                    "type": "fx_symbol",
                    "symbol": format!("{}{}=X", base_currency, quote_currency)
                }
            }))
        } else if provider == "ALPHA_VANTAGE" {
            Some(serde_json::json!({
                "ALPHA_VANTAGE": {
                    "type": "fx_pair",
                    "from": base_currency,
                    "to": quote_currency
                }
            }))
        } else {
            None
        };

        Self {
            id: Some(asset_id),
            kind: AssetKind::FxRate,
            name: Some(readable_name),
            symbol: base_currency.to_string(), // Base currency only (EUR in EUR/USD)
            currency: quote_currency.to_string(), // Quote currency (USD in EUR/USD)
            pricing_mode: PricingMode::Market,
            preferred_provider: Some(provider.to_string()),
            provider_overrides,
            asset_class: Some(CASH_ASSET_CLASS.to_string()),
            asset_sub_class: Some(CASH_ASSET_CLASS.to_string()),
            notes: Some(notes),
            is_active: true,
            ..Default::default()
        }
    }
}

impl From<crate::market_data::providers::models::AssetProfile> for NewAsset {
    fn from(profile: crate::market_data::providers::models::AssetProfile) -> Self {
        // Build provider_overrides from quote_symbol if different from symbol
        let provider_overrides = profile.quote_symbol.as_ref().and_then(|qs| {
            if qs != &profile.symbol {
                // Store provider-specific symbol in overrides
                Some(serde_json::json!({
                    profile.data_source.clone(): {
                        "type": "equity_symbol",
                        "symbol": qs
                    }
                }))
            } else {
                None
            }
        });

        // Build profile JSON from legacy fields (sectors, countries, url)
        let profile_json = {
            let mut obj = serde_json::Map::new();
            if let Some(ref s) = profile.sectors {
                obj.insert("sectors".to_string(), serde_json::Value::String(s.clone()));
            }
            if let Some(ref c) = profile.countries {
                obj.insert(
                    "countries".to_string(),
                    serde_json::Value::String(c.clone()),
                );
            }
            if let Some(ref u) = profile.url {
                obj.insert("website".to_string(), serde_json::Value::String(u.clone()));
            }
            if obj.is_empty() {
                None
            } else {
                Some(serde_json::Value::Object(obj))
            }
        };

        Self {
            id: profile.id,
            kind: AssetKind::Security, // Default to Security for provider profiles
            name: profile.name,
            symbol: profile.symbol,
            exchange_mic: None,
            currency: profile.currency,
            pricing_mode: PricingMode::Market,
            preferred_provider: Some(profile.data_source),
            provider_overrides,
            isin: profile.isin,
            asset_class: profile.asset_class,
            asset_sub_class: profile.asset_sub_class,
            notes: profile.notes,
            profile: profile_json,
            metadata: None,
            is_active: true,
        }
    }
}

/// Input model for updating an asset profile
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAssetProfile {
    pub symbol: String,
    pub name: Option<String>,
    pub sectors: Option<String>,
    pub countries: Option<String>,
    pub notes: String,
    pub asset_sub_class: Option<String>,
    pub asset_class: Option<String>,
    pub kind: Option<AssetKind>,           // Asset behavior classification
    pub pricing_mode: Option<PricingMode>,
    pub provider_overrides: Option<Value>, // JSON for per-provider overrides
}

/// Optional asset metadata that can be passed during activity creation.
/// Allows users to provide/override asset details inline.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetMetadata {
    pub name: Option<String>,
    pub kind: Option<AssetKind>,
    pub asset_class: Option<String>,
    pub asset_sub_class: Option<String>,
    pub exchange_mic: Option<String>,
}

impl UpdateAssetProfile {
    /// Validates the asset profile update data
    pub fn validate(&self) -> Result<()> {
        if self.symbol.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Asset symbol cannot be empty".to_string(),
            )));
        }
        Ok(())
    }
}

/// Domain model representing a quote summary
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct QuoteSummary {
    pub exchange: String,
    pub short_name: String,
    pub quote_type: String,
    pub symbol: String,
    pub index: String,
    pub score: f64,
    pub type_display: String,
    pub long_name: String,
}
