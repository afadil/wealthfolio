/// Default account type for new accounts
pub const DEFAULT_ACCOUNT_TYPE: &str = "SECURITIES";

/// Account type constants
pub mod account_types {
    pub const SECURITIES: &str = "SECURITIES";
    pub const CASH: &str = "CASH";
    pub const CRYPTOCURRENCY: &str = "CRYPTOCURRENCY";
}

/// Returns the default group name for a given account type.
///
/// # Arguments
/// * `account_type` - The account type string (e.g., "SECURITIES", "CASH")
///
/// # Returns
/// The default group name for the account type
pub fn default_group_for_account_type(account_type: &str) -> &'static str {
    match account_type {
        account_types::SECURITIES => "Investments",
        account_types::CASH => "Cash",
        account_types::CRYPTOCURRENCY => "Crypto",
        _ => "Investments",
    }
}
