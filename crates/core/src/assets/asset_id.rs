//! Asset ID generation, parsing, and validation.
//!
//! This module provides utilities for generating, parsing, and validating asset IDs
//! using a uniform `{primary}:{qualifier}` format.
//!
//! ## ID Format
//!
//! All asset IDs follow the format: `{PRIMARY}:{QUALIFIER}`
//!
//! | Asset Kind | Pattern | Examples |
//! |------------|---------|----------|
//! | Security | `{ticker}:{exchange_mic}` | `SPY:XNYS`, `SHOP:XTSE`, `AAPL:XNAS` |
//! | Crypto | `{base}:{quote_currency}` | `BTC:USD`, `ETH:CAD`, `SOL:USD` |
//! | FX Rate | `{base}:{quote_currency}` | `EUR:USD`, `GBP:CAD` |
//! | Cash | `CASH:{currency}` | `CASH:USD`, `CASH:CAD` |
//! | Property | `PROP:{nanoid}` | `PROP:a1b2c3d4` |
//! | Vehicle | `VEH:{nanoid}` | `VEH:x9y8z7w6` |
//! | Collectible | `COLL:{nanoid}` | `COLL:m2n3o4p5` |
//! | PhysicalPrecious | `PREC:{nanoid}` | `PREC:q6r7s8t9` |
//! | Liability | `LIAB:{nanoid}` | `LIAB:u0v1w2x3` |
//! | Other | `ALT:{nanoid}` | `ALT:abcd1234` |
//!
//! ## Examples
//!
//! ```
//! use wealthfolio_core::assets::{AssetKind, security_id, crypto_id, cash_id, parse_asset_id};
//!
//! // Generate IDs for different asset types
//! assert_eq!(security_id("AAPL", "XNAS"), "AAPL:XNAS");
//! assert_eq!(crypto_id("BTC", "USD"), "BTC:USD");
//! assert_eq!(cash_id("USD"), "CASH:USD");
//!
//! // Parse an asset ID
//! let parsed = parse_asset_id("AAPL:XNAS").unwrap();
//! assert_eq!(parsed.primary, "AAPL");
//! assert_eq!(parsed.qualifier, "XNAS");
//! ```

use super::AssetKind;
use lazy_static::lazy_static;
use regex::Regex;
use uuid::Uuid;

// ============================================================================
// CONSTANTS
// ============================================================================

/// The delimiter used in all asset IDs (colon)
pub const ASSET_ID_DELIMITER: char = ':';

/// Prefix for Cash assets
pub const CASH_PREFIX: &str = "CASH";
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

/// Length of the random portion of alternative asset IDs
const RANDOM_ID_LENGTH: usize = 8;

/// Alphabet for generating random IDs (alphanumeric: a-z, A-Z, 0-9)
const ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

lazy_static! {
    /// Regex pattern for validating alternative asset IDs
    /// Format: ^(PROP|VEH|COLL|PREC|LIAB|ALT):[a-zA-Z0-9]{8}$
    static ref ALTERNATIVE_ASSET_ID_REGEX: Regex =
        Regex::new(r"^(PROP|VEH|COLL|PREC|LIAB|ALT):[a-zA-Z0-9]{8}$")
            .expect("Invalid regex pattern");

    /// Regex pattern for validating cash asset IDs
    /// Format: ^CASH:[A-Z]{3}$
    static ref CASH_ASSET_ID_REGEX: Regex =
        Regex::new(r"^CASH:[A-Z]{3}$")
            .expect("Invalid regex pattern");

    /// Regex pattern for validating security asset IDs
    /// Format: ^[A-Z0-9.]+:[A-Z]{4}$ (ticker:MIC)
    static ref SECURITY_ASSET_ID_REGEX: Regex =
        Regex::new(r"^[A-Z0-9.]+:[A-Z]{4}$")
            .expect("Invalid regex pattern");

    /// Regex pattern for validating crypto asset IDs
    /// Format: ^[A-Z0-9]+:[A-Z]{3}$ (base:quote)
    static ref CRYPTO_ASSET_ID_REGEX: Regex =
        Regex::new(r"^[A-Z0-9]+:[A-Z]{3,4}$")
            .expect("Invalid regex pattern");

    /// Regex pattern for validating FX rate asset IDs
    /// Format: ^[A-Z]{3}:[A-Z]{3}$ (base:quote)
    static ref FX_ASSET_ID_REGEX: Regex =
        Regex::new(r"^[A-Z]{3}:[A-Z]{3}$")
            .expect("Invalid regex pattern");
}

// ============================================================================
// PARSED ASSET ID
// ============================================================================

/// Represents a parsed asset ID with its components.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedAssetId {
    /// The primary component (ticker, base currency, or prefix)
    pub primary: String,
    /// The qualifier component (exchange MIC, quote currency, or nanoid)
    pub qualifier: String,
    /// The inferred asset kind (if determinable from the ID)
    pub kind: Option<AssetKind>,
}

// ============================================================================
// ID CONSTRUCTORS
// ============================================================================

