//! Activity review flag logic and metadata building for broker sync.
//!
//! This module handles:
//! - Determining whether activities need user review
//! - Building metadata JSON for activity records
//! - Resolving asset symbols with fallback logic
//!
//! Note: Subtype mapping is now done by the API - this module uses the subtype
//! field directly from the API response.

use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;

use super::models::AccountUniversalActivity;
use wealthfolio_core::activities::{self, NewActivity, SymbolInput};
use wealthfolio_core::fx::currency::{get_normalization_rule, normalize_amount, resolve_currency};

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

/// Check if a broker symbol type code represents a crypto asset.
pub fn is_broker_crypto(code: Option<&str>) -> bool {
    matches!(
        code.map(|c| c.to_uppercase()).as_deref(),
        Some("CRYPTOCURRENCY" | "CRYPTO")
    )
}

/// Maps a broker API activity into a `NewActivity` with unresolved `SymbolInput`.
///
/// The returned `NewActivity` has `SymbolInput { symbol, exchange_mic, kind }` set
/// so that `prepare_activities()` can handle asset creation and dedup via `instrument_key`.
///
/// Returns `None` if the activity should be skipped (e.g. no id).
pub fn map_broker_activity(
    activity: &AccountUniversalActivity,
    account_id: &str,
    account_currency: Option<&str>,
    base_currency: Option<&str>,
) -> Option<NewActivity> {
    // Must have an id
    let activity_id = activity.id.clone().filter(|v| !v.trim().is_empty())?;

    let activity_currency = activity
        .currency
        .as_ref()
        .and_then(|c| c.code.clone())
        .filter(|c| !c.trim().is_empty());

    // Get activity type from API
    let activity_type = activity
        .activity_type
        .clone()
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "UNKNOWN".to_string());

    let subtype = activity.subtype.clone();

    // Calculate needs_review flag
    let needs_review_flag = needs_review(activity);

    // Build metadata JSON
    let metadata = build_activity_metadata(activity);

    let is_cash_like = matches!(
        activity_type.as_str(),
        activities::ACTIVITY_TYPE_DEPOSIT
            | activities::ACTIVITY_TYPE_WITHDRAWAL
            | activities::ACTIVITY_TYPE_INTEREST
            | activities::ACTIVITY_TYPE_FEE
            | activities::ACTIVITY_TYPE_TAX
            | activities::ACTIVITY_TYPE_TRANSFER_IN
            | activities::ACTIVITY_TYPE_TRANSFER_OUT
            | activities::ACTIVITY_TYPE_CREDIT
    );

    // Extract symbol reference for convenience
    let symbol_ref = activity.symbol.as_ref();
    let symbol_type_ref = symbol_ref.and_then(|s| s.symbol_type.as_ref());
    let symbol_type_code = symbol_type_ref.and_then(|t| t.code.as_deref());
    let is_crypto = is_broker_crypto(symbol_type_code);

    // Extract exchange MIC from broker data (prefer mic_code over code)
    let exchange_mic = symbol_ref.and_then(|s| s.exchange.as_ref()).and_then(|e| {
        e.mic_code
            .clone()
            .filter(|c| !c.trim().is_empty())
            .or_else(|| e.code.clone().filter(|c| !c.trim().is_empty()))
    });

    // Get the symbol's currency
    let symbol_currency = symbol_ref
        .and_then(|s| s.currency.as_ref())
        .and_then(|c| c.code.clone())
        .filter(|c| !c.trim().is_empty());

    let currency_code = resolve_currency(&[
        activity_currency.as_deref().unwrap_or(""),
        symbol_currency.as_deref().unwrap_or(""),
        account_currency.unwrap_or(""),
        base_currency.unwrap_or(""),
    ]);

    // Determine the display symbol based on asset type
    let display_symbol: Option<String> = if is_crypto {
        // For crypto: raw_symbol > extract base from symbol field
        symbol_ref
            .and_then(|s| s.raw_symbol.clone())
            .filter(|r| !r.trim().is_empty())
            .or_else(|| {
                symbol_ref
                    .and_then(|s| s.symbol.clone())
                    .filter(|sym| !sym.trim().is_empty())
                    .map(|sym| sym.split('-').next().unwrap_or(&sym).to_string())
            })
    } else {
        // For securities: raw_symbol > symbol (without exchange suffix)
        symbol_ref
            .and_then(|s| s.raw_symbol.clone())
            .filter(|r| !r.trim().is_empty())
            .or_else(|| {
                symbol_ref
                    .and_then(|s| s.symbol.clone())
                    .filter(|sym| !sym.trim().is_empty())
                    .map(|sym| sym.split('.').next().unwrap_or(&sym).to_string())
            })
    };

    // Also get option symbol if present
    let option_symbol = activity
        .option_symbol
        .as_ref()
        .and_then(|s| s.ticker.clone())
        .filter(|t| !t.trim().is_empty());

    // Build SymbolInput for non-cash activities that have a symbol
    let symbol_input = if is_cash_like && display_symbol.is_none() && option_symbol.is_none() {
        // Cash activity without symbol - no asset needed
        None
    } else {
        let symbol = option_symbol.clone().or(display_symbol.clone());
        symbol.map(|sym| {
            let kind_hint = if is_crypto {
                Some("CRYPTO".to_string())
            } else {
                None
            };
            let asset_name = symbol_ref
                .and_then(|s| s.description.clone())
                .filter(|d| !d.trim().is_empty());
            SymbolInput {
                id: None, // Let prepare_activities resolve via instrument_key
                symbol: Some(sym),
                exchange_mic: exchange_mic.clone(),
                kind: kind_hint,
                name: asset_name,
                quote_mode: None,
            }
        })
    };

    let activity_date = activity
        .trade_date
        .clone()
        .or(activity.settlement_date.clone())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    let quantity = activity.units.and_then(Decimal::from_f64).map(|d| d.abs());
    let unit_price = activity.price.and_then(Decimal::from_f64).map(|d| d.abs());
    let fee = activity.fee.and_then(Decimal::from_f64).map(|d| d.abs());
    let amount = activity.amount.and_then(Decimal::from_f64).map(|d| d.abs());
    let fx_rate = activity.fx_rate.and_then(Decimal::from_f64);

    // Normalize minor currency units (e.g., GBp -> GBP) and convert amounts
    let (unit_price, quantity, fee, amount, currency_code) =
        if get_normalization_rule(&currency_code).is_some() {
            let norm_price = unit_price.map(|p| normalize_amount(p, &currency_code).0);
            let norm_fee = fee.map(|f| normalize_amount(f, &currency_code).0);
            let norm_amount = amount.map(|a| normalize_amount(a, &currency_code).0);
            let (_, norm_currency) = normalize_amount(Decimal::ZERO, &currency_code);
            (
                norm_price,
                quantity,
                norm_fee,
                norm_amount,
                norm_currency.to_string(),
            )
        } else {
            (unit_price, quantity, fee, amount, currency_code)
        };

    // Determine status
    let status = if needs_review_flag {
        wealthfolio_core::activities::ActivityStatus::Draft
    } else {
        wealthfolio_core::activities::ActivityStatus::Posted
    };

    Some(NewActivity {
        id: Some(activity_id),
        account_id: account_id.to_string(),
        symbol: symbol_input,
        activity_type,
        subtype,
        activity_date,
        quantity,
        unit_price,
        currency: currency_code,
        fee,
        amount,
        status: Some(status),
        notes: activity
            .description
            .clone()
            .filter(|d| !d.trim().is_empty())
            .or(activity.external_reference_id.clone()),
        fx_rate,
        metadata,
        needs_review: Some(needs_review_flag),
        source_system: activity
            .source_system
            .clone()
            .or(Some("SNAPTRADE".to_string())),
        source_record_id: activity.source_record_id.clone().or(activity.id.clone()),
        source_group_id: activity.source_group_id.clone(),
    })
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
