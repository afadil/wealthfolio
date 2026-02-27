//! Property-based tests for bank_connect models.
//!
//! Technique from: https://proptest-rs.github.io/proptest/
//! Inspired by: Hypothesis (Python), QuickCheck (Haskell), fast-check (TS).
//!
//! Rule: any valid input should never panic — the library must be
//! "total" for its declared input domain. Financial software crashes
//! are never acceptable; property tests find the edge cases humans miss.

use proptest::prelude::*;
use wealthfolio_core::bank_connect::models::{BankConnectSettings, BankKey};

// ─── BankKey parse / display round-trip ────────────────────────────────────

proptest! {
    /// BankKey::display_name() must always return a non-empty string.
    #[test]
    fn bank_key_display_name_never_empty(key in any_bank_key()) {
        prop_assert!(!key.display_name().is_empty());
    }

    /// BankKey::login_url() must always return a valid https URL.
    #[test]
    fn bank_key_login_url_is_https(key in any_bank_key()) {
        prop_assert!(key.login_url().starts_with("https://"));
    }

    /// BankKey::post_login_pattern() must be non-empty — used for nav detection.
    #[test]
    fn bank_key_post_login_pattern_non_empty(key in any_bank_key()) {
        prop_assert!(!key.post_login_pattern().is_empty());
    }
}

// ─── BankConnectSettings invariants ─────────────────────────────────────────

proptest! {
    /// Settings with years_back in 1..=10 must serialise/deserialise cleanly.
    #[test]
    fn settings_round_trip(years_back in 1u32..=10, overwrite in any::<bool>()) {
        let settings = BankConnectSettings {
            download_folder: "/tmp/BankStatements".into(),
            years_back,
            enabled_banks: vec!["ING".into(), "CBA".into()],
            overwrite_existing: overwrite,
        };

        let json = serde_json::to_string(&settings).expect("serialise");
        let restored: BankConnectSettings = serde_json::from_str(&json).expect("deserialise");

        prop_assert_eq!(restored.years_back, settings.years_back);
        prop_assert_eq!(restored.overwrite_existing, settings.overwrite_existing);
        prop_assert_eq!(restored.download_folder, settings.download_folder);
    }

    /// Default settings must always be valid.
    #[test]
    fn default_settings_are_valid(_dummy in 0u8..1) {
        let settings = BankConnectSettings::default();
        prop_assert!(settings.years_back >= 1);
        prop_assert!(!settings.download_folder.is_empty());
    }
}

// ─── Arbitrary generators ───────────────────────────────────────────────────

fn any_bank_key() -> impl Strategy<Value = BankKey> {
    prop_oneof![
        Just(BankKey::Ing),
        Just(BankKey::Cba),
        Just(BankKey::Anz),
        Just(BankKey::Bom),
        Just(BankKey::Beyond),
    ]
}
