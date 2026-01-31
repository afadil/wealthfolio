//! Asset ID generation, parsing, and validation.
//!
//! This module provides utilities for generating, parsing, and validating asset IDs
//! using a canonical typed prefix format: `{TYPE}:{symbol}:{qualifier}`
//!
//! ## Canonical ID Format (New)
//!
//! All asset IDs use typed prefixes to make asset kind explicit:
//!
//! | Asset Kind | Prefix | Format | Example |
//! |------------|--------|--------|---------|
//! | Security | `SEC` | `SEC:{symbol}:{mic}` | `SEC:AAPL:XNAS` |
//! | Crypto | `CRYPTO` | `CRYPTO:{symbol}:{quote}` | `CRYPTO:BTC:USD` |
//! | FX Rate | `FX` | `FX:{base}:{quote}` | `FX:EUR:USD` |
//! | Cash | `CASH` | `CASH:{currency}` | `CASH:CAD` |
//! | Option | `OPT` | `OPT:{symbol}:{mic}` | `OPT:AAPL240119C00150000:XNAS` |
//! | Commodity | `CMDTY` | `CMDTY:{symbol}` | `CMDTY:GC` |
//! | Private Equity | `PEQ` | `PEQ:{random}` | `PEQ:a1b2c3d4` |
//! | Property | `PROP` | `PROP:{random}` | `PROP:a1b2c3d4` |
//! | Vehicle | `VEH` | `VEH:{random}` | `VEH:x9y8z7w6` |
//! | Collectible | `COLL` | `COLL:{random}` | `COLL:m3n4o5p6` |
//! | Precious Metal | `PREC` | `PREC:{random}` | `PREC:g1h2i3j4` |
//! | Liability | `LIAB` | `LIAB:{random}` | `LIAB:q7r8s9t0` |
//! | Other | `ALT` | `ALT:{random}` | `ALT:u1v2w3x4` |
//!
//! ## Examples
//!
//! ```
//! use wealthfolio_core::assets::{AssetKind, canonical_asset_id, kind_from_asset_id};
//!
//! // Generate canonical IDs
//! let sec_id = canonical_asset_id(&AssetKind::Security, "AAPL", Some("XNAS"), "USD");
//! assert_eq!(sec_id, "SEC:AAPL:XNAS");
//!
//! let crypto_id = canonical_asset_id(&AssetKind::Crypto, "BTC", None, "USD");
//! assert_eq!(crypto_id, "CRYPTO:BTC:USD");
//!
//! // Parse kind from ID
//! assert_eq!(kind_from_asset_id("SEC:AAPL:XNAS"), Some(AssetKind::Security));
//! assert_eq!(kind_from_asset_id("CRYPTO:BTC:USD"), Some(AssetKind::Crypto));
//! ```

use super::AssetKind;
use rand::Rng;
use regex::Regex;
use std::sync::LazyLock;
use wealthfolio_market_data::{strip_yahoo_suffix, yahoo_suffix_to_mic, YAHOO_EXCHANGE_SUFFIXES};

// ============================================================================
// CONSTANTS
// ============================================================================

/// The delimiter used in all asset IDs (colon)
pub const ASSET_ID_DELIMITER: char = ':';

// Typed prefixes for canonical asset IDs
/// Prefix for Security assets (stocks, ETFs, bonds)
pub const SECURITY_PREFIX: &str = "SEC";
/// Prefix for Crypto assets
pub const CRYPTO_PREFIX: &str = "CRYPTO";
/// Prefix for Cash assets
pub const CASH_PREFIX: &str = "CASH";
/// Prefix for FX Rate assets
pub const FX_PREFIX: &str = "FX";
/// Prefix for Option assets
pub const OPTION_PREFIX: &str = "OPT";
/// Prefix for Commodity assets
pub const COMMODITY_PREFIX: &str = "CMDTY";
/// Prefix for Private Equity assets
pub const PRIVATE_EQUITY_PREFIX: &str = "PEQ";
/// Prefix for Property assets
pub const PROPERTY_PREFIX: &str = "PROP";
/// Prefix for Vehicle assets
pub const VEHICLE_PREFIX: &str = "VEH";
/// Prefix for Collectible assets
pub const COLLECTIBLE_PREFIX: &str = "COLL";
/// Prefix for PhysicalPrecious (precious metals) assets
pub const PRECIOUS_PREFIX: &str = "PREC";
/// Prefix for Liability assets
pub const LIABILITY_PREFIX: &str = "LIAB";
/// Prefix for Other (catch-all) assets
pub const OTHER_PREFIX: &str = "ALT";

/// Parse crypto pair symbols like "BTC-USD" or "BTC-USDT" into (base, quote).
/// Returns None if the symbol doesn't match the expected pair pattern.
pub fn parse_crypto_pair_symbol(symbol: &str) -> Option<(String, String)> {
    let trimmed = symbol.trim();
    let (base, quote) = trimmed.rsplit_once('-')?;
    let base = base.trim();
    let quote = quote.trim();
    if base.is_empty() || quote.is_empty() {
        return None;
    }
    let quote_upper = quote.to_uppercase();
    let quote_len = quote_upper.len();
    if !(3..=5).contains(&quote_len) || !quote_upper.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    Some((base.to_string(), quote_upper))
}

/// Checks if an asset ID represents a cash asset.
/// Format: `CASH:{currency}` (e.g., `CASH:USD`)
pub fn is_cash_asset_id(asset_id: &str) -> bool {
    asset_id.starts_with("CASH:")
}

/// Checks if an asset ID represents an FX rate asset.
/// Format: `FX:{base}:{quote}` (e.g., `FX:EUR:USD`)
pub fn is_fx_asset_id(asset_id: &str) -> bool {
    asset_id.starts_with("FX:")
}

/// Checks if an asset ID represents an asset that needs market data quotes.
///
/// Returns `true` for:
/// - Securities (SEC:) - Crypto (CRYPTO:) - Options (OPT:) - Commodities (CMDTY:)
///
/// Returns `false` for:
/// - Cash (CASH:) - FX rates (FX:) - Alternative assets - Private Equity (PEQ:)
pub fn needs_market_quotes(asset_id: &str) -> bool {
    asset_id.starts_with("SEC:")
        || asset_id.starts_with("CRYPTO:")
        || asset_id.starts_with("OPT:")
        || asset_id.starts_with("CMDTY:")
}

/// Determines if an asset should be enriched with profile data from providers.
/// Only enriches market-priced assets (securities, crypto, options).
pub fn should_enrich_asset(asset_id: &str) -> bool {
    asset_id.starts_with("SEC:") || asset_id.starts_with("CRYPTO:") || asset_id.starts_with("OPT:")
}

/// Length of the random portion of alternative asset IDs
const RANDOM_ID_LENGTH: usize = 8;

/// Alphabet for generating random IDs (alphanumeric: a-z, A-Z, 0-9)
const ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// Regex pattern for validating alternative asset IDs
/// Format: ^(PROP|VEH|COLL|PREC|LIAB|ALT):[a-zA-Z0-9]{8}$
static ALTERNATIVE_ASSET_ID_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(PROP|VEH|COLL|PREC|LIAB|ALT):[a-zA-Z0-9]{8}$").unwrap());

// ============================================================================
// PARSED ASSET ID
// ============================================================================

/// Represents a parsed asset ID with its components.
///
/// For canonical format IDs like `SEC:AAPL:XNAS`:
/// - `kind`: The asset kind from the prefix (e.g., `AssetKind::Security`)
/// - `symbol`: The symbol/ticker (e.g., "AAPL")
/// - `qualifier`: The qualifier (e.g., "XNAS" for MIC, "USD" for quote currency)
/// - `primary`: The prefix (e.g., "SEC")
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedAssetId {
    /// The prefix (e.g., "SEC", "CRYPTO", "CASH")
    pub primary: String,
    /// The qualifier component (exchange MIC, quote currency, or random suffix)
    pub qualifier: String,
    /// The asset kind from the prefix
    pub kind: Option<AssetKind>,
    /// The symbol extracted from the ID
    pub symbol: String,
}

