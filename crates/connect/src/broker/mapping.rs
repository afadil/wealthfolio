//! Activity review flag logic and metadata building for broker sync.
//!
//! This module handles:
//! - Determining whether activities need user review
//! - Building metadata JSON for activity records
//! - Resolving asset symbols with fallback logic
//!
//! Note: Subtype mapping is now done by the API - this module uses the subtype
//! field directly from the API response.

use super::models::AccountUniversalActivity;

/// Minimum confidence score to consider a mapping reliable
const CONFIDENCE_THRESHOLD: f64 = 0.7;

/// Determine if an activity needs user review based on various signals.
///
/// Returns `true` if the activity should be flagged for review.
pub fn needs_review(activity: &AccountUniversalActivity) -> bool {
    // 1. API explicitly flagged for review
    if activity.needs_review {
        return true;
    }

    // 2. Activity type is UNKNOWN
    if let Some(ref activity_type) = activity.activity_type {
        if activity_type.to_uppercase() == "UNKNOWN" {
            return true;
        }
    } else {
        // No activity type at all - needs review
        return true;
    }

    // 3. Check mapping metadata
    if let Some(ref metadata) = activity.mapping_metadata {
        // Low confidence mapping
        if let Some(confidence) = metadata.confidence {
            if confidence < CONFIDENCE_THRESHOLD {
                return true;
            }
        }

        // Has warning reasons
        if has_warning_reasons(&metadata.reasons) {
            return true;
        }
    }

    false
}

/// Check if the reasons list contains any warning-level reasons.
fn has_warning_reasons(reasons: &[String]) -> bool {
    // Common warning patterns from the API
    let warning_patterns = [
        "unknown",
        "unrecognized",
        "ambiguous",
        "multiple",
        "conflict",
        "manual",
        "review",
        "unsupported",
    ];

    for reason in reasons {
        let reason_lower = reason.to_lowercase();
        for pattern in &warning_patterns {
            if reason_lower.contains(pattern) {
                return true;
            }
        }
    }

    false
}

/// Build metadata JSON for storing in the activity record.
///
/// Extracts relevant fields from the API metadata and formats them for storage.
pub fn build_activity_metadata(activity: &AccountUniversalActivity) -> Option<String> {
    let mut metadata = serde_json::Map::new();

    // Add flow.is_external for transfers
    if let Some(ref mapping_meta) = activity.mapping_metadata {
        if let Some(ref flow) = mapping_meta.flow {
            metadata.insert(
                "flow".to_string(),
                serde_json::json!({
                    "is_external": flow.is_external
                }),
            );
        }

        // Add confidence score
        if let Some(confidence) = mapping_meta.confidence {
            metadata.insert("confidence".to_string(), serde_json::json!(confidence));
        }

        // Add mapping reasons (for debugging/review)
        if !mapping_meta.reasons.is_empty() {
            metadata.insert(
                "mapping_reasons".to_string(),
                serde_json::json!(mapping_meta.reasons),
            );
        }
    }

    // Add raw_type from provider
    if let Some(ref raw_type) = activity.raw_type {
        metadata.insert("raw_type".to_string(), serde_json::json!(raw_type));
    }

    // Add source system info
    if let Some(ref source_system) = activity.source_system {
        metadata.insert(
            "source_system".to_string(),
            serde_json::json!(source_system),
        );
    }

    if let Some(ref source_record_id) = activity.source_record_id {
        metadata.insert(
            "source_record_id".to_string(),
            serde_json::json!(source_record_id),
        );
    }

    if let Some(ref source_group_id) = activity.source_group_id {
        metadata.insert(
            "source_group_id".to_string(),
            serde_json::json!(source_group_id),
        );
    }

    if metadata.is_empty() {
        None
    } else {
        serde_json::to_string(&serde_json::Value::Object(metadata)).ok()
    }
}

/// Resolve the asset symbol from an activity, with fallback logic.
///
/// Priority:
/// 1. option_symbol.ticker (for options)
/// 2. symbol.symbol
/// 3. $CASH-{currency} (for cash transactions)
/// 4. $UNKNOWN-{currency} (fallback)
pub fn resolve_asset_symbol(
    activity: &AccountUniversalActivity,
    fallback_currency: Option<&str>,
) -> String {
    // 1. Option symbol takes priority
    if let Some(ref option_symbol) = activity.option_symbol {
        if let Some(ref ticker) = option_symbol.ticker {
            if !ticker.is_empty() {
                return ticker.clone();
            }
        }
    }

    // 2. Regular symbol
    if let Some(ref symbol) = activity.symbol {
        if let Some(ref sym) = symbol.symbol {
            if !sym.is_empty() {
                return sym.clone();
            }
        }
    }

    // 3. Cash symbol based on currency
    let currency = activity
        .currency
        .as_ref()
        .and_then(|c| c.code.clone())
        .filter(|c| !c.trim().is_empty())
        .or_else(|| fallback_currency.filter(|c| !c.is_empty()).map(|c| c.to_string()))
        .unwrap_or_else(|| "USD".to_string());

    // Check if this is a cash-only transaction (deposit, withdrawal, fee, etc.)
    if is_cash_activity(activity) {
        return format!("$CASH-{}", currency);
    }

    // 4. Unknown symbol
    format!("$UNKNOWN-{}", currency)
}

/// Check if an activity is a cash-only transaction (no security involved).
fn is_cash_activity(activity: &AccountUniversalActivity) -> bool {
    let activity_type = activity
        .activity_type
        .as_ref()
        .map(|t| t.to_uppercase())
        .unwrap_or_default();

    matches!(
        activity_type.as_str(),
        "DEPOSIT"
            | "WITHDRAWAL"
            | "TRANSFER_IN"
            | "TRANSFER_OUT"
            | "FEE"
            | "TAX"
            | "CREDIT"
            | "INTEREST"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::broker::models::MappingMetadata;

    #[test]
    fn test_needs_review_unknown_type() {
        let activity = AccountUniversalActivity {
            activity_type: Some("UNKNOWN".to_string()),
            ..Default::default()
        };
        assert!(needs_review(&activity));
    }

    #[test]
    fn test_needs_review_low_confidence() {
        let activity = AccountUniversalActivity {
            activity_type: Some("BUY".to_string()),
            mapping_metadata: Some(MappingMetadata {
                confidence: Some(0.5),
                ..Default::default()
            }),
            ..Default::default()
        };
        assert!(needs_review(&activity));
    }

    #[test]
    fn test_needs_review_high_confidence() {
        let activity = AccountUniversalActivity {
            activity_type: Some("BUY".to_string()),
            mapping_metadata: Some(MappingMetadata {
                confidence: Some(0.9),
                reasons: vec![],
                ..Default::default()
            }),
            ..Default::default()
        };
        assert!(!needs_review(&activity));
    }

    #[test]
    fn test_warning_reasons() {
        assert!(has_warning_reasons(&[
            "Unknown transaction type".to_string()
        ]));
        assert!(has_warning_reasons(&["Ambiguous mapping".to_string()]));
        assert!(!has_warning_reasons(&["Matched by symbol".to_string()]));
        assert!(!has_warning_reasons(&[]));
    }
}
