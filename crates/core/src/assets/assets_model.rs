//! Asset domain models.

use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::Arc;

use chrono::NaiveDateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::errors::Result;
use crate::errors::ValidationError;
use crate::Error;

// Re-export InstrumentId from market-data crate for convenience
pub use wealthfolio_market_data::InstrumentId;

/// Asset behavior classification.
///
/// `kind` is a behavioral category — broad for market instruments, granular for alternatives.
/// Market instruments are all `INVESTMENT`; the `instrument_type` field carries the
/// market-specific classification (EQUITY, CRYPTO, OPTION, etc.).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssetKind {
    #[default]
    Investment, // All tradable, lot-tracked market instruments (stocks, ETFs, crypto, options)
    Property,      // Real estate
    Vehicle,       // Cars, motorcycles, boats, RVs
    Collectible,   // Art, wine, watches, jewelry, memorabilia
    PreciousMetal, // Physical gold/silver bars, coins (not ETFs)
    PrivateEquity, // Private shares, startup equity
    Liability,     // Debts (mortgages, loans, credit cards)
    Other,         // Catch-all for uncategorized assets
    Fx,            // Currency exchange rate (infrastructure, not holdable)
}

/// Market instrument type for provider routing.
///
/// Orthogonal to `kind` — tells the market data system which API/endpoint to use.
/// Only meaningful for `kind=INVESTMENT` or `kind=FX`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InstrumentType {
    Equity, // Stocks, ETFs, bonds, funds, commodity ETFs
    Crypto, // Cryptocurrencies
    Fx,     // Currency exchange rates
    Option, // Options contracts
    Metal,  // Precious metal spot prices (XAU, XAG)
}

/// How the asset is priced/quoted
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QuoteMode {
    #[default]
    Market, // Priced via market data providers
    Manual, // User-entered quotes only
}

impl QuoteMode {
    /// Returns the database string representation (SCREAMING_SNAKE_CASE).
    pub const fn as_db_str(&self) -> &'static str {
        match self {
            QuoteMode::Market => "MARKET",
            QuoteMode::Manual => "MANUAL",
        }
    }
}

impl InstrumentType {
    /// Returns the database string representation (SCREAMING_SNAKE_CASE).
    pub const fn as_db_str(&self) -> &'static str {
        match self {
            InstrumentType::Equity => "EQUITY",
            InstrumentType::Crypto => "CRYPTO",
            InstrumentType::Fx => "FX",
            InstrumentType::Option => "OPTION",
            InstrumentType::Metal => "METAL",
        }
    }

    /// Parses an instrument type from its database string.
    pub fn from_db_str(s: &str) -> Option<Self> {
        match s {
            "EQUITY" => Some(InstrumentType::Equity),
            "CRYPTO" => Some(InstrumentType::Crypto),
            "FX" => Some(InstrumentType::Fx),
            "OPTION" => Some(InstrumentType::Option),
            "METAL" => Some(InstrumentType::Metal),
            _ => None,
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

/// Domain model representing an asset in the system.
///
/// Identity is opaque (UUID). Classification is mutable.
/// Market instrument identity is in `instrument_*` fields.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,

    // Core identity
    pub kind: AssetKind,
    pub name: Option<String>,
    pub display_code: Option<String>, // User-visible ticker/label
    pub notes: Option<String>,
    pub metadata: Option<Value>,

    // Status
    #[serde(default = "default_is_active")]
    pub is_active: bool,

    // Valuation
    pub quote_mode: QuoteMode,
    pub quote_ccy: String, // Currency prices/valuations are quoted in

    // Instrument identity (NULL for non-market assets)
    pub instrument_type: Option<InstrumentType>,
    pub instrument_symbol: Option<String>, // Canonical symbol (AAPL, BTC, EUR)
    pub instrument_exchange_mic: Option<String>, // ISO 10383 MIC (XNAS, XTSE)

    // Computed canonical key (read-only from DB generated column)
    #[serde(skip_deserializing)]
    pub instrument_key: Option<String>,

    // Provider configuration (single JSON blob)
    pub provider_config: Option<Value>,

    // Derived (not stored in DB)
    #[serde(skip_deserializing)]
    pub exchange_name: Option<String>, // Friendly exchange name (derived from MIC)

    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

fn default_is_active() -> bool {
    true
}

impl AssetKind {
    /// Returns the database string representation (SCREAMING_SNAKE_CASE).
    pub const fn as_db_str(&self) -> &'static str {
        match self {
            AssetKind::Investment => "INVESTMENT",
            AssetKind::Property => "PROPERTY",
            AssetKind::Vehicle => "VEHICLE",
            AssetKind::Collectible => "COLLECTIBLE",
            AssetKind::PreciousMetal => "PRECIOUS_METAL",
            AssetKind::PrivateEquity => "PRIVATE_EQUITY",
            AssetKind::Liability => "LIABILITY",
            AssetKind::Other => "OTHER",
            AssetKind::Fx => "FX",
        }
    }

    /// Returns a human-readable display name for the asset kind.
    pub const fn display_name(&self) -> &'static str {
        match self {
            AssetKind::Investment => "Investment",
            AssetKind::Property => "Property",
            AssetKind::Vehicle => "Vehicle",
            AssetKind::Collectible => "Collectible",
            AssetKind::PreciousMetal => "Precious Metal",
            AssetKind::PrivateEquity => "Private Equity",
            AssetKind::Liability => "Liability",
            AssetKind::Other => "Other",
            AssetKind::Fx => "FX Rate",
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
                | AssetKind::PreciousMetal
                | AssetKind::Liability
                | AssetKind::Other
        )
    }

    /// Check if this asset kind should be included in investment performance calculations (TWR/IRR).
    pub fn is_investment(&self) -> bool {
        matches!(self, AssetKind::Investment | AssetKind::PrivateEquity)
    }

    /// Check if this asset kind is a liability (debts that reduce net worth).
    pub fn is_liability(&self) -> bool {
        matches!(self, AssetKind::Liability)
    }

    /// Parses an asset kind from its database string.
    pub fn from_db_str(s: &str) -> Option<Self> {
        match s {
            "INVESTMENT" => Some(AssetKind::Investment),
            "PROPERTY" => Some(AssetKind::Property),
            "VEHICLE" => Some(AssetKind::Vehicle),
            "COLLECTIBLE" => Some(AssetKind::Collectible),
            "PRECIOUS_METAL" => Some(AssetKind::PreciousMetal),
            "PRIVATE_EQUITY" => Some(AssetKind::PrivateEquity),
            "LIABILITY" => Some(AssetKind::Liability),
            "OTHER" => Some(AssetKind::Other),
            "FX" => Some(AssetKind::Fx),
            _ => None,
        }
    }
}