// ============================================================================
// ID CONSTRUCTORS
// ============================================================================

/// Creates an alternative asset ID from a prefix and nanoid.
///
/// This is typically used internally when generating new alternative asset IDs.
///
/// # Arguments
///
/// * `prefix` - The asset type prefix (e.g., "PROP", "VEH")
/// * `nanoid` - The unique identifier portion
///
/// # Returns
///
/// An alternative asset ID in the format `{prefix}:{nanoid}`
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::alternative_id;
///
/// assert_eq!(alternative_id("PROP", "a1b2c3d4"), "PROP:a1b2c3d4");
/// assert_eq!(alternative_id("VEH", "x9y8z7w6"), "VEH:x9y8z7w6");
/// ```
pub fn alternative_id(prefix: &str, nanoid: &str) -> String {
    format!("{}{}{}", prefix, ASSET_ID_DELIMITER, nanoid)
}

// ============================================================================
// CANONICAL ID GENERATION (New Typed Prefix Format)
// ============================================================================

/// Generates a random 8-character alphanumeric suffix for alternative asset IDs.
///
/// Uses `rand` crate with uniform distribution for unbiased character selection.
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::random_suffix;
///
/// let suffix = random_suffix();
/// assert_eq!(suffix.len(), 8);
/// assert!(suffix.chars().all(|c| c.is_ascii_alphanumeric()));
/// ```
pub fn random_suffix() -> String {
    let mut rng = rand::thread_rng();
    (0..RANDOM_ID_LENGTH)
        .map(|_| {
            let idx = rng.gen_range(0..ALPHABET.len());
            ALPHABET[idx] as char
        })
        .collect()
}

/// Generate canonical asset ID with typed prefix.
///
/// All asset IDs use the format: `{TYPE}:{symbol}:{qualifier}` where TYPE is a
/// typed prefix that makes the asset kind explicit.
///
/// # Arguments
///
/// * `kind` - The asset kind (determines the prefix)
/// * `symbol` - The symbol/ticker (e.g., "AAPL", "BTC", "EUR")
/// * `exchange_mic` - Optional exchange MIC code for securities/options
/// * `currency` - The currency (used as quote currency for crypto/FX, or for cash)
///
/// # Returns
///
/// A canonical asset ID string with typed prefix.
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::{AssetKind, canonical_asset_id};
///
/// // Securities: SEC:{symbol}:{mic}
/// assert_eq!(
///     canonical_asset_id(&AssetKind::Security, "AAPL", Some("XNAS"), "USD"),
///     "SEC:AAPL:XNAS"
/// );
///
/// // Crypto: CRYPTO:{symbol}:{quote}
/// assert_eq!(
///     canonical_asset_id(&AssetKind::Crypto, "BTC", None, "USD"),
///     "CRYPTO:BTC:USD"
/// );
///
/// // FX: FX:{base}:{quote}
/// assert_eq!(
///     canonical_asset_id(&AssetKind::FxRate, "EUR", None, "USD"),
///     "FX:EUR:USD"
/// );
///
/// // Cash: CASH:{currency}
/// assert_eq!(
///     canonical_asset_id(&AssetKind::Cash, "CAD", None, "CAD"),
///     "CASH:CAD"
/// );
/// ```
pub fn canonical_asset_id(
    kind: &AssetKind,
    symbol: &str,
    exchange_mic: Option<&str>,
    currency: &str,
) -> String {
    let raw_sym = symbol.trim();
    let sym = raw_sym.to_uppercase();
    let ccy = currency.trim().to_uppercase();

    match kind {
        AssetKind::Cash => format!("{}:{}", CASH_PREFIX, ccy),

        AssetKind::FxRate => {
            // sym is base (EUR), ccy is quote (USD)
            format!("{}:{}:{}", FX_PREFIX, sym, ccy)
        }

        AssetKind::Crypto => {
            // BTC:USD - include quote currency
            // If a provider returns a pair symbol like "BTC-USD", normalize to base "BTC"
            // and use the quote currency from the symbol (asset currency).
            let (base_sym, quote_ccy) = parse_crypto_pair_symbol(raw_sym)
                .map(|(base, quote)| (base.to_uppercase(), quote))
                .unwrap_or((sym, ccy));
            format!("{}:{}:{}", CRYPTO_PREFIX, base_sym, quote_ccy)
        }

        AssetKind::Security => {
            let mic = exchange_mic
                .map(|m| m.trim().to_uppercase())
                .unwrap_or_else(|| "UNKNOWN".to_string());
            format!("{}:{}:{}", SECURITY_PREFIX, sym, mic)
        }

        AssetKind::Option => {
            let mic = exchange_mic
                .map(|m| m.trim().to_uppercase())
                .unwrap_or_else(|| "UNKNOWN".to_string());
            format!("{}:{}:{}", OPTION_PREFIX, sym, mic)
        }

        AssetKind::Commodity => format!("{}:{}", COMMODITY_PREFIX, sym),

        AssetKind::PrivateEquity => format!("{}:{}", PRIVATE_EQUITY_PREFIX, random_suffix()),
        AssetKind::Property => format!("{}:{}", PROPERTY_PREFIX, random_suffix()),
        AssetKind::Vehicle => format!("{}:{}", VEHICLE_PREFIX, random_suffix()),
        AssetKind::Collectible => format!("{}:{}", COLLECTIBLE_PREFIX, random_suffix()),
        AssetKind::PhysicalPrecious => format!("{}:{}", PRECIOUS_PREFIX, random_suffix()),
        AssetKind::Liability => format!("{}:{}", LIABILITY_PREFIX, random_suffix()),
        AssetKind::Other => format!("{}:{}", OTHER_PREFIX, random_suffix()),
    }
}

/// Parses a symbol that may contain a Yahoo Finance exchange suffix and extracts
/// the base symbol and exchange MIC.
///
/// Yahoo Finance uses suffixes like `.TO` (Toronto), `.L` (London), `.DE` (XETRA)
/// to indicate the exchange. This function strips the suffix and maps it to the
/// canonical MIC (Market Identifier Code).
///
/// # Arguments
///
/// * `symbol` - The symbol potentially with a Yahoo suffix (e.g., "SHOP.TO", "VOD.L", "AAPL")
///
/// # Returns
///
/// A tuple of (base_symbol, Option<mic>):
/// - `base_symbol`: The symbol without the suffix (e.g., "SHOP", "VOD", "AAPL")
/// - `mic`: The exchange MIC if a known suffix was found (e.g., Some("XTSE"), Some("XLON"), None)
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::parse_symbol_with_exchange_suffix;
///
/// // Toronto Stock Exchange
/// let (symbol, mic) = parse_symbol_with_exchange_suffix("SHOP.TO");
/// assert_eq!(symbol, "SHOP");
/// assert_eq!(mic, Some("XTSE"));
///
/// // London Stock Exchange
/// let (symbol, mic) = parse_symbol_with_exchange_suffix("VOD.L");
/// assert_eq!(symbol, "VOD");
/// assert_eq!(mic, Some("XLON"));
///
/// // US stocks (no suffix)
/// let (symbol, mic) = parse_symbol_with_exchange_suffix("AAPL");
/// assert_eq!(symbol, "AAPL");
/// assert_eq!(mic, None);
///
/// // Share class suffixes (not exchange suffixes) are preserved
/// let (symbol, mic) = parse_symbol_with_exchange_suffix("BRK.B");
/// assert_eq!(symbol, "BRK.B");
/// assert_eq!(mic, None);
/// ```
pub fn parse_symbol_with_exchange_suffix(symbol: &str) -> (&str, Option<&'static str>) {
    let base_symbol = strip_yahoo_suffix(symbol);

    // Find the suffix and map to MIC
    let mic = YAHOO_EXCHANGE_SUFFIXES
        .iter()
        .find(|suffix| symbol.ends_with(*suffix))
        .and_then(|suffix| {
            // Extract suffix without the dot (e.g., ".TO" → "TO")
            let suffix_without_dot = &suffix[1..];
            yahoo_suffix_to_mic(suffix_without_dot)
        });

    (base_symbol, mic)
}