/// Creates a security asset ID from ticker and exchange MIC.
///
/// # Arguments
///
/// * `symbol` - The ticker symbol (e.g., "AAPL", "SHOP")
/// * `mic` - The ISO 10383 Market Identifier Code (e.g., "XNAS", "XTSE")
///
/// # Returns
///
/// A security asset ID in the format `{symbol}:{mic}`
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::security_id;
///
/// assert_eq!(security_id("AAPL", "XNAS"), "AAPL:XNAS");
/// assert_eq!(security_id("SHOP", "XTSE"), "SHOP:XTSE");
/// assert_eq!(security_id("SPY", "XNYS"), "SPY:XNYS");
/// ```
pub fn security_id(symbol: &str, mic: &str) -> String {
    format!(
        "{}{}{}",
        symbol.to_uppercase(),
        ASSET_ID_DELIMITER,
        mic.to_uppercase()
    )
}

/// Creates a cryptocurrency asset ID from base and quote currencies.
///
/// # Arguments
///
/// * `base` - The base currency (e.g., "BTC", "ETH")
/// * `quote` - The quote currency (e.g., "USD", "CAD")
///
/// # Returns
///
/// A crypto asset ID in the format `{base}:{quote}`
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::crypto_id;
///
/// assert_eq!(crypto_id("BTC", "USD"), "BTC:USD");
/// assert_eq!(crypto_id("ETH", "CAD"), "ETH:CAD");
/// ```
pub fn crypto_id(base: &str, quote: &str) -> String {
    format!(
        "{}{}{}",
        base.to_uppercase(),
        ASSET_ID_DELIMITER,
        quote.to_uppercase()
    )
}

/// Creates an FX rate asset ID from base and quote currencies.
///
/// # Arguments
///
/// * `base` - The base currency (e.g., "EUR", "GBP")
/// * `quote` - The quote currency (e.g., "USD", "CAD")
///
/// # Returns
///
/// An FX rate asset ID in the format `{base}:{quote}`
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::fx_id;
///
/// assert_eq!(fx_id("EUR", "USD"), "EUR:USD");
/// assert_eq!(fx_id("GBP", "CAD"), "GBP:CAD");
/// ```
pub fn fx_id(base: &str, quote: &str) -> String {
    format!(
        "{}{}{}",
        base.to_uppercase(),
        ASSET_ID_DELIMITER,
        quote.to_uppercase()
    )
}

/// Creates a cash asset ID from a currency code.
///
/// # Arguments
///
/// * `currency` - The ISO 4217 currency code (e.g., "USD", "CAD")
///
/// # Returns
///
/// A cash asset ID in the format `CASH:{currency}`
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::cash_id;
///
/// assert_eq!(cash_id("USD"), "CASH:USD");
/// assert_eq!(cash_id("CAD"), "CASH:CAD");
/// ```
pub fn cash_id(currency: &str) -> String {
    format!(
        "{}{}{}",
        CASH_PREFIX,
        ASSET_ID_DELIMITER,
        currency.to_uppercase()
    )
}

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
// ID PARSING
// ============================================================================

/// Parses an asset ID into its components.
///
/// # Arguments
///
/// * `id` - The asset ID to parse
///
/// # Returns
///
/// `Some(ParsedAssetId)` if the ID is valid and can be parsed, `None` otherwise.
///
/// # Examples
///
/// ```
/// use wealthfolio_core::assets::{AssetKind, parse_asset_id};
///
/// // Security
/// let parsed = parse_asset_id("AAPL:XNAS").unwrap();
/// assert_eq!(parsed.primary, "AAPL");
/// assert_eq!(parsed.qualifier, "XNAS");
/// assert_eq!(parsed.kind, Some(AssetKind::Security));
///
/// // Cash
/// let parsed = parse_asset_id("CASH:USD").unwrap();
/// assert_eq!(parsed.primary, "CASH");
/// assert_eq!(parsed.qualifier, "USD");
/// assert_eq!(parsed.kind, Some(AssetKind::Cash));
///
/// // Alternative asset
/// let parsed = parse_asset_id("PROP:a1b2c3d4").unwrap();
/// assert_eq!(parsed.primary, "PROP");
/// assert_eq!(parsed.qualifier, "a1b2c3d4");
/// assert_eq!(parsed.kind, Some(AssetKind::Property));
/// ```
pub fn parse_asset_id(id: &str) -> Option<ParsedAssetId> {
    let parts: Vec<&str> = id.split(ASSET_ID_DELIMITER).collect();
    if parts.len() != 2 {
        return None;
    }

    let primary = parts[0].to_string();
    let qualifier = parts[1].to_string();

    // Determine the asset kind based on the ID format
    let kind = infer_kind_from_id(id, &primary);

    Some(ParsedAssetId {
        primary,
        qualifier,
        kind,
    })
}

