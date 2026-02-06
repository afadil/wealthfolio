//! Asset domain models.

use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::Arc;

use chrono::NaiveDateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::canonical_asset_id;
use crate::errors::Result;
use crate::errors::ValidationError;
use crate::Error;

// Re-export InstrumentId from market-data crate for convenience
pub use wealthfolio_market_data::InstrumentId;

/// Asset behavior classification
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssetKind {
    #[default]
    Security, // Stocks, ETFs, bonds, funds
    Crypto,           // Cryptocurrencies
    Cash,             // Holdable cash position (CASH:USD)
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
    Market, // Priced via market data providers
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
/// Classification is handled via taxonomy system, not legacy fields
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,

    // Core identity
    pub kind: AssetKind, // Behavior classification (NOT NULL)
    pub name: Option<String>,
    pub symbol: String, // Canonical ticker (no provider suffix)

    // Market identity (for SECURITY)
    pub exchange_mic: Option<String>, // ISO 10383 MIC code
    #[serde(skip_deserializing)]
    pub exchange_name: Option<String>, // Friendly exchange name (derived from MIC)

    // Currency
    pub currency: String,

    // Pricing configuration
    pub pricing_mode: PricingMode,          // How this asset is priced
    pub preferred_provider: Option<String>, // Provider hint (YAHOO, ALPHA_VANTAGE)
    pub provider_overrides: Option<Value>,  // JSON for per-provider overrides

    // Metadata
    pub notes: Option<String>,
    pub metadata: Option<Value>, // JSON for extensions (OptionSpec, identifiers like ISIN, etc.)

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

    /// Returns a human-readable display name for the asset kind.
    /// Used for UI display (e.g., "Property", "Vehicle", "Precious Metal").
    pub const fn display_name(&self) -> &'static str {
        match self {
            AssetKind::Security => "Security",
            AssetKind::Crypto => "Crypto",
            AssetKind::Cash => "Cash",
            AssetKind::FxRate => "FX Rate",
            AssetKind::Option => "Option",
            AssetKind::Commodity => "Commodity",
            AssetKind::PrivateEquity => "Private Equity",
            AssetKind::Property => "Property",
            AssetKind::Vehicle => "Vehicle",
            AssetKind::Collectible => "Collectible",
            AssetKind::PhysicalPrecious => "Precious Metal",
            AssetKind::Liability => "Liability",
            AssetKind::Other => "Other",
        }
    }

    /// Returns the ID prefix for canonical asset ID format.
    ///
    /// All asset IDs use typed prefixes: `{PREFIX}:{symbol}:{qualifier}`
    ///
    /// # Examples
    ///
    /// ```
    /// use wealthfolio_core::assets::AssetKind;
    ///
    /// assert_eq!(AssetKind::Security.id_prefix(), "SEC");
    /// assert_eq!(AssetKind::Crypto.id_prefix(), "CRYPTO");
    /// assert_eq!(AssetKind::Cash.id_prefix(), "CASH");
    /// ```
    pub const fn id_prefix(&self) -> &'static str {
        match self {
            AssetKind::Security => "SEC",
            AssetKind::Crypto => "CRYPTO",
            AssetKind::Cash => "CASH",
            AssetKind::FxRate => "FX",
            AssetKind::Option => "OPT",
            AssetKind::Commodity => "CMDTY",
            AssetKind::PrivateEquity => "PEQ",
            AssetKind::Property => "PROP",
            AssetKind::Vehicle => "VEH",
            AssetKind::Collectible => "COLL",
            AssetKind::PhysicalPrecious => "PREC",
            AssetKind::Liability => "LIAB",
            AssetKind::Other => "ALT",
        }
    }

    /// Parses an asset kind from an ID prefix.
    ///
    /// Returns `None` if the prefix is not recognized.
    ///
    /// # Examples
    ///
    /// ```
    /// use wealthfolio_core::assets::AssetKind;
    ///
    /// assert_eq!(AssetKind::from_id_prefix("SEC"), Some(AssetKind::Security));
    /// assert_eq!(AssetKind::from_id_prefix("CRYPTO"), Some(AssetKind::Crypto));
    /// assert_eq!(AssetKind::from_id_prefix("INVALID"), None);
    /// ```
    pub fn from_id_prefix(prefix: &str) -> Option<Self> {
        match prefix {
            "SEC" => Some(AssetKind::Security),
            "CRYPTO" => Some(AssetKind::Crypto),
            "CASH" => Some(AssetKind::Cash),
            "FX" => Some(AssetKind::FxRate),
            "OPT" => Some(AssetKind::Option),
            "CMDTY" => Some(AssetKind::Commodity),
            "PEQ" => Some(AssetKind::PrivateEquity),
            "PROP" => Some(AssetKind::Property),
            "VEH" => Some(AssetKind::Vehicle),
            "COLL" => Some(AssetKind::Collectible),
            "PREC" => Some(AssetKind::PhysicalPrecious),
            "LIAB" => Some(AssetKind::Liability),
            "ALT" => Some(AssetKind::Other),
            _ => None,
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
    /// Enrich the asset with derived fields like exchange_name.
    /// Call this when returning assets to the frontend.
    pub fn enrich(mut self) -> Self {
        self.exchange_name = self
            .exchange_mic
            .as_ref()
            .and_then(|mic| wealthfolio_market_data::mic_to_exchange_name(mic))
            .map(String::from);
        self
    }

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

/// Input model for creating a new asset
/// Provider-agnostic: no data_source or quote_symbol (use provider_overrides instead)
/// Classification is handled via taxonomy system, not legacy fields
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewAsset {
    pub id: Option<String>,

    // Core identity
    pub kind: AssetKind, // Behavior classification (NOT NULL)
    pub name: Option<String>,
    pub symbol: String, // Canonical ticker (no provider suffix)

    // Market identity (for SECURITY)
    pub exchange_mic: Option<String>, // ISO 10383 MIC code

    // Currency
    pub currency: String,

    // Pricing configuration
    pub pricing_mode: PricingMode,          // How this asset is priced
    pub preferred_provider: Option<String>, // Provider hint (YAHOO, ALPHA_VANTAGE)
    pub provider_overrides: Option<Value>,  // JSON for per-provider overrides

    // Metadata
    pub notes: Option<String>,
    pub metadata: Option<Value>, // JSON for extensions (OptionSpec, identifiers like ISIN, etc.)

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

        // Securities with MARKET pricing require exchange_mic for proper identification
        // This ensures unique identification via the SEC:{symbol}:{exchange_mic} format
        if self.kind == AssetKind::Security
            && self.pricing_mode == PricingMode::Market
            && self
                .exchange_mic
                .as_ref()
                .is_none_or(|mic| mic.trim().is_empty())
        {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Securities with MARKET pricing require an exchange MIC code (e.g., XNAS, XNYS)"
                    .to_string(),
            )));
        }

        Ok(())
    }

    /// Creates a new cash asset.
    ///
    /// Uses canonical ID format: `CASH:{currency}` (e.g., "CASH:USD")
    pub fn new_cash_asset(currency: &str) -> Self {
        let currency_upper = currency.to_uppercase();
        let asset_id = canonical_asset_id(&AssetKind::Cash, &currency_upper, None, &currency_upper);
        Self {
            id: Some(asset_id),
            kind: AssetKind::Cash,
            symbol: currency_upper.clone(), // Symbol is just the currency code
            currency: currency_upper,
            pricing_mode: PricingMode::None,
            is_active: true,
            ..Default::default()
        }
    }

    /// Creates a new FX asset following the canonical format:
    /// - `id`: "FX:EUR:USD" format (FX:base:quote)
    /// - `symbol`: Base currency only (e.g., "EUR")
    /// - `currency`: Quote currency (e.g., "USD")
    /// - `provider_overrides`: Contains provider-specific symbol formats (e.g., "EURUSD=X" for Yahoo)
    pub fn new_fx_asset(base_currency: &str, quote_currency: &str, provider: &str) -> Self {
        let base_upper = base_currency.to_uppercase();
        let quote_upper = quote_currency.to_uppercase();

        // Canonical ID format: FX:EUR:USD
        let asset_id = canonical_asset_id(&AssetKind::FxRate, &base_upper, None, &quote_upper);
        let readable_name = format!("{}/{} Exchange Rate", base_upper, quote_upper);
        let notes = format!(
            "Currency pair for converting from {} to {}",
            base_upper, quote_upper
        );

        // Build provider_overrides with provider-specific symbol format
        let provider_overrides = if provider == "YAHOO" {
            Some(serde_json::json!({
                "YAHOO": {
                    "type": "fx_symbol",
                    "symbol": format!("{}{}=X", base_upper, quote_upper)
                }
            }))
        } else if provider == "ALPHA_VANTAGE" {
            Some(serde_json::json!({
                "ALPHA_VANTAGE": {
                    "type": "fx_pair",
                    "from": base_upper,
                    "to": quote_upper
                }
            }))
        } else {
            None
        };

        Self {
            id: Some(asset_id),
            kind: AssetKind::FxRate,
            name: Some(readable_name),
            symbol: base_upper,    // Base currency only (EUR in EUR:USD)
            currency: quote_upper, // Quote currency (USD in EUR:USD)
            pricing_mode: PricingMode::Market,
            preferred_provider: Some(provider.to_string()),
            provider_overrides,
            notes: Some(notes),
            is_active: true,
            ..Default::default()
        }
    }
}