/// Generates a canonical security asset ID from a symbol that may contain
/// a Yahoo Finance exchange suffix.
///
/// This is a convenience function that combines `parse_symbol_with_exchange_suffix`
/// and `canonical_asset_id` for the common case of creating a security asset ID
/// from a user-provided symbol.
///
/// # Arguments
///
/// * `symbol` - The symbol potentially with a Yahoo suffix (e.g., "SHOP.TO", "AAPL")
/// * `currency` - The currency for the asset
///
/// # Returns
///
/// A canonical asset ID string (e.g., "SEC:SHOP:XTSE", "SEC:AAPL:UNKNOWN")
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::security_id_from_symbol;
///
/// // With exchange suffix
/// let id = security_id_from_symbol("META.TO", "CAD");
/// assert_eq!(id, "SEC:META:XTSE");
///
/// // Without exchange suffix (uses UNKNOWN)
/// let id = security_id_from_symbol("AAPL", "USD");
/// assert_eq!(id, "SEC:AAPL:UNKNOWN");
/// ```
pub fn security_id_from_symbol(symbol: &str, currency: &str) -> String {
    let (base_symbol, mic) = parse_symbol_with_exchange_suffix(symbol);
    canonical_asset_id(&AssetKind::Security, base_symbol, mic, currency)
}

/// Generates a canonical security asset ID from a symbol, with an optional explicit MIC.
///
/// This function prefers the explicit MIC if provided. If not provided, it attempts
/// to extract the MIC from a Yahoo Finance suffix in the symbol. If neither is available,
/// it uses "UNKNOWN".
///
/// # Arguments
///
/// * `symbol` - The symbol potentially with a Yahoo suffix (e.g., "SHOP.TO", "AAPL", "META")
/// * `explicit_mic` - Optional explicit MIC code (e.g., "XNAS", "XTSE")
/// * `currency` - The currency for the asset
///
/// # Returns
///
/// A canonical asset ID string (e.g., "SEC:META:XNAS", "SEC:SHOP:XTSE")
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::security_id_from_symbol_with_mic;
///
/// // With explicit MIC (preferred)
/// let id = security_id_from_symbol_with_mic("META", Some("XNAS"), "USD");
/// assert_eq!(id, "SEC:META:XNAS");
///
/// // With Yahoo suffix (fallback when no explicit MIC)
/// let id = security_id_from_symbol_with_mic("META.TO", None, "CAD");
/// assert_eq!(id, "SEC:META:XTSE");
///
/// // Neither explicit MIC nor suffix (uses UNKNOWN)
/// let id = security_id_from_symbol_with_mic("AAPL", None, "USD");
/// assert_eq!(id, "SEC:AAPL:UNKNOWN");
/// ```
pub fn security_id_from_symbol_with_mic(
    symbol: &str,
    explicit_mic: Option<&str>,
    currency: &str,
) -> String {
    let (base_symbol, suffix_mic) = parse_symbol_with_exchange_suffix(symbol);
    // Prefer explicit MIC, then suffix-derived MIC
    let mic = explicit_mic.or(suffix_mic);
    canonical_asset_id(&AssetKind::Security, base_symbol, mic, currency)
}

/// Parse asset kind from ID prefix (trivial with typed prefixes).
///
/// This function extracts the asset kind from a canonical asset ID by looking
/// at the typed prefix. It uses `AssetKind::from_id_prefix()` for the actual
/// prefix matching.
///
/// # Arguments
///
/// * `asset_id` - The asset ID to parse
///
/// # Returns
///
/// `Some(AssetKind)` if the prefix is recognized, `None` otherwise.
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::{AssetKind, kind_from_asset_id};
///
/// assert_eq!(kind_from_asset_id("SEC:AAPL:XNAS"), Some(AssetKind::Security));
/// assert_eq!(kind_from_asset_id("CRYPTO:BTC:USD"), Some(AssetKind::Crypto));
/// assert_eq!(kind_from_asset_id("CASH:CAD"), Some(AssetKind::Cash));
/// assert_eq!(kind_from_asset_id("FX:EUR:USD"), Some(AssetKind::FxRate));
/// assert_eq!(kind_from_asset_id("PROP:a1b2c3d4"), Some(AssetKind::Property));
/// ```
pub fn kind_from_asset_id(asset_id: &str) -> Option<AssetKind> {
    let prefix = asset_id.split(ASSET_ID_DELIMITER).next()?;
    AssetKind::from_id_prefix(prefix)
}

/// Parse components from a canonical asset ID.
///
/// Parses canonical format IDs with typed prefixes (e.g., `SEC:AAPL:XNAS`).
///
/// # Arguments
///
/// * `asset_id` - The asset ID to parse
///
/// # Returns
///
/// `Some(ParsedAssetId)` with the extracted components, or `None` if the ID is invalid.
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::{AssetKind, parse_canonical_asset_id};
///
/// // Canonical format
/// let parsed = parse_canonical_asset_id("SEC:AAPL:XNAS").unwrap();
/// assert_eq!(parsed.kind, Some(AssetKind::Security));
/// assert_eq!(parsed.symbol, "AAPL");
/// assert_eq!(parsed.qualifier, "XNAS");
///
/// // Cash (2-part canonical)
/// let parsed = parse_canonical_asset_id("CASH:USD").unwrap();
/// assert_eq!(parsed.kind, Some(AssetKind::Cash));
/// assert_eq!(parsed.symbol, "USD");
/// ```
pub fn parse_canonical_asset_id(asset_id: &str) -> Option<ParsedAssetId> {
    let parts: Vec<&str> = asset_id.split(ASSET_ID_DELIMITER).collect();

    if parts.is_empty() || parts.len() > 3 {
        return None;
    }

    // Try to get kind from the first part (typed prefix)
    let kind = AssetKind::from_id_prefix(parts[0]);

    if let Some(ref k) = kind {
        // Canonical format with typed prefix
        match k {
            // 2-part formats: CASH:{currency}, CMDTY:{symbol}, PEQ/PROP/VEH/COLL/PREC/LIAB/ALT:{random}
            AssetKind::Cash => {
                if parts.len() != 2 {
                    return None;
                }
                Some(ParsedAssetId {
                    primary: parts[0].to_string(),
                    qualifier: parts[1].to_string(),
                    kind: Some(k.clone()),
                    symbol: parts[1].to_string(), // Currency code is the "symbol" for cash
                })
            }
            AssetKind::Commodity => {
                if parts.len() != 2 {
                    return None;
                }
                Some(ParsedAssetId {
                    primary: parts[0].to_string(),
                    qualifier: String::new(),
                    kind: Some(k.clone()),
                    symbol: parts[1].to_string(),
                })
            }
            AssetKind::PrivateEquity
            | AssetKind::Property
            | AssetKind::Vehicle
            | AssetKind::Collectible
            | AssetKind::PhysicalPrecious
            | AssetKind::Liability
            | AssetKind::Other => {
                if parts.len() != 2 {
                    return None;
                }
                Some(ParsedAssetId {
                    primary: parts[0].to_string(),
                    qualifier: parts[1].to_string(), // The random suffix
                    kind: Some(k.clone()),
                    symbol: parts[1].to_string(), // Random ID as symbol
                })
            }
            // 3-part formats: SEC/OPT:{symbol}:{mic}, CRYPTO/FX:{base}:{quote}
            AssetKind::Security | AssetKind::Option | AssetKind::Crypto | AssetKind::FxRate => {
                if parts.len() != 3 {
                    return None;
                }
                Some(ParsedAssetId {
                    primary: parts[0].to_string(),
                    qualifier: parts[2].to_string(),
                    kind: Some(k.clone()),
                    symbol: parts[1].to_string(),
                })
            }
        }
    } else {
        // Invalid format (no recognized typed prefix)
        None
    }
}

