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

/// Move cash or assets into this account from another Wealthfolio account.
/// Asset cost basis is preserved. Increases cash or quantity.
pub const ACTIVITY_TYPE_TRANSFER_IN: &str = "TRANSFER_IN";

/// Move cash or assets out of this account. Asset cost basis is exported.
/// Decreases cash or quantity.
pub const ACTIVITY_TYPE_TRANSFER_OUT: &str = "TRANSFER_OUT";

/// Stand-alone brokerage or platform fee not tied to a trade. Decreases cash.
pub const ACTIVITY_TYPE_FEE: &str = "FEE";

/// Tax paid from the account (e.g., withholding or realised CGT). Decreases cash.
pub const ACTIVITY_TYPE_TAX: &str = "TAX";

/// Stock split or reverse split. Adjusts quantity and per-share cost without affecting total value.
pub const ACTIVITY_TYPE_SPLIT: &str = "SPLIT";

/// Bring in a position without recording a trade (opening balance or gift). Fee only, increases quantity.
pub const ACTIVITY_TYPE_ADD_HOLDING: &str = "ADD_HOLDING";

/// Write-off, gift, or expire a position without recording a sale. Fee only, decreases quantity.
pub const ACTIVITY_TYPE_REMOVE_HOLDING: &str = "REMOVE_HOLDING";

/// Trading activity types
pub const TRADING_ACTIVITY_TYPES: [&str; 5] = [
    ACTIVITY_TYPE_BUY,
    ACTIVITY_TYPE_SELL,
    ACTIVITY_TYPE_SPLIT,
    ACTIVITY_TYPE_ADD_HOLDING,
    ACTIVITY_TYPE_REMOVE_HOLDING,
];

/// Income activity types
pub const INCOME_ACTIVITY_TYPES: [&str; 2] = [ACTIVITY_TYPE_DIVIDEND, ACTIVITY_TYPE_INTEREST];