impl From<ProviderProfile> for NewAsset {
    fn from(profile: ProviderProfile) -> Self {
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

        // Build metadata.identifiers from provider profile (only ISIN for now)
        let metadata = profile
            .isin
            .as_ref()
            .filter(|isin| !isin.is_empty())
            .map(|isin| serde_json::json!({ "identifiers": { "isin": isin } }));

        Self {
            id: profile.id,
            kind: AssetKind::Security, // Default to Security for provider profiles
            name: profile.name,
            symbol: profile.symbol,
            exchange_mic: None,
            currency: profile.currency,
            pricing_mode: PricingMode::Market,
            preferred_provider: Some(profile.data_source.clone()),
            provider_overrides,
            notes: profile.notes,
            metadata,
            is_active: true,
        }
    }
}

/// Input model for updating an asset profile
/// Classification (asset_class, sectors, countries) is now handled via taxonomy system
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAssetProfile {
    pub symbol: String,
    pub name: Option<String>,
    pub notes: String,
    pub kind: Option<AssetKind>,      // Asset behavior classification
    pub exchange_mic: Option<String>, // ISO 10383 MIC code
    pub pricing_mode: Option<PricingMode>,
    pub provider_overrides: Option<Value>, // JSON for per-provider overrides
    pub metadata: Option<Value>, // JSON for provider profile data (sector, industry, etc.)
}

/// Optional asset metadata that can be passed during activity creation.
/// Allows users to provide/override asset details inline.
/// Classification is handled via taxonomy system, not here.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetMetadata {
    pub name: Option<String>,
    pub kind: Option<AssetKind>,
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

/// Specification for ensuring an asset exists.
/// Used by `ensure_assets()` to batch-create missing assets.
#[derive(Debug, Clone)]
pub struct AssetSpec {
    /// Canonical asset ID (e.g., "SEC:AAPL:XNAS")
    pub id: String,
    /// The symbol/ticker
    pub symbol: String,
    /// Exchange MIC code for securities
    pub exchange_mic: Option<String>,
    /// Currency for the asset
    pub currency: String,
    /// Asset kind (Security, Crypto, etc.)
    pub kind: AssetKind,
    /// Optional pricing mode override
    pub pricing_mode: Option<PricingMode>,
    /// User-provided name
    pub name: Option<String>,
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