/// Parses an asset ID into its components.
///
/// Parses canonical format IDs with typed prefixes (e.g., `SEC:AAPL:XNAS`).
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::{AssetKind, parse_asset_id};
///
/// let parsed = parse_asset_id("SEC:AAPL:XNAS").unwrap();
/// assert_eq!(parsed.kind, Some(AssetKind::Security));
/// assert_eq!(parsed.symbol, "AAPL");
/// assert_eq!(parsed.qualifier, "XNAS");
///
/// let parsed = parse_asset_id("CASH:USD").unwrap();
/// assert_eq!(parsed.kind, Some(AssetKind::Cash));
/// assert_eq!(parsed.symbol, "USD");
///
/// let parsed = parse_asset_id("PROP:a1b2c3d4").unwrap();
/// assert_eq!(parsed.kind, Some(AssetKind::Property));
/// ```
pub fn parse_asset_id(id: &str) -> Option<ParsedAssetId> {
    parse_canonical_asset_id(id)
}

// ============================================================================
// ALTERNATIVE ASSET ID GENERATION
// ============================================================================

/// Gets the prefix for a given asset kind (alternative assets only).
///
/// Returns `None` for asset kinds that don't use prefixed IDs (Security, Crypto, Cash, FxRate, Option, Commodity, PrivateEquity).
///
/// # Arguments
///
/// * `kind` - The asset kind to get the prefix for
///
/// # Returns
///
/// The prefix string for alternative asset kinds, or `None` for non-alternative assets.
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::{AssetKind, get_asset_id_prefix};
///
/// assert_eq!(get_asset_id_prefix(&AssetKind::Property), Some("PROP"));
/// assert_eq!(get_asset_id_prefix(&AssetKind::Vehicle), Some("VEH"));
/// assert_eq!(get_asset_id_prefix(&AssetKind::Security), None);
/// ```
pub fn get_asset_id_prefix(kind: &AssetKind) -> Option<&'static str> {
    match kind {
        AssetKind::Property => Some(PROPERTY_PREFIX),
        AssetKind::Vehicle => Some(VEHICLE_PREFIX),
        AssetKind::Collectible => Some(COLLECTIBLE_PREFIX),
        AssetKind::PhysicalPrecious => Some(PRECIOUS_PREFIX),
        AssetKind::Liability => Some(LIABILITY_PREFIX),
        AssetKind::Other => Some(OTHER_PREFIX),
        // Non-alternative assets don't use prefixed IDs
        AssetKind::Security
        | AssetKind::Crypto
        | AssetKind::Cash
        | AssetKind::FxRate
        | AssetKind::Option
        | AssetKind::Commodity
        | AssetKind::PrivateEquity => None,
    }
}

/// Generates a unique asset ID for an alternative asset kind.
///
/// The generated ID follows the format: `{PREFIX}:{RANDOM_8}`
///
/// # Arguments
///
/// * `kind` - The asset kind to generate an ID for
///
/// # Returns
///
/// A unique asset ID string (e.g., "PROP:a1B2c3D4")
///
/// # Panics
///
/// Panics if called with an asset kind that doesn't support prefixed IDs
/// (Security, Crypto, Cash, FxRate, Option, Commodity, PrivateEquity).
/// Use `try_generate_asset_id` for a non-panicking version.
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::{AssetKind, generate_asset_id};
///
/// let property_id = generate_asset_id(&AssetKind::Property);
/// assert!(property_id.starts_with("PROP:"));
/// assert_eq!(property_id.len(), 13); // "PROP:" (5) + 8 random chars
///
/// let liability_id = generate_asset_id(&AssetKind::Liability);
/// assert!(liability_id.starts_with("LIAB:"));
/// ```
pub fn generate_asset_id(kind: &AssetKind) -> String {
    let prefix = get_asset_id_prefix(kind)
        .expect("generate_asset_id called with non-alternative asset kind");
    alternative_id(prefix, &random_suffix())
}

/// Attempts to generate a unique asset ID for an asset kind.
///
/// Unlike `generate_asset_id`, this function returns `None` for asset kinds
/// that don't support prefixed IDs instead of panicking.
///
/// # Arguments
///
/// * `kind` - The asset kind to generate an ID for
///
/// # Returns
///
/// `Some(id)` with a unique asset ID for alternative assets, or `None` for non-alternative assets.
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::{AssetKind, try_generate_asset_id};
///
/// // Alternative assets return Some
/// let property_id = try_generate_asset_id(&AssetKind::Property);
/// assert!(property_id.is_some());
///
/// // Non-alternative assets return None
/// let security_id = try_generate_asset_id(&AssetKind::Security);
/// assert!(security_id.is_none());
/// ```
pub fn try_generate_asset_id(kind: &AssetKind) -> Option<String> {
    get_asset_id_prefix(kind).map(|prefix| alternative_id(prefix, &random_suffix()))
}

/// Validates whether a string is a valid alternative asset ID.
///
/// A valid ID must match the pattern: `^(PROP|VEH|COLL|PREC|LIAB|ALT):[a-zA-Z0-9]{8}$`
///
/// # Arguments
///
/// * `id` - The ID string to validate
///
/// # Returns
///
/// `true` if the ID is valid, `false` otherwise.
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::is_valid_alternative_asset_id;
///
/// // Valid IDs
/// assert!(is_valid_alternative_asset_id("PROP:a1B2c3D4"));
/// assert!(is_valid_alternative_asset_id("VEH:12345678"));
/// assert!(is_valid_alternative_asset_id("LIAB:AbCdEfGh"));
///
/// // Invalid IDs
/// assert!(!is_valid_alternative_asset_id("PROP:short"));      // Too short
/// assert!(!is_valid_alternative_asset_id("INVALID:12345678")); // Invalid prefix
/// assert!(!is_valid_alternative_asset_id("PROP:a1b2c3d4e"));   // Too long
/// assert!(!is_valid_alternative_asset_id("PROP:a1b2c3d!"));    // Invalid character
/// ```
pub fn is_valid_alternative_asset_id(id: &str) -> bool {
    ALTERNATIVE_ASSET_ID_REGEX.is_match(id)
}

