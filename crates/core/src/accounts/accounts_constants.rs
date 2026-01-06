/// Default account type for new accounts
pub const DEFAULT_ACCOUNT_TYPE: &str = "SECURITIES";

/// Account type constants
pub mod account_types {
    pub const SECURITIES: &str = "SECURITIES";
    pub const CASH: &str = "CASH";
    pub const CRYPTOCURRENCY: &str = "CRYPTOCURRENCY";
    pub const PROPERTY: &str = "PROPERTY";
    pub const VEHICLE: &str = "VEHICLE";
    pub const COLLECTIBLE: &str = "COLLECTIBLE";
    pub const PRECIOUS: &str = "PRECIOUS";
    pub const LIABILITY: &str = "LIABILITY";
    pub const OTHER: &str = "OTHER";
}

/// Returns the default group name for a given account type.
///
/// This function maps account types to their default group names,
/// which are used for organizing accounts in the UI.
///
/// # Arguments
/// * `account_type` - The account type string (e.g., "SECURITIES", "PROPERTY")
///
/// # Returns
/// The default group name for the account type
pub fn default_group_for_account_type(account_type: &str) -> &'static str {
    match account_type {
        account_types::SECURITIES => "Investments",
        account_types::CASH => "Cash",
        account_types::CRYPTOCURRENCY => "Crypto",
        account_types::PROPERTY => "Properties",
        account_types::VEHICLE => "Vehicles",
        account_types::COLLECTIBLE => "Collectibles",
        account_types::PRECIOUS => "Precious Metals",
        account_types::LIABILITY => "Liabilities",
        account_types::OTHER => "Other Assets",
        _ => "Other",
    }
}

/// Returns true if the given account type is valid.
pub fn is_valid_account_type(account_type: &str) -> bool {
    matches!(
        account_type,
        account_types::SECURITIES
            | account_types::CASH
            | account_types::CRYPTOCURRENCY
            | account_types::PROPERTY
            | account_types::VEHICLE
            | account_types::COLLECTIBLE
            | account_types::PRECIOUS
            | account_types::LIABILITY
            | account_types::OTHER
    )
}

/// Returns true if the account type is for alternative assets (non-investment).
pub fn is_alternative_asset_type(account_type: &str) -> bool {
    matches!(
        account_type,
        account_types::PROPERTY
            | account_types::VEHICLE
            | account_types::COLLECTIBLE
            | account_types::PRECIOUS
            | account_types::OTHER
    )
}

/// Returns true if the account type is a liability.
pub fn is_liability_type(account_type: &str) -> bool {
    account_type == account_types::LIABILITY
}
