//! Asset ID generation and validation for alternative assets.
//!
//! This module provides utilities for generating and validating prefixed asset IDs
//! for alternative assets (properties, vehicles, collectibles, etc.).
//!
//! ## ID Format
//!
//! Asset IDs follow the format: `{PREFIX}-{NANOID_8}`
//!
//! Where:
//! - `PREFIX` identifies the asset kind (PROP, VEH, COLL, PREC, LIAB, ALT)
//! - `NANOID_8` is an 8-character alphanumeric random string
//!
//! ## Examples
//!
//! ```
//! use wealthfolio_core::assets::{AssetKind, generate_asset_id, is_valid_alternative_asset_id};
//!
//! // Generate a new property asset ID
//! let id = generate_asset_id(&AssetKind::Property);
//! assert!(id.starts_with("PROP-"));
//! assert!(is_valid_alternative_asset_id(&id));
//!
//! // Validate an existing ID
//! assert!(is_valid_alternative_asset_id("PROP-a1B2c3D4"));
//! assert!(!is_valid_alternative_asset_id("INVALID-12345678"));
//! ```

use super::AssetKind;
use lazy_static::lazy_static;
use regex::Regex;
use uuid::Uuid;

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

/// Length of the random portion of the asset ID
const RANDOM_ID_LENGTH: usize = 8;

/// Alphabet for generating random IDs (alphanumeric: a-z, A-Z, 0-9)
const ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

lazy_static! {
    /// Regex pattern for validating alternative asset IDs
    /// Format: ^(PROP|VEH|COLL|PREC|LIAB|ALT)-[a-zA-Z0-9]{8}$
    static ref ASSET_ID_REGEX: Regex =
        Regex::new(r"^(PROP|VEH|COLL|PREC|LIAB|ALT)-[a-zA-Z0-9]{8}$")
            .expect("Invalid regex pattern");
}

/// Gets the prefix for a given asset kind.
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
/// The generated ID follows the format: `{PREFIX}-{RANDOM_8}`
///
/// # Arguments
///
/// * `kind` - The asset kind to generate an ID for
///
/// # Returns
///
/// A unique asset ID string (e.g., "PROP-a1B2c3D4")
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
/// assert!(property_id.starts_with("PROP-"));
/// assert_eq!(property_id.len(), 13); // "PROP-" (5) + 8 random chars
///
/// let liability_id = generate_asset_id(&AssetKind::Liability);
/// assert!(liability_id.starts_with("LIAB-"));
/// ```
pub fn generate_asset_id(kind: &AssetKind) -> String {
    let prefix = get_asset_id_prefix(kind)
        .expect("generate_asset_id called with non-alternative asset kind");
    let random_part = generate_random_id();
    format!("{}-{}", prefix, random_part)
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
        format!("{}-{}", prefix, random_part)
    })
}

