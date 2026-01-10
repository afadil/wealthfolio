/// Activity types
///
/// Each constant represents one of the supported activity categories.
/// The descriptions mirror `docs/activity-types.md` for quick reference.

/// Purchase of a security or other asset. Decreases cash and increases quantity.
pub const ACTIVITY_TYPE_BUY: &str = "BUY";

/// Disposal of a security or other asset. Increases cash and decreases quantity.
pub const ACTIVITY_TYPE_SELL: &str = "SELL";

/// Cash dividend paid into the account. Increases cash.
pub const ACTIVITY_TYPE_DIVIDEND: &str = "DIVIDEND";

/// Interest earned on cash or fixed-income positions. Increases cash.
pub const ACTIVITY_TYPE_INTEREST: &str = "INTEREST";

/// Incoming funds from outside Wealthfolio. Increases cash.
pub const ACTIVITY_TYPE_DEPOSIT: &str = "DEPOSIT";

/// Outgoing funds to an external account. Decreases cash.
pub const ACTIVITY_TYPE_WITHDRAWAL: &str = "WITHDRAWAL";

/// Move cash or assets into this account. Asset cost basis is preserved.
/// Default: internal move (no net contribution).
/// Can be external: when from untracked world (metadata.flow.is_external=true).
/// Increases cash or quantity.
pub const ACTIVITY_TYPE_TRANSFER_IN: &str = "TRANSFER_IN";

/// Move cash or assets out of this account. Asset cost basis is exported.
/// Default: internal move (no net contribution).
/// Can be external: when to untracked world (metadata.flow.is_external=true).
/// Decreases cash or quantity.
pub const ACTIVITY_TYPE_TRANSFER_OUT: &str = "TRANSFER_OUT";

/// Stand-alone brokerage or platform fee not tied to a trade. Decreases cash.
pub const ACTIVITY_TYPE_FEE: &str = "FEE";

/// Tax paid from the account (e.g., withholding or realised CGT). Decreases cash.
pub const ACTIVITY_TYPE_TAX: &str = "TAX";

/// Stock split or reverse split. Adjusts quantity and per-share cost without affecting total value.
pub const ACTIVITY_TYPE_SPLIT: &str = "SPLIT";

/// Cash-only credit: refunds, rebates, bonuses.
/// Default: does NOT affect net_contribution unless metadata.flow.is_external=true.
pub const ACTIVITY_TYPE_CREDIT: &str = "CREDIT";

/// Non-trade correction / transformation (usually no cash).
/// Examples: option expire worthless, RoC basis adjustment, merger/spinoff compiler input.
pub const ACTIVITY_TYPE_ADJUSTMENT: &str = "ADJUSTMENT";

/// Unknown or unmapped activity type. Requires user review.
pub const ACTIVITY_TYPE_UNKNOWN: &str = "UNKNOWN";

/// Trading activity types
pub const TRADING_ACTIVITY_TYPES: [&str; 3] =
    [ACTIVITY_TYPE_BUY, ACTIVITY_TYPE_SELL, ACTIVITY_TYPE_SPLIT];

/// Income activity types
pub const INCOME_ACTIVITY_TYPES: [&str; 2] = [ACTIVITY_TYPE_DIVIDEND, ACTIVITY_TYPE_INTEREST];

/// Cash-only activity types (no asset/security involved)
/// These activities can have asset_id = None, and will use CASH:{currency} format when needed.
pub const CASH_ACTIVITY_TYPES: [&str; 8] = [
    ACTIVITY_TYPE_DEPOSIT,
    ACTIVITY_TYPE_WITHDRAWAL,
    ACTIVITY_TYPE_INTEREST,
    ACTIVITY_TYPE_TRANSFER_IN,
    ACTIVITY_TYPE_TRANSFER_OUT,
    ACTIVITY_TYPE_TAX,
    ACTIVITY_TYPE_FEE,
    ACTIVITY_TYPE_CREDIT,
];

/// Checks if an activity type is a cash-only activity (no security involved).
/// Cash activities can have asset_id = None and will use CASH:{currency} format when needed.
pub fn is_cash_activity(activity_type: &str) -> bool {
    CASH_ACTIVITY_TYPES.contains(&activity_type)
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Subtypes
// ─────────────────────────────────────────────────────────────────────────────
// Subtypes provide semantic variations of activity types without schema changes.
// The compiler expands these into canonical activity type postings.

/// DRIP (Dividend Reinvestment Plan): Dividend automatically reinvested in shares.
/// Expands to: DIVIDEND + BUY
pub const ACTIVITY_SUBTYPE_DRIP: &str = "DRIP";

/// Staking Reward: Crypto staking income received as tokens.
/// Expands to: INTEREST + BUY
pub const ACTIVITY_SUBTYPE_STAKING_REWARD: &str = "STAKING_REWARD";

/// Dividend in Kind: Dividend paid in a different asset (e.g., spinoff shares).
/// Expands to: DIVIDEND + TRANSFER_IN (with metadata.flow.is_external=true)
pub const ACTIVITY_SUBTYPE_DIVIDEND_IN_KIND: &str = "DIVIDEND_IN_KIND";

/// Stock Dividend: Additional shares of the same asset as dividend.
/// Passes through as SPLIT (adjusts quantity without cash movement).
pub const ACTIVITY_SUBTYPE_STOCK_DIVIDEND: &str = "STOCK_DIVIDEND";

/// Opening Position: Initial position for manual/alternative assets (property, vehicle, etc.).
/// Passes through unchanged as TRANSFER_IN - no expansion needed.
pub const ACTIVITY_SUBTYPE_OPENING_POSITION: &str = "OPENING_POSITION";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_cash_activity_returns_true_for_cash_types() {
        // All cash activity types should return true
        assert!(is_cash_activity(ACTIVITY_TYPE_DEPOSIT));
        assert!(is_cash_activity(ACTIVITY_TYPE_WITHDRAWAL));
        assert!(is_cash_activity(ACTIVITY_TYPE_INTEREST));
        assert!(is_cash_activity(ACTIVITY_TYPE_TRANSFER_IN));
        assert!(is_cash_activity(ACTIVITY_TYPE_TRANSFER_OUT));
        assert!(is_cash_activity(ACTIVITY_TYPE_TAX));
        assert!(is_cash_activity(ACTIVITY_TYPE_FEE));
        assert!(is_cash_activity(ACTIVITY_TYPE_CREDIT));
    }

    #[test]
    fn test_is_cash_activity_returns_false_for_non_cash_types() {
        // Non-cash activity types should return false
        assert!(!is_cash_activity(ACTIVITY_TYPE_BUY));
        assert!(!is_cash_activity(ACTIVITY_TYPE_SELL));
        assert!(!is_cash_activity(ACTIVITY_TYPE_DIVIDEND));
        assert!(!is_cash_activity(ACTIVITY_TYPE_SPLIT));
        assert!(!is_cash_activity(ACTIVITY_TYPE_ADJUSTMENT));
        assert!(!is_cash_activity(ACTIVITY_TYPE_UNKNOWN));
    }

    #[test]
    fn test_is_cash_activity_returns_false_for_invalid_types() {
        // Invalid/unknown types should return false
        assert!(!is_cash_activity("INVALID"));
        assert!(!is_cash_activity(""));
        assert!(!is_cash_activity("buy")); // lowercase
    }
}