impl Asset {
    /// Enrich the asset with derived fields like exchange_name.
    /// Call this when returning assets to the frontend.
    pub fn enrich(mut self) -> Self {
        self.exchange_name = self
            .instrument_exchange_mic
            .as_ref()
            .and_then(|mic| wealthfolio_market_data::mic_to_exchange_name(mic))
            .map(String::from);
        self
    }

    /// Check if this asset is holdable (can have positions)
    pub fn is_holdable(&self) -> bool {
        !matches!(self.kind, AssetKind::Fx)
    }

    /// Check if this asset needs pricing
    pub fn needs_pricing(&self) -> bool {
        self.quote_mode == QuoteMode::Market
    }

    /// Check if this asset is an alternative asset type.
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

    /// Get option metadata if this is an option (instrument_type = OPTION)
    pub fn option_spec(&self) -> Option<OptionSpec> {
        if self.instrument_type.as_ref() != Some(&InstrumentType::Option) {
            return None;
        }
        self.metadata
            .as_ref()
            .and_then(|m| m.get("option"))
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    /// Convert to canonical instrument for market data resolution.
    /// Returns None for asset kinds that are not resolvable to market data.
    pub fn to_instrument_id(&self) -> Option<InstrumentId> {
        let inst_type = self.instrument_type.as_ref()?;
        let symbol = self.instrument_symbol.as_ref()?;

        match inst_type {
            InstrumentType::Equity => Some(InstrumentId::Equity {
                ticker: Arc::from(symbol.as_str()),
                mic: self
                    .instrument_exchange_mic
                    .as_ref()
                    .map(|s| Cow::Owned(s.clone())),
            }),
            InstrumentType::Crypto => Some(InstrumentId::Crypto {
                base: Arc::from(symbol.as_str()),
                quote: Cow::Owned(self.quote_ccy.clone()),
            }),
            InstrumentType::Fx => Some(InstrumentId::Fx {
                base: Cow::Owned(symbol.clone()),
                quote: Cow::Owned(self.quote_ccy.clone()),
            }),
            InstrumentType::Metal => Some(InstrumentId::Metal {
                code: Arc::from(symbol.as_str()),
                quote: Cow::Owned(self.quote_ccy.clone()),
            }),
            InstrumentType::Option => None, // Options not resolvable to market data yet
        }
    }

    /// Get the preferred provider from provider_config JSON.
    pub fn preferred_provider(&self) -> Option<String> {
        self.provider_config
            .as_ref()
            .and_then(|c| c.get("preferred_provider"))
            .and_then(|v| v.as_str())
            .map(String::from)
    }

    /// Get provider overrides from provider_config JSON.
    pub fn provider_overrides(&self) -> Option<&Value> {
        self.provider_config
            .as_ref()
            .and_then(|c| c.get("overrides"))
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

/// Profile data returned by market data providers.
/// Used to create/enrich assets from external sources.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderProfile {
    pub id: Option<String>,
    pub isin: Option<String>,
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub symbol: String,
    pub quote_symbol: Option<String>, // Symbol for quote fetching (replaces symbol_mapping)
    pub notes: Option<String>,
    pub countries: Option<String>,
    pub categories: Option<String>,
    pub classes: Option<String>,
    pub attributes: Option<String>,
    pub currency: String,
    pub data_source: String,
    pub sectors: Option<String>,
    pub industry: Option<String>,
    pub url: Option<String>,
    // Financial metrics
    pub market_cap: Option<f64>,
    pub pe_ratio: Option<f64>,
    pub dividend_yield: Option<f64>,
    pub week_52_high: Option<f64>,
    pub week_52_low: Option<f64>,
}

/// Input model for creating a new asset.
///
/// If `id` is None, the database generates a UUID.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewAsset {
    pub id: Option<String>,

    // Core identity
    pub kind: AssetKind,
    pub name: Option<String>,
    pub display_code: Option<String>,

    // Status
    #[serde(default = "default_is_active")]
    pub is_active: bool,

    // Valuation
    pub quote_mode: QuoteMode,
    pub quote_ccy: String,

    // Instrument identity (for market assets)
    pub instrument_type: Option<InstrumentType>,
    pub instrument_symbol: Option<String>,
    pub instrument_exchange_mic: Option<String>,

    // Provider configuration
    pub provider_config: Option<Value>,

    // Metadata
    pub notes: Option<String>,
    pub metadata: Option<Value>,
}

impl NewAsset {
    /// Validates the new asset data
    pub fn validate(&self) -> Result<()> {
        if self.quote_ccy.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Currency (quote_ccy) cannot be empty".to_string(),
            )));
        }

        // Investments with MARKET pricing require instrument fields
        if self.kind == AssetKind::Investment && self.quote_mode == QuoteMode::Market {
            if self
                .instrument_symbol
                .as_ref()
                .is_none_or(|s| s.trim().is_empty())
            {
                return Err(Error::Validation(ValidationError::InvalidInput(
                    "Investments with MARKET pricing require an instrument_symbol".to_string(),
                )));
            }
        }

        Ok(())
    }

    /// Creates a new FX asset.
    ///
    /// - `kind`: FX
    /// - `instrument_type`: FX
    /// - `instrument_symbol`: base currency (e.g., "EUR")
    /// - `quote_ccy`: quote currency (e.g., "USD")
    /// - `instrument_key` (generated): "FX:EUR/USD"
    pub fn new_fx_asset(base_currency: &str, quote_currency: &str, provider: &str) -> Self {
        let base_upper = base_currency.to_uppercase();
        let quote_upper = quote_currency.to_uppercase();

        let readable_name = format!("{}/{} Exchange Rate", base_upper, quote_upper);
        let display = format!("{}/{}", base_upper, quote_upper);

        let provider_config = if provider == "YAHOO" {
            Some(serde_json::json!({
                "preferred_provider": "YAHOO",
                "overrides": {
                    "YAHOO": {
                        "type": "fx_symbol",
                        "symbol": format!("{}{}=X", base_upper, quote_upper)
                    }
                }
            }))
        } else if provider == "ALPHA_VANTAGE" {
            Some(serde_json::json!({
                "preferred_provider": "ALPHA_VANTAGE",
                "overrides": {
                    "ALPHA_VANTAGE": {
                        "type": "fx_pair",
                        "from": base_upper,
                        "to": quote_upper
                    }
                }
            }))
        } else {
            Some(serde_json::json!({ "preferred_provider": provider }))
        };

        Self {
            id: None, // DB generates UUID
            kind: AssetKind::Fx,
            name: Some(readable_name),
            display_code: Some(display),
            quote_mode: QuoteMode::Market,
            quote_ccy: quote_upper,
            instrument_type: Some(InstrumentType::Fx),
            instrument_symbol: Some(base_upper),
            instrument_exchange_mic: None,
            provider_config,
            notes: None,
            is_active: true,
            ..Default::default()
        }
    }
}