/// Validates whether a string is a valid alternative asset ID.
///
/// A valid ID must match the pattern: `^(PROP|VEH|COLL|PREC|LIAB|ALT)-[a-zA-Z0-9]{8}$`
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
/// assert!(is_valid_alternative_asset_id("PROP-a1B2c3D4"));
/// assert!(is_valid_alternative_asset_id("VEH-12345678"));
/// assert!(is_valid_alternative_asset_id("LIAB-AbCdEfGh"));
///
/// // Invalid IDs
/// assert!(!is_valid_alternative_asset_id("PROP-short"));      // Too short
/// assert!(!is_valid_alternative_asset_id("INVALID-12345678")); // Invalid prefix
/// assert!(!is_valid_alternative_asset_id("PROP-a1b2c3d4e"));   // Too long
/// assert!(!is_valid_alternative_asset_id("PROP-a1b2c3d!"));    // Invalid character
/// ```
pub fn is_valid_alternative_asset_id(id: &str) -> bool {
    ASSET_ID_REGEX.is_match(id)
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
/// assert_eq!(get_kind_from_asset_id("PROP-a1B2c3D4"), Some(AssetKind::Property));
/// assert_eq!(get_kind_from_asset_id("VEH-12345678"), Some(AssetKind::Vehicle));
/// assert_eq!(get_kind_from_asset_id("INVALID-12345678"), None);
/// ```
pub fn get_kind_from_asset_id(id: &str) -> Option<AssetKind> {
    if !is_valid_alternative_asset_id(id) {
        return None;
    }

    // Extract the prefix (everything before the dash)
    let prefix = id.split('-').next()?;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_property_id() {
        let id = generate_asset_id(&AssetKind::Property);
        assert!(id.starts_with("PROP-"), "ID should start with PROP-: {}", id);
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
        assert!(id.starts_with("VEH-"), "ID should start with VEH-: {}", id);
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
            id.starts_with("COLL-"),
            "ID should start with COLL-: {}",
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
            id.starts_with("PREC-"),
            "ID should start with PREC-: {}",
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
            id.starts_with("LIAB-"),
            "ID should start with LIAB-: {}",
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
        assert!(id.starts_with("ALT-"), "ID should start with ALT-: {}", id);
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
        // Valid IDs
        assert!(is_valid_alternative_asset_id("PROP-a1B2c3D4"));
        assert!(is_valid_alternative_asset_id("VEH-12345678"));
        assert!(is_valid_alternative_asset_id("COLL-AbCdEfGh"));
        assert!(is_valid_alternative_asset_id("PREC-aBcDeFgH"));
        assert!(is_valid_alternative_asset_id("LIAB-00000000"));
        assert!(is_valid_alternative_asset_id("ALT-zzzzzzzz"));
    }

    #[test]
    fn test_invalid_asset_ids() {
        // Invalid prefix
        assert!(!is_valid_alternative_asset_id("INVALID-12345678"));
        assert!(!is_valid_alternative_asset_id("prop-12345678")); // lowercase prefix
        assert!(!is_valid_alternative_asset_id("SEC-12345678")); // not a valid prefix

        // Wrong length
        assert!(!is_valid_alternative_asset_id("PROP-short")); // too short
        assert!(!is_valid_alternative_asset_id("PROP-a1b2c3d4e")); // too long
        assert!(!is_valid_alternative_asset_id("PROP-")); // missing random part

        // Invalid characters
        assert!(!is_valid_alternative_asset_id("PROP-a1b2c3d!")); // special char
        assert!(!is_valid_alternative_asset_id("PROP-a1b2c3d ")); // space
        assert!(!is_valid_alternative_asset_id("PROP_12345678")); // underscore instead of dash

        // Missing components
        assert!(!is_valid_alternative_asset_id("PROP")); // no dash
        assert!(!is_valid_alternative_asset_id("12345678")); // no prefix
        assert!(!is_valid_alternative_asset_id("")); // empty
    }

    #[test]
    fn test_get_kind_from_asset_id() {
        assert_eq!(
            get_kind_from_asset_id("PROP-a1B2c3D4"),
            Some(AssetKind::Property)
        );
        assert_eq!(
            get_kind_from_asset_id("VEH-12345678"),
            Some(AssetKind::Vehicle)
        );
        assert_eq!(
            get_kind_from_asset_id("COLL-AbCdEfGh"),
            Some(AssetKind::Collectible)
        );
        assert_eq!(
            get_kind_from_asset_id("PREC-aBcDeFgH"),
            Some(AssetKind::PhysicalPrecious)
        );
        assert_eq!(
            get_kind_from_asset_id("LIAB-00000000"),
            Some(AssetKind::Liability)
        );
        assert_eq!(
            get_kind_from_asset_id("ALT-zzzzzzzz"),
            Some(AssetKind::Other)
        );

        // Invalid IDs return None
        assert_eq!(get_kind_from_asset_id("INVALID-12345678"), None);
        assert_eq!(get_kind_from_asset_id("PROP-short"), None);
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
            let random_part = &id[5..]; // Skip "PROP-"
            assert!(
                random_part.chars().all(|c| c.is_ascii_alphanumeric()),
                "Random part should only contain alphanumeric chars: {}",
                random_part
            );
        }
    }
}