/// Infers the asset kind from an ID.
fn infer_kind_from_id(id: &str, primary: &str) -> Option<AssetKind> {
    // Check for cash first (CASH:XXX)
    if primary == CASH_PREFIX {
        return Some(AssetKind::Cash);
    }

    // Check for alternative assets (PROP:xxx, VEH:xxx, etc.)
    if ALTERNATIVE_ASSET_ID_REGEX.is_match(id) {
        return match primary {
            "PROP" => Some(AssetKind::Property),
            "VEH" => Some(AssetKind::Vehicle),
            "COLL" => Some(AssetKind::Collectible),
            "PREC" => Some(AssetKind::PhysicalPrecious),
            "LIAB" => Some(AssetKind::Liability),
            "ALT" => Some(AssetKind::Other),
            _ => None,
        };
    }

    // Check for FX rate (exactly 3-letter:3-letter pattern)
    if FX_ASSET_ID_REGEX.is_match(id) {
        // Could be FX or Crypto - FX uses 3-letter currency codes
        // Heuristic: common crypto bases are longer or have numbers
        return Some(AssetKind::FxRate);
    }

    // Check for security (ticker:MIC where MIC is 4 uppercase letters)
    if SECURITY_ASSET_ID_REGEX.is_match(id) {
        return Some(AssetKind::Security);
    }

    // Check for crypto (base:quote where base can have numbers)
    if CRYPTO_ASSET_ID_REGEX.is_match(id) {
        return Some(AssetKind::Crypto);
    }

    None
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

/// Generates a random 8-character alphanumeric string.
///
/// Uses UUID v4 as the source of randomness, then maps bytes to the alphanumeric alphabet.
fn generate_random_id() -> String {
    let uuid = Uuid::new_v4();
    let bytes = uuid.as_bytes();

    // Take 8 bytes from the UUID and map each to an alphanumeric character
    bytes
        .iter()
        .take(RANDOM_ID_LENGTH)
        .map(|&b| {
            let index = (b as usize) % ALPHABET.len();
            ALPHABET[index] as char
        })
        .collect()
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
    let random_part = generate_random_id();
    alternative_id(prefix, &random_part)
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
    get_asset_id_prefix(kind).map(|prefix| {
        let random_part = generate_random_id();
        alternative_id(prefix, &random_part)
    })
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
    fn test_security_id() {
        assert_eq!(security_id("AAPL", "XNAS"), "AAPL:XNAS");
        assert_eq!(security_id("SHOP", "XTSE"), "SHOP:XTSE");
        assert_eq!(security_id("spy", "xnys"), "SPY:XNYS"); // lowercase converted
    }

    #[test]
    fn test_crypto_id() {
        assert_eq!(crypto_id("BTC", "USD"), "BTC:USD");
        assert_eq!(crypto_id("ETH", "CAD"), "ETH:CAD");
        assert_eq!(crypto_id("btc", "usd"), "BTC:USD"); // lowercase converted
    }

    #[test]
    fn test_fx_id() {
        assert_eq!(fx_id("EUR", "USD"), "EUR:USD");
        assert_eq!(fx_id("GBP", "CAD"), "GBP:CAD");
        assert_eq!(fx_id("eur", "usd"), "EUR:USD"); // lowercase converted
    }

    #[test]
    fn test_cash_id() {
        assert_eq!(cash_id("USD"), "CASH:USD");
        assert_eq!(cash_id("CAD"), "CASH:CAD");
        assert_eq!(cash_id("usd"), "CASH:USD"); // lowercase converted
    }

    #[test]
    fn test_alternative_id() {
        assert_eq!(alternative_id("PROP", "a1b2c3d4"), "PROP:a1b2c3d4");
        assert_eq!(alternative_id("VEH", "x9y8z7w6"), "VEH:x9y8z7w6");
    }

    // ------------------------------------------------------------------------
    // Parse Asset ID Tests
    // ------------------------------------------------------------------------

    #[test]
    fn test_parse_security_id() {
        let parsed = parse_asset_id("AAPL:XNAS").unwrap();
        assert_eq!(parsed.primary, "AAPL");
        assert_eq!(parsed.qualifier, "XNAS");
        assert_eq!(parsed.kind, Some(AssetKind::Security));
    }

    #[test]
    fn test_parse_crypto_id() {
        let parsed = parse_asset_id("BTC:USD").unwrap();
        assert_eq!(parsed.primary, "BTC");
        assert_eq!(parsed.qualifier, "USD");
        // Note: BTC:USD matches FX pattern (3:3), so might be FX
        // In practice, the kind is determined by the asset's actual data
    }

    #[test]
    fn test_parse_fx_id() {
        let parsed = parse_asset_id("EUR:USD").unwrap();
        assert_eq!(parsed.primary, "EUR");
        assert_eq!(parsed.qualifier, "USD");
        assert_eq!(parsed.kind, Some(AssetKind::FxRate));
    }

    #[test]
    fn test_parse_cash_id() {
        let parsed = parse_asset_id("CASH:USD").unwrap();
        assert_eq!(parsed.primary, "CASH");
        assert_eq!(parsed.qualifier, "USD");
        assert_eq!(parsed.kind, Some(AssetKind::Cash));
    }

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
        assert!(id.starts_with("PROP:"), "ID should start with PROP: - got {}", id);
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
        assert!(id.starts_with("VEH:"), "ID should start with VEH: - got {}", id);
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
        assert!(id.starts_with("ALT:"), "ID should start with ALT: - got {}", id);
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
}