impl From<ProviderProfile> for NewAsset {
    fn from(profile: ProviderProfile) -> Self {
        // Build provider_config from profile
        let mut config = serde_json::Map::new();

        // Set preferred_provider
        let data_source = profile.data_source.clone();
        if matches!(
            data_source.as_str(),
            "YAHOO" | "ALPHA_VANTAGE" | "MARKETDATA_APP" | "METAL_PRICE_API"
        ) {
            config.insert(
                "preferred_provider".to_string(),
                Value::String(data_source.clone()),
            );
        }

        // Build overrides if quote_symbol differs from symbol
        if let Some(ref qs) = profile.quote_symbol {
            if qs != &profile.symbol {
                let overrides = serde_json::json!({
                    data_source.clone(): {
                        "type": "equity_symbol",
                        "symbol": qs
                    }
                });
                config.insert("overrides".to_string(), overrides);
            }
        }

        let provider_config = if config.is_empty() {
            None
        } else {
            Some(Value::Object(config))
        };

        // Build metadata.identifiers from provider profile (only ISIN for now)
        let metadata = profile
            .isin
            .as_ref()
            .filter(|isin| !isin.is_empty())
            .map(|isin| serde_json::json!({ "identifiers": { "isin": isin } }));

        Self {
            id: profile.id,
            kind: AssetKind::Investment,
            name: profile.name,
            display_code: Some(profile.symbol.clone()),
            quote_mode: QuoteMode::Market,
            quote_ccy: profile.currency,
            instrument_type: Some(InstrumentType::Equity), // Default; caller can override
            instrument_symbol: Some(profile.symbol),
            instrument_exchange_mic: None,
            provider_config,
            notes: profile.notes,
            metadata,
            is_active: true,
        }
    }
}

