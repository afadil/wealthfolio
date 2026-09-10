//! Custom asset logo override domain models and PNG validation.
//!
//! Logo bytes are stored as base64 text so a row can ride device sync (which
//! has no blob channel) and DB-only backups unchanged.
//!
//! Size budget by construction: a max-size logo (150 KB) base64-encodes to
//! ~205 KB, so a serialized `asset_logos` row stays under the 250,000-char sync
//! payload budget without a runtime branch.

use base64::engine::general_purpose::{STANDARD as BASE64_STANDARD, STANDARD_NO_PAD};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::errors::{Error, Result, ValidationError};

/// Maximum decoded PNG size accepted for a logo.
pub const MAX_ASSET_LOGO_BYTES: usize = 150 * 1024;
/// Maximum width/height (pixels) accepted for a logo.
pub const MAX_ASSET_LOGO_DIMENSION: u32 = 256;
/// MIME type written for every v1 logo.
pub const ASSET_LOGO_MIME_PNG: &str = "image/png";

/// Largest base64 input we bother decoding (`MAX_ASSET_LOGO_BYTES` encoded, plus padding).
const MAX_ASSET_LOGO_BASE64_LEN: usize = MAX_ASSET_LOGO_BYTES * 4 / 3 + 4;
const DATA_URI_PNG_PREFIX: &str = "data:image/png;base64,";
const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetLogo {
    pub asset_id: String,
    pub mime_type: String,
    pub data_base64: String,
    pub sha256: String,
    pub width: i32,
    pub height: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Lightweight index entry (no bytes) for the frontend logo registry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetLogoSummary {
    pub asset_id: String,
    pub display_code: Option<String>,
    pub sha256: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertAssetLogo {
    pub data_base64: String,
}

/// Result of a successful `decode_and_validate`.
#[derive(Debug, Clone, PartialEq)]
pub struct ValidatedPng {
    pub bytes: Vec<u8>,
    pub sha256_hex: String,
    pub width: u32,
    pub height: u32,
}

fn invalid(message: impl Into<String>) -> Error {
    Error::Validation(ValidationError::InvalidInput(message.into()))
}

/// Decodes base64 PNG input and enforces the v1 logo constraints.
///
/// Order: strip optional `data:image/png;base64,` prefix; reject oversized
/// input before decoding; decode (STANDARD, falling back to NO_PAD); check
/// decoded size; PNG signature + IHDR; width/height in 1..=256; sha256.
pub fn decode_and_validate(input: &str) -> Result<ValidatedPng> {
    let trimmed = input.trim();
    let encoded = trimmed.strip_prefix(DATA_URI_PNG_PREFIX).unwrap_or(trimmed);
    if encoded.is_empty() {
        return Err(invalid("Logo image data is empty"));
    }
    if encoded.len() > MAX_ASSET_LOGO_BASE64_LEN {
        return Err(invalid(format!(
            "Logo image exceeds the maximum size of {} KB",
            MAX_ASSET_LOGO_BYTES / 1024
        )));
    }

    let bytes = BASE64_STANDARD
        .decode(encoded)
        .or_else(|_| STANDARD_NO_PAD.decode(encoded))
        .map_err(|_| invalid("Logo image data is not valid base64"))?;

    if bytes.len() > MAX_ASSET_LOGO_BYTES {
        return Err(invalid(format!(
            "Logo image exceeds the maximum size of {} KB",
            MAX_ASSET_LOGO_BYTES / 1024
        )));
    }
    if bytes.len() < 24 || bytes[..8] != PNG_SIGNATURE {
        return Err(invalid("Logo image must be a PNG"));
    }
    if &bytes[12..16] != b"IHDR" {
        return Err(invalid("Logo PNG is missing its IHDR chunk"));
    }

    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    let dimension_range = 1..=MAX_ASSET_LOGO_DIMENSION;
    if !dimension_range.contains(&width) || !dimension_range.contains(&height) {
        return Err(invalid(format!(
            "Logo dimensions {}x{} must be between 1 and {} pixels",
            width, height, MAX_ASSET_LOGO_DIMENSION
        )));
    }

    let sha256_hex = hex::encode(Sha256::digest(&bytes));

    Ok(ValidatedPng {
        bytes,
        sha256_hex,
        width,
        height,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 1x1 RGBA PNG (70 bytes).
    const ONE_PX_PNG_BASE64: &str =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const ONE_PX_PNG_SHA256: &str =
        "497790947d4666760ce38f3c00e852c71fdb66cae849bae8e9ede352719e1581";

    fn png_header(width: u32, height: u32, total_len: usize) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(total_len.max(24));
        bytes.extend_from_slice(&PNG_SIGNATURE);
        bytes.extend_from_slice(&13u32.to_be_bytes());
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes.resize(total_len.max(24), 0);
        bytes
    }

    fn error_message(err: Error) -> String {
        match err {
            Error::Validation(ValidationError::InvalidInput(msg)) => msg,
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    #[test]
    fn accepts_valid_one_pixel_png_and_hashes_it() {
        let validated = decode_and_validate(ONE_PX_PNG_BASE64).expect("valid png");
        assert_eq!(validated.width, 1);
        assert_eq!(validated.height, 1);
        assert_eq!(validated.bytes.len(), 70);
        assert_eq!(validated.sha256_hex, ONE_PX_PNG_SHA256);
    }

    #[test]
    fn strips_data_uri_prefix() {
        let with_prefix = format!("data:image/png;base64,{ONE_PX_PNG_BASE64}");
        let validated = decode_and_validate(&with_prefix).expect("valid png with prefix");
        assert_eq!(validated.sha256_hex, ONE_PX_PNG_SHA256);
    }

    #[test]
    fn accepts_unpadded_base64() {
        let unpadded = ONE_PX_PNG_BASE64.trim_end_matches('=');
        let validated = decode_and_validate(unpadded).expect("unpadded base64");
        assert_eq!(validated.sha256_hex, ONE_PX_PNG_SHA256);
    }

    #[test]
    fn rejects_oversized_encoded_input_before_decoding() {
        // Not valid base64 at all: if we reached the decoder this would fail
        // with the base64 message instead of the size message.
        let input = "!".repeat(MAX_ASSET_LOGO_BASE64_LEN + 1);
        let msg = error_message(decode_and_validate(&input).unwrap_err());
        assert!(msg.contains("maximum size"), "{msg}");
    }

    #[test]
    fn rejects_invalid_base64() {
        let msg = error_message(decode_and_validate("not*base64*at*all").unwrap_err());
        assert!(msg.contains("not valid base64"), "{msg}");
    }

    #[test]
    fn rejects_empty_input() {
        let msg = error_message(decode_and_validate("   ").unwrap_err());
        assert!(msg.contains("empty"), "{msg}");
    }

    #[test]
    fn rejects_truncated_signature() {
        let mut bytes = png_header(1, 1, 64);
        bytes[1] = b'X';
        let msg = error_message(decode_and_validate(&BASE64_STANDARD.encode(&bytes)).unwrap_err());
        assert!(msg.contains("must be a PNG"), "{msg}");
    }

    #[test]
    fn rejects_non_png_bytes() {
        let msg = error_message(
            decode_and_validate(&BASE64_STANDARD.encode(b"GIF89a this is not a png at all"))
                .unwrap_err(),
        );
        assert!(msg.contains("must be a PNG"), "{msg}");
    }

    #[test]
    fn rejects_missing_ihdr() {
        let mut bytes = png_header(1, 1, 64);
        bytes[12..16].copy_from_slice(b"IDAT");
        let msg = error_message(decode_and_validate(&BASE64_STANDARD.encode(&bytes)).unwrap_err());
        assert!(msg.contains("IHDR"), "{msg}");
    }

    #[test]
    fn rejects_zero_and_oversized_dimensions() {
        for (w, h) in [(0, 1), (1, 0), (257, 1), (1, 257)] {
            let bytes = png_header(w, h, 64);
            let msg =
                error_message(decode_and_validate(&BASE64_STANDARD.encode(&bytes)).unwrap_err());
            assert!(msg.contains("dimensions"), "{w}x{h}: {msg}");
        }
        let ok = decode_and_validate(&BASE64_STANDARD.encode(png_header(256, 256, 64)))
            .expect("256x256 accepted");
        assert_eq!((ok.width, ok.height), (256, 256));
    }

    #[test]
    fn rejects_decoded_bytes_over_limit() {
        let bytes = png_header(1, 1, MAX_ASSET_LOGO_BYTES + 1);
        let msg = error_message(decode_and_validate(&BASE64_STANDARD.encode(&bytes)).unwrap_err());
        assert!(msg.contains("maximum size"), "{msg}");

        let at_limit = png_header(1, 1, MAX_ASSET_LOGO_BYTES);
        decode_and_validate(&BASE64_STANDARD.encode(&at_limit)).expect("exactly 150 KB accepted");
    }
}