/// Extracts the asset kind from a valid alternative asset ID.
///
/// # Arguments
///
/// * `id` - The asset ID to parse
///
/// # Returns
///
/// `Some(AssetKind)` if the ID is valid and has a recognized prefix, `None` otherwise.
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::{AssetKind, get_kind_from_asset_id};
///
/// assert_eq!(get_kind_from_asset_id("PROP:a1B2c3D4"), Some(AssetKind::Property));
/// assert_eq!(get_kind_from_asset_id("VEH:12345678"), Some(AssetKind::Vehicle));
/// assert_eq!(get_kind_from_asset_id("INVALID:12345678"), None);
/// ```
pub fn get_kind_from_asset_id(id: &str) -> Option<AssetKind> {
    if !is_valid_alternative_asset_id(id) {
        return None;
    }

    // Extract the prefix (everything before the colon)
    let prefix = id.split(ASSET_ID_DELIMITER).next()?;

    match prefix {
        PROPERTY_PREFIX => Some(AssetKind::Property),
        VEHICLE_PREFIX => Some(AssetKind::Vehicle),
        COLLECTIBLE_PREFIX => Some(AssetKind::Collectible),
        PRECIOUS_PREFIX => Some(AssetKind::PhysicalPrecious),
        LIABILITY_PREFIX => Some(AssetKind::Liability),
        OTHER_PREFIX => Some(AssetKind::Other),
        _ => None,
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------------------------------------------------
    // ID Constructor Tests
    // ------------------------------------------------------------------------

    #[test]
    fn test_alternative_id() {
        assert_eq!(alternative_id("PROP", "a1b2c3d4"), "PROP:a1b2c3d4");
        assert_eq!(alternative_id("VEH", "x9y8z7w6"), "VEH:x9y8z7w6");
    }

    // ------------------------------------------------------------------------
    // Parse Asset ID Tests
    // ------------------------------------------------------------------------

    #[test]
    fn test_parse_alternative_id() {
        let parsed = parse_asset_id("PROP:a1b2c3d4").unwrap();
        assert_eq!(parsed.primary, "PROP");
        assert_eq!(parsed.qualifier, "a1b2c3d4");
        assert_eq!(parsed.kind, Some(AssetKind::Property));

        let parsed = parse_asset_id("VEH:x9y8z7w6").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Vehicle));

        let parsed = parse_asset_id("LIAB:12345678").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Liability));
    }

    #[test]
    fn test_parse_invalid_id() {
        assert!(parse_asset_id("invalid").is_none());
        assert!(parse_asset_id("").is_none());
        assert!(parse_asset_id("too:many:colons").is_none());
    }

    // ------------------------------------------------------------------------
    // Alternative Asset ID Generation Tests
    // ------------------------------------------------------------------------

    #[test]
    fn test_generate_property_id() {
        let id = generate_asset_id(&AssetKind::Property);
        assert!(
            id.starts_with("PROP:"),
            "ID should start with PROP: - got {}",
            id
        );
        assert_eq!(id.len(), 13, "ID should be 13 chars: {}", id);
        assert!(
            is_valid_alternative_asset_id(&id),
            "Generated ID should be valid: {}",
            id
        );
    }

    #[test]
    fn test_generate_vehicle_id() {
        let id = generate_asset_id(&AssetKind::Vehicle);
        assert!(
            id.starts_with("VEH:"),
            "ID should start with VEH: - got {}",
            id
        );
        assert_eq!(id.len(), 12, "ID should be 12 chars: {}", id);
        assert!(
            is_valid_alternative_asset_id(&id),
            "Generated ID should be valid: {}",
            id
        );
    }

    #[test]
    fn test_generate_collectible_id() {
        let id = generate_asset_id(&AssetKind::Collectible);
        assert!(
            id.starts_with("COLL:"),
            "ID should start with COLL: - got {}",
            id
        );
        assert_eq!(id.len(), 13, "ID should be 13 chars: {}", id);
        assert!(
            is_valid_alternative_asset_id(&id),
            "Generated ID should be valid: {}",
            id
        );
    }

    #[test]
    fn test_generate_precious_id() {
        let id = generate_asset_id(&AssetKind::PhysicalPrecious);
        assert!(
            id.starts_with("PREC:"),
            "ID should start with PREC: - got {}",
            id
        );
        assert_eq!(id.len(), 13, "ID should be 13 chars: {}", id);
        assert!(
            is_valid_alternative_asset_id(&id),
            "Generated ID should be valid: {}",
            id
        );
    }

    #[test]
    fn test_generate_liability_id() {
        let id = generate_asset_id(&AssetKind::Liability);
        assert!(
            id.starts_with("LIAB:"),
            "ID should start with LIAB: - got {}",
            id
        );
        assert_eq!(id.len(), 13, "ID should be 13 chars: {}", id);
        assert!(
            is_valid_alternative_asset_id(&id),
            "Generated ID should be valid: {}",
            id
        );
    }

    #[test]
    fn test_generate_other_id() {
        let id = generate_asset_id(&AssetKind::Other);
        assert!(
            id.starts_with("ALT:"),
            "ID should start with ALT: - got {}",
            id
        );
        assert_eq!(id.len(), 12, "ID should be 12 chars: {}", id);
        assert!(
            is_valid_alternative_asset_id(&id),
            "Generated ID should be valid: {}",
            id
        );
    }

    #[test]
    fn test_try_generate_returns_none_for_security() {
        assert!(try_generate_asset_id(&AssetKind::Security).is_none());
    }

    #[test]
    fn test_try_generate_returns_none_for_crypto() {
        assert!(try_generate_asset_id(&AssetKind::Crypto).is_none());
    }

    #[test]
    fn test_try_generate_returns_none_for_cash() {
        assert!(try_generate_asset_id(&AssetKind::Cash).is_none());
    }

    #[test]
    fn test_try_generate_returns_none_for_fx_rate() {
        assert!(try_generate_asset_id(&AssetKind::FxRate).is_none());
    }

    #[test]
    fn test_try_generate_returns_none_for_option() {
        assert!(try_generate_asset_id(&AssetKind::Option).is_none());
    }

    #[test]
    fn test_try_generate_returns_none_for_commodity() {
        assert!(try_generate_asset_id(&AssetKind::Commodity).is_none());
    }

    #[test]
    fn test_try_generate_returns_none_for_private_equity() {
        assert!(try_generate_asset_id(&AssetKind::PrivateEquity).is_none());
    }

    #[test]
    fn test_try_generate_returns_some_for_alternative_assets() {
        assert!(try_generate_asset_id(&AssetKind::Property).is_some());
        assert!(try_generate_asset_id(&AssetKind::Vehicle).is_some());
        assert!(try_generate_asset_id(&AssetKind::Collectible).is_some());
        assert!(try_generate_asset_id(&AssetKind::PhysicalPrecious).is_some());
        assert!(try_generate_asset_id(&AssetKind::Liability).is_some());
        assert!(try_generate_asset_id(&AssetKind::Other).is_some());
    }

    #[test]
    fn test_generated_ids_are_unique() {
        let mut ids = std::collections::HashSet::new();
        for _ in 0..100 {
            let id = generate_asset_id(&AssetKind::Property);
            assert!(ids.insert(id), "Generated ID should be unique");
        }
    }

    #[test]
    fn test_valid_asset_ids() {
        // Valid IDs with colon delimiter
        assert!(is_valid_alternative_asset_id("PROP:a1B2c3D4"));
        assert!(is_valid_alternative_asset_id("VEH:12345678"));
        assert!(is_valid_alternative_asset_id("COLL:AbCdEfGh"));
        assert!(is_valid_alternative_asset_id("PREC:aBcDeFgH"));
        assert!(is_valid_alternative_asset_id("LIAB:00000000"));
        assert!(is_valid_alternative_asset_id("ALT:zzzzzzzz"));
    }

    #[test]
    fn test_invalid_asset_ids() {
        // Invalid prefix
        assert!(!is_valid_alternative_asset_id("INVALID:12345678"));
        assert!(!is_valid_alternative_asset_id("prop:12345678")); // lowercase prefix
        assert!(!is_valid_alternative_asset_id("SEC:12345678")); // not a valid prefix

        // Wrong length
        assert!(!is_valid_alternative_asset_id("PROP:short")); // too short
        assert!(!is_valid_alternative_asset_id("PROP:a1b2c3d4e")); // too long
        assert!(!is_valid_alternative_asset_id("PROP:")); // missing random part

        // Invalid characters
        assert!(!is_valid_alternative_asset_id("PROP:a1b2c3d!")); // special char
        assert!(!is_valid_alternative_asset_id("PROP:a1b2c3d ")); // space
        assert!(!is_valid_alternative_asset_id("PROP_12345678")); // underscore instead of colon

        // Old format with dash (no longer valid)
        assert!(!is_valid_alternative_asset_id("PROP-a1B2c3D4"));

        // Missing components
        assert!(!is_valid_alternative_asset_id("PROP")); // no colon
        assert!(!is_valid_alternative_asset_id("12345678")); // no prefix
        assert!(!is_valid_alternative_asset_id("")); // empty
    }

    #[test]
    fn test_get_kind_from_asset_id() {
        assert_eq!(
            get_kind_from_asset_id("PROP:a1B2c3D4"),
            Some(AssetKind::Property)
        );
        assert_eq!(
            get_kind_from_asset_id("VEH:12345678"),
            Some(AssetKind::Vehicle)
        );
        assert_eq!(
            get_kind_from_asset_id("COLL:AbCdEfGh"),
            Some(AssetKind::Collectible)
        );
        assert_eq!(
            get_kind_from_asset_id("PREC:aBcDeFgH"),
            Some(AssetKind::PhysicalPrecious)
        );
        assert_eq!(
            get_kind_from_asset_id("LIAB:00000000"),
            Some(AssetKind::Liability)
        );
        assert_eq!(
            get_kind_from_asset_id("ALT:zzzzzzzz"),
            Some(AssetKind::Other)
        );

        // Invalid IDs return None
        assert_eq!(get_kind_from_asset_id("INVALID:12345678"), None);
        assert_eq!(get_kind_from_asset_id("PROP:short"), None);
        assert_eq!(get_kind_from_asset_id(""), None);
    }

    #[test]
    fn test_get_asset_id_prefix() {
        assert_eq!(get_asset_id_prefix(&AssetKind::Property), Some("PROP"));
        assert_eq!(get_asset_id_prefix(&AssetKind::Vehicle), Some("VEH"));
        assert_eq!(get_asset_id_prefix(&AssetKind::Collectible), Some("COLL"));
        assert_eq!(
            get_asset_id_prefix(&AssetKind::PhysicalPrecious),
            Some("PREC")
        );
        assert_eq!(get_asset_id_prefix(&AssetKind::Liability), Some("LIAB"));
        assert_eq!(get_asset_id_prefix(&AssetKind::Other), Some("ALT"));

        // Non-alternative assets return None
        assert_eq!(get_asset_id_prefix(&AssetKind::Security), None);
        assert_eq!(get_asset_id_prefix(&AssetKind::Crypto), None);
        assert_eq!(get_asset_id_prefix(&AssetKind::Cash), None);
        assert_eq!(get_asset_id_prefix(&AssetKind::FxRate), None);
        assert_eq!(get_asset_id_prefix(&AssetKind::Option), None);
        assert_eq!(get_asset_id_prefix(&AssetKind::Commodity), None);
        assert_eq!(get_asset_id_prefix(&AssetKind::PrivateEquity), None);
    }

    #[test]
    fn test_random_id_contains_only_alphanumeric() {
        for _ in 0..100 {
            let id = generate_asset_id(&AssetKind::Property);
            let random_part = &id[5..]; // Skip "PROP:"
            assert!(
                random_part.chars().all(|c| c.is_ascii_alphanumeric()),
                "Random part should only contain alphanumeric chars: {}",
                random_part
            );
        }
    }

    // ------------------------------------------------------------------------
    // Canonical Asset ID Tests (New Typed Prefix Format)
    // ------------------------------------------------------------------------

    #[test]
    fn test_random_suffix() {
        let suffix = random_suffix();
        assert_eq!(suffix.len(), 8);
        assert!(suffix.chars().all(|c| c.is_ascii_alphanumeric()));

        // Verify uniqueness
        let suffix2 = random_suffix();
        assert_ne!(suffix, suffix2);
    }

    #[test]
    fn test_canonical_asset_id_security() {
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "AAPL", Some("XNAS"), "USD"),
            "SEC:AAPL:XNAS"
        );
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "aapl", Some("xnas"), "USD"),
            "SEC:AAPL:XNAS"
        );
        // Without exchange, defaults to UNKNOWN
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "AAPL", None, "USD"),
            "SEC:AAPL:UNKNOWN"
        );
    }

    #[test]
    fn test_canonical_asset_id_crypto() {
        assert_eq!(
            canonical_asset_id(&AssetKind::Crypto, "BTC", None, "USD"),
            "CRYPTO:BTC:USD"
        );
        assert_eq!(
            canonical_asset_id(&AssetKind::Crypto, "eth", None, "cad"),
            "CRYPTO:ETH:CAD"
        );
        assert_eq!(
            canonical_asset_id(&AssetKind::Crypto, "BTC-CAD", None, "CAD"),
            "CRYPTO:BTC:CAD"
        );
        assert_eq!(
            canonical_asset_id(&AssetKind::Crypto, "BTC-USD", None, "CAD"),
            "CRYPTO:BTC:USD"
        );
        assert_eq!(
            canonical_asset_id(&AssetKind::Crypto, "BTC-USDT", None, "USD"),
            "CRYPTO:BTC:USDT"
        );
        assert_eq!(
            canonical_asset_id(&AssetKind::Crypto, "X-AI-USD", None, "USD"),
            "CRYPTO:X-AI:USD"
        );
    }

    #[test]
    fn test_canonical_asset_id_fx() {
        assert_eq!(
            canonical_asset_id(&AssetKind::FxRate, "EUR", None, "USD"),
            "FX:EUR:USD"
        );
        assert_eq!(
            canonical_asset_id(&AssetKind::FxRate, "gbp", None, "cad"),
            "FX:GBP:CAD"
        );
    }

    #[test]
    fn test_canonical_asset_id_cash() {
        assert_eq!(
            canonical_asset_id(&AssetKind::Cash, "CAD", None, "CAD"),
            "CASH:CAD"
        );
        assert_eq!(
            canonical_asset_id(&AssetKind::Cash, "usd", None, "usd"),
            "CASH:USD"
        );
    }

    #[test]
    fn test_canonical_asset_id_option() {
        assert_eq!(
            canonical_asset_id(
                &AssetKind::Option,
                "AAPL240119C00150000",
                Some("XNAS"),
                "USD"
            ),
            "OPT:AAPL240119C00150000:XNAS"
        );
    }

    #[test]
    fn test_canonical_asset_id_commodity() {
        assert_eq!(
            canonical_asset_id(&AssetKind::Commodity, "GC", None, "USD"),
            "CMDTY:GC"
        );
    }

    #[test]
    fn test_canonical_asset_id_alternative_assets() {
        // Alternative assets get random suffixes
        let prop_id = canonical_asset_id(&AssetKind::Property, "House", None, "USD");
        assert!(prop_id.starts_with("PROP:"));
        assert_eq!(prop_id.len(), 13); // "PROP:" (5) + 8 random

        let veh_id = canonical_asset_id(&AssetKind::Vehicle, "Car", None, "USD");
        assert!(veh_id.starts_with("VEH:"));

        let coll_id = canonical_asset_id(&AssetKind::Collectible, "Art", None, "USD");
        assert!(coll_id.starts_with("COLL:"));

        let prec_id = canonical_asset_id(&AssetKind::PhysicalPrecious, "Gold", None, "USD");
        assert!(prec_id.starts_with("PREC:"));

        let liab_id = canonical_asset_id(&AssetKind::Liability, "Mortgage", None, "USD");
        assert!(liab_id.starts_with("LIAB:"));

        let other_id = canonical_asset_id(&AssetKind::Other, "Other", None, "USD");
        assert!(other_id.starts_with("ALT:"));

        let peq_id = canonical_asset_id(&AssetKind::PrivateEquity, "Startup", None, "USD");
        assert!(peq_id.starts_with("PEQ:"));
    }

    #[test]
    fn test_kind_from_asset_id_canonical() {
        assert_eq!(
            kind_from_asset_id("SEC:AAPL:XNAS"),
            Some(AssetKind::Security)
        );
        assert_eq!(
            kind_from_asset_id("CRYPTO:BTC:USD"),
            Some(AssetKind::Crypto)
        );
        assert_eq!(kind_from_asset_id("FX:EUR:USD"), Some(AssetKind::FxRate));
        assert_eq!(kind_from_asset_id("CASH:CAD"), Some(AssetKind::Cash));
        assert_eq!(
            kind_from_asset_id("OPT:AAPL240119C00150000:XNAS"),
            Some(AssetKind::Option)
        );
        assert_eq!(kind_from_asset_id("CMDTY:GC"), Some(AssetKind::Commodity));
        assert_eq!(
            kind_from_asset_id("PEQ:a1b2c3d4"),
            Some(AssetKind::PrivateEquity)
        );
        assert_eq!(
            kind_from_asset_id("PROP:a1b2c3d4"),
            Some(AssetKind::Property)
        );
        assert_eq!(kind_from_asset_id("VEH:a1b2c3d4"), Some(AssetKind::Vehicle));
        assert_eq!(
            kind_from_asset_id("COLL:a1b2c3d4"),
            Some(AssetKind::Collectible)
        );
        assert_eq!(
            kind_from_asset_id("PREC:a1b2c3d4"),
            Some(AssetKind::PhysicalPrecious)
        );
        assert_eq!(
            kind_from_asset_id("LIAB:a1b2c3d4"),
            Some(AssetKind::Liability)
        );
        assert_eq!(kind_from_asset_id("ALT:a1b2c3d4"), Some(AssetKind::Other));

        // IDs without typed prefix return None
        assert_eq!(kind_from_asset_id("AAPL:XNAS"), None);
        assert_eq!(kind_from_asset_id("BTC:USD"), None);
    }

    #[test]
    fn test_parse_canonical_asset_id_security() {
        let parsed = parse_canonical_asset_id("SEC:AAPL:XNAS").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Security));
        assert_eq!(parsed.symbol, "AAPL");
        assert_eq!(parsed.qualifier, "XNAS");
        assert_eq!(parsed.primary, "SEC");
    }

    #[test]
    fn test_parse_canonical_asset_id_crypto() {
        let parsed = parse_canonical_asset_id("CRYPTO:BTC:USD").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Crypto));
        assert_eq!(parsed.symbol, "BTC");
        assert_eq!(parsed.qualifier, "USD");
    }

    #[test]
    fn test_parse_canonical_asset_id_fx() {
        let parsed = parse_canonical_asset_id("FX:EUR:USD").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::FxRate));
        assert_eq!(parsed.symbol, "EUR");
        assert_eq!(parsed.qualifier, "USD");
    }

    #[test]
    fn test_parse_canonical_asset_id_cash() {
        let parsed = parse_canonical_asset_id("CASH:USD").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Cash));
        assert_eq!(parsed.symbol, "USD");
        assert_eq!(parsed.qualifier, "USD");
    }

    #[test]
    fn test_parse_canonical_asset_id_commodity() {
        let parsed = parse_canonical_asset_id("CMDTY:GC").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Commodity));
        assert_eq!(parsed.symbol, "GC");
        assert_eq!(parsed.qualifier, "");
    }

    #[test]
    fn test_parse_canonical_asset_id_alternative() {
        let parsed = parse_canonical_asset_id("PROP:a1b2c3d4").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Property));
        assert_eq!(parsed.symbol, "a1b2c3d4");
        assert_eq!(parsed.qualifier, "a1b2c3d4");
    }

    #[test]
    fn test_parse_canonical_asset_id_returns_none_for_invalid() {
        // IDs without typed prefix should return None
        assert!(parse_canonical_asset_id("AAPL:XNAS").is_none());
        assert!(parse_canonical_asset_id("BTC:USD").is_none());
        assert!(parse_canonical_asset_id("invalid").is_none());
    }

    #[test]
    fn test_parse_asset_id_canonical_formats() {
        let parsed = parse_asset_id("SEC:AAPL:XNAS").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Security));
        assert_eq!(parsed.symbol, "AAPL");

        let parsed = parse_asset_id("CRYPTO:BTC:USD").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Crypto));
        assert_eq!(parsed.symbol, "BTC");

        let parsed = parse_asset_id("CASH:CAD").unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Cash));
        assert_eq!(parsed.symbol, "CAD");
    }

    #[test]
    fn test_asset_kind_id_prefix() {
        assert_eq!(AssetKind::Security.id_prefix(), "SEC");
        assert_eq!(AssetKind::Crypto.id_prefix(), "CRYPTO");
        assert_eq!(AssetKind::Cash.id_prefix(), "CASH");
        assert_eq!(AssetKind::FxRate.id_prefix(), "FX");
        assert_eq!(AssetKind::Option.id_prefix(), "OPT");
        assert_eq!(AssetKind::Commodity.id_prefix(), "CMDTY");
        assert_eq!(AssetKind::PrivateEquity.id_prefix(), "PEQ");
        assert_eq!(AssetKind::Property.id_prefix(), "PROP");
        assert_eq!(AssetKind::Vehicle.id_prefix(), "VEH");
        assert_eq!(AssetKind::Collectible.id_prefix(), "COLL");
        assert_eq!(AssetKind::PhysicalPrecious.id_prefix(), "PREC");
        assert_eq!(AssetKind::Liability.id_prefix(), "LIAB");
        assert_eq!(AssetKind::Other.id_prefix(), "ALT");
    }

    #[test]
    fn test_asset_kind_from_id_prefix() {
        assert_eq!(AssetKind::from_id_prefix("SEC"), Some(AssetKind::Security));
        assert_eq!(AssetKind::from_id_prefix("CRYPTO"), Some(AssetKind::Crypto));
        assert_eq!(AssetKind::from_id_prefix("CASH"), Some(AssetKind::Cash));
        assert_eq!(AssetKind::from_id_prefix("FX"), Some(AssetKind::FxRate));
        assert_eq!(AssetKind::from_id_prefix("OPT"), Some(AssetKind::Option));
        assert_eq!(
            AssetKind::from_id_prefix("CMDTY"),
            Some(AssetKind::Commodity)
        );
        assert_eq!(
            AssetKind::from_id_prefix("PEQ"),
            Some(AssetKind::PrivateEquity)
        );
        assert_eq!(AssetKind::from_id_prefix("PROP"), Some(AssetKind::Property));
        assert_eq!(AssetKind::from_id_prefix("VEH"), Some(AssetKind::Vehicle));
        assert_eq!(
            AssetKind::from_id_prefix("COLL"),
            Some(AssetKind::Collectible)
        );
        assert_eq!(
            AssetKind::from_id_prefix("PREC"),
            Some(AssetKind::PhysicalPrecious)
        );
        assert_eq!(
            AssetKind::from_id_prefix("LIAB"),
            Some(AssetKind::Liability)
        );
        assert_eq!(AssetKind::from_id_prefix("ALT"), Some(AssetKind::Other));
        assert_eq!(AssetKind::from_id_prefix("INVALID"), None);
        assert_eq!(AssetKind::from_id_prefix(""), None);
    }

    // ------------------------------------------------------------------------
    // Edge Case Tests: Whitespace, Empty, and Case Handling
    // ------------------------------------------------------------------------

    #[test]
    fn test_canonical_asset_id_trims_whitespace() {
        // Symbol with leading/trailing whitespace
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "  AAPL  ", Some("XNAS"), "USD"),
            "SEC:AAPL:XNAS"
        );
        // Exchange MIC with whitespace
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "AAPL", Some("  XNAS  "), "USD"),
            "SEC:AAPL:XNAS"
        );
        // Currency with whitespace
        assert_eq!(
            canonical_asset_id(&AssetKind::Crypto, "BTC", None, "  USD  "),
            "CRYPTO:BTC:USD"
        );
        // All fields with whitespace
        assert_eq!(
            canonical_asset_id(&AssetKind::FxRate, "  EUR  ", None, "  USD  "),
            "FX:EUR:USD"
        );
    }

    #[test]
    fn test_canonical_asset_id_handles_empty_symbol() {
        // Empty symbol results in empty uppercase string
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "", Some("XNAS"), "USD"),
            "SEC::XNAS"
        );
        // Whitespace-only symbol is trimmed to empty
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "   ", Some("XNAS"), "USD"),
            "SEC::XNAS"
        );
    }

    #[test]
    fn test_canonical_asset_id_handles_empty_currency() {
        // Empty currency results in empty uppercase string
        assert_eq!(
            canonical_asset_id(&AssetKind::Crypto, "BTC", None, ""),
            "CRYPTO:BTC:"
        );
        // Whitespace-only currency is trimmed
        assert_eq!(
            canonical_asset_id(&AssetKind::Crypto, "BTC", None, "   "),
            "CRYPTO:BTC:"
        );
    }

    #[test]
    fn test_canonical_asset_id_handles_empty_exchange() {
        // Empty exchange MIC falls back to UNKNOWN
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "AAPL", Some(""), "USD"),
            "SEC:AAPL:"
        );
        // Whitespace-only exchange MIC is trimmed to empty (not UNKNOWN)
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "AAPL", Some("   "), "USD"),
            "SEC:AAPL:"
        );
        // None exchange falls back to UNKNOWN
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "AAPL", None, "USD"),
            "SEC:AAPL:UNKNOWN"
        );
    }

    #[test]
    fn test_canonical_asset_id_mixed_case() {
        // All lowercase
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "aapl", Some("xnas"), "usd"),
            "SEC:AAPL:XNAS"
        );
        // Mixed case
        assert_eq!(
            canonical_asset_id(&AssetKind::Security, "AaPl", Some("XnAs"), "Usd"),
            "SEC:AAPL:XNAS"
        );
        // Crypto mixed case
        assert_eq!(
            canonical_asset_id(&AssetKind::Crypto, "Btc", None, "Usd"),
            "CRYPTO:BTC:USD"
        );
        // FX mixed case
        assert_eq!(
            canonical_asset_id(&AssetKind::FxRate, "eUr", None, "uSd"),
            "FX:EUR:USD"
        );
        // Cash mixed case
        assert_eq!(
            canonical_asset_id(&AssetKind::Cash, "cAd", None, "cad"),
            "CASH:CAD"
        );
    }

    #[test]
    fn test_asset_kind_from_id_prefix_case_sensitive() {
        // from_id_prefix is case-sensitive - lowercase should return None
        assert_eq!(AssetKind::from_id_prefix("sec"), None);
        assert_eq!(AssetKind::from_id_prefix("Sec"), None);
        assert_eq!(AssetKind::from_id_prefix("crypto"), None);
        assert_eq!(AssetKind::from_id_prefix("Crypto"), None);
        assert_eq!(AssetKind::from_id_prefix("cash"), None);
        assert_eq!(AssetKind::from_id_prefix("fx"), None);
        assert_eq!(AssetKind::from_id_prefix("prop"), None);
    }

    #[test]
    fn test_kind_from_asset_id_case_sensitive() {
        // kind_from_asset_id is case-sensitive for the prefix
        assert_eq!(kind_from_asset_id("sec:AAPL:XNAS"), None);
        assert_eq!(kind_from_asset_id("Sec:AAPL:XNAS"), None);
        assert_eq!(kind_from_asset_id("crypto:BTC:USD"), None);
        // Correct uppercase works
        assert_eq!(
            kind_from_asset_id("SEC:AAPL:XNAS"),
            Some(AssetKind::Security)
        );
    }

    // ------------------------------------------------------------------------
    // Round-Trip Tests: Generate → Parse → Verify
    // ------------------------------------------------------------------------

    #[test]
    fn test_round_trip_security_id() {
        let id = canonical_asset_id(&AssetKind::Security, "AAPL", Some("XNAS"), "USD");
        let parsed = parse_canonical_asset_id(&id).unwrap();

        assert_eq!(parsed.kind, Some(AssetKind::Security));
        assert_eq!(parsed.symbol, "AAPL");
        assert_eq!(parsed.qualifier, "XNAS");
    }

    #[test]
    fn test_round_trip_security_unknown_exchange() {
        let id = canonical_asset_id(&AssetKind::Security, "TSLA", None, "USD");
        assert_eq!(id, "SEC:TSLA:UNKNOWN");

        let parsed = parse_canonical_asset_id(&id).unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Security));
        assert_eq!(parsed.symbol, "TSLA");
        assert_eq!(parsed.qualifier, "UNKNOWN");
    }

    #[test]
    fn test_round_trip_crypto_id() {
        let id = canonical_asset_id(&AssetKind::Crypto, "BTC", None, "USD");
        let parsed = parse_canonical_asset_id(&id).unwrap();

        assert_eq!(parsed.kind, Some(AssetKind::Crypto));
        assert_eq!(parsed.symbol, "BTC");
        assert_eq!(parsed.qualifier, "USD");
    }

    #[test]
    fn test_round_trip_fx_id() {
        let id = canonical_asset_id(&AssetKind::FxRate, "EUR", None, "CAD");
        let parsed = parse_canonical_asset_id(&id).unwrap();

        assert_eq!(parsed.kind, Some(AssetKind::FxRate));
        assert_eq!(parsed.symbol, "EUR");
        assert_eq!(parsed.qualifier, "CAD");
    }

    #[test]
    fn test_round_trip_cash_id() {
        let id = canonical_asset_id(&AssetKind::Cash, "CAD", None, "CAD");
        let parsed = parse_canonical_asset_id(&id).unwrap();

        assert_eq!(parsed.kind, Some(AssetKind::Cash));
        assert_eq!(parsed.symbol, "CAD");
        assert_eq!(parsed.qualifier, "CAD");
    }

    #[test]
    fn test_round_trip_option_id() {
        let id = canonical_asset_id(
            &AssetKind::Option,
            "AAPL240119C00150000",
            Some("XCBO"),
            "USD",
        );
        let parsed = parse_canonical_asset_id(&id).unwrap();

        assert_eq!(parsed.kind, Some(AssetKind::Option));
        assert_eq!(parsed.symbol, "AAPL240119C00150000");
        assert_eq!(parsed.qualifier, "XCBO");
    }

    #[test]
    fn test_round_trip_commodity_id() {
        let id = canonical_asset_id(&AssetKind::Commodity, "GC", None, "USD");
        let parsed = parse_canonical_asset_id(&id).unwrap();

        assert_eq!(parsed.kind, Some(AssetKind::Commodity));
        assert_eq!(parsed.symbol, "GC");
        assert_eq!(parsed.qualifier, "");
    }

    #[test]
    fn test_round_trip_alternative_assets() {
        // Property
        let prop_id = canonical_asset_id(&AssetKind::Property, "House", None, "USD");
        let parsed = parse_canonical_asset_id(&prop_id).unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Property));
        assert!(prop_id.starts_with("PROP:"));

        // Vehicle
        let veh_id = canonical_asset_id(&AssetKind::Vehicle, "Car", None, "USD");
        let parsed = parse_canonical_asset_id(&veh_id).unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Vehicle));

        // Private Equity
        let peq_id = canonical_asset_id(&AssetKind::PrivateEquity, "Startup", None, "USD");
        let parsed = parse_canonical_asset_id(&peq_id).unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::PrivateEquity));

        // Liability
        let liab_id = canonical_asset_id(&AssetKind::Liability, "Mortgage", None, "USD");
        let parsed = parse_canonical_asset_id(&liab_id).unwrap();
        assert_eq!(parsed.kind, Some(AssetKind::Liability));
    }

    #[test]
    fn test_round_trip_preserves_kind() {
        // Test all asset kinds through round-trip
        let test_cases = vec![
            (AssetKind::Security, "AAPL", Some("XNAS"), "USD"),
            (AssetKind::Crypto, "BTC", None, "USD"),
            (AssetKind::FxRate, "EUR", None, "USD"),
            (AssetKind::Cash, "CAD", None, "CAD"),
            (AssetKind::Option, "AAPL240119C", Some("XCBO"), "USD"),
            (AssetKind::Commodity, "GC", None, "USD"),
        ];

        for (kind, symbol, exchange, currency) in test_cases {
            let id = canonical_asset_id(&kind, symbol, exchange, currency);
            let parsed_kind = kind_from_asset_id(&id);
            assert_eq!(
                parsed_kind,
                Some(kind.clone()),
                "Round-trip failed for {:?}: {} -> {:?}",
                kind,
                id,
                parsed_kind
            );
        }
    }

    #[test]
    fn test_parse_invalid_formats() {
        // Too few parts
        assert!(parse_canonical_asset_id("SEC").is_none());
        assert!(parse_canonical_asset_id("SEC:AAPL").is_none()); // 3-part format needs 3 parts

        // Too many parts
        assert!(parse_canonical_asset_id("SEC:AAPL:XNAS:EXTRA").is_none());

        // Empty string
        assert!(parse_canonical_asset_id("").is_none());

        // Just delimiters
        assert!(parse_canonical_asset_id("::").is_none());
        assert!(parse_canonical_asset_id(":").is_none());

        // Wrong format for cash (3 parts instead of 2)
        assert!(parse_canonical_asset_id("CASH:USD:EXTRA").is_none());
    }

    #[test]
    fn test_parse_asset_id_handles_all_valid_formats() {
        // Canonical formats via parse_asset_id (not parse_canonical_asset_id)
        assert!(parse_asset_id("SEC:AAPL:XNAS").is_some());
        assert!(parse_asset_id("CRYPTO:BTC:USD").is_some());
        assert!(parse_asset_id("FX:EUR:USD").is_some());
        assert!(parse_asset_id("CASH:CAD").is_some());
        assert!(parse_asset_id("CMDTY:GC").is_some());
        assert!(parse_asset_id("PROP:a1b2c3d4").is_some());

        // IDs without typed prefix return None
        assert!(parse_asset_id("AAPL:XNAS").is_none());
        assert!(parse_asset_id("BTC:USD").is_none());
        assert!(parse_asset_id("invalid").is_none());
    }
}