/// Input model for updating an asset profile
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAssetProfile {
    pub name: Option<String>,
    pub display_code: Option<String>,
    pub notes: String,
    pub kind: Option<AssetKind>,
    pub quote_mode: Option<QuoteMode>,
    pub instrument_type: Option<InstrumentType>,
    pub instrument_symbol: Option<String>,
    pub instrument_exchange_mic: Option<String>,
    pub provider_config: Option<Value>,
    pub metadata: Option<Value>,
}

/// Optional asset metadata that can be passed during activity creation.
/// Allows users to provide/override asset details inline.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetMetadata {
    pub name: Option<String>,
    pub kind: Option<AssetKind>,
    pub instrument_exchange_mic: Option<String>,
    pub instrument_symbol: Option<String>,
    pub instrument_type: Option<InstrumentType>,
    pub display_code: Option<String>,
}

impl UpdateAssetProfile {
    /// Validates the asset profile update data
    pub fn validate(&self) -> Result<()> {
        Ok(())
    }
}

/// Specification for ensuring an asset exists.
/// Used by `ensure_assets()` to batch-create missing assets.
#[derive(Debug, Clone)]
pub struct AssetSpec {
    /// Optional pre-assigned ID. If None, DB generates UUID.
    pub id: Option<String>,
    /// Display code (user-visible ticker)
    pub display_code: Option<String>,
    /// Instrument symbol for market data
    pub instrument_symbol: Option<String>,
    /// Exchange MIC code for securities
    pub instrument_exchange_mic: Option<String>,
    /// Instrument type for routing
    pub instrument_type: Option<InstrumentType>,
    /// Currency for quotes/valuations
    pub quote_ccy: String,
    /// Asset kind
    pub kind: AssetKind,
    /// Optional quote mode override
    pub quote_mode: Option<QuoteMode>,
    /// User-provided name
    pub name: Option<String>,
}

impl AssetSpec {
    /// Computes the instrument_key that would be generated for this spec's instrument fields.
    /// Mirrors the DB GENERATED STORED column:
    ///   - Crypto/FX: `{TYPE}:{SYMBOL}/{QUOTE_CCY}`
    ///   - With MIC:  `{TYPE}:{SYMBOL}@{MIC}`
    ///   - Bare:      `{TYPE}:{SYMBOL}`
    pub fn instrument_key(&self) -> Option<String> {
        let instrument_type = self.instrument_type.as_ref()?;
        let instrument_symbol = self.instrument_symbol.as_ref()?;
        if instrument_symbol.is_empty() {
            return None;
        }
        match instrument_type {
            InstrumentType::Crypto | InstrumentType::Fx => Some(format!(
                "{}:{}/{}",
                instrument_type.as_db_str(),
                instrument_symbol.to_uppercase(),
                self.quote_ccy.to_uppercase()
            )),
            _ => match self
                .instrument_exchange_mic
                .as_ref()
                .filter(|s| !s.is_empty())
            {
                Some(mic) => Some(format!(
                    "{}:{}@{}",
                    instrument_type.as_db_str(),
                    instrument_symbol.to_uppercase(),
                    mic.to_uppercase()
                )),
                None => Some(format!(
                    "{}:{}",
                    instrument_type.as_db_str(),
                    instrument_symbol.to_uppercase()
                )),
            },
        }
    }
}

/// Result of ensuring assets exist via `ensure_assets()`.
#[derive(Debug, Default)]
pub struct EnsureAssetsResult {
    /// All assets (existing + created), keyed by asset ID
    pub assets: HashMap<String, Asset>,
    /// IDs of newly created assets
    pub created_ids: Vec<String>,
    /// Merge candidates: (resolved_id, unknown_id) pairs where UNKNOWN was merged into resolved
    pub merge_candidates: Vec<(String, String)>,
}
