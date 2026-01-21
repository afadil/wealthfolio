//! Exchange metadata lookups.
//!
//! This module provides static lookup functions for exchange information
//! such as names, currencies, and currency-to-exchange mappings.

/// Get the friendly exchange name for a MIC code.
///
/// Returns a human-readable short name for an exchange given its MIC code.
///
/// # Arguments
/// * `mic` - The ISO 10383 Market Identifier Code
///
/// # Returns
/// The friendly name if known, or None for unknown MICs.
pub fn mic_to_exchange_name(mic: &str) -> Option<&'static str> {
    match mic {
        // North America
        "XNYS" => Some("NYSE"),
        "XNAS" => Some("NASDAQ"),
        "XASE" => Some("NYSE American"),
        "ARCX" => Some("NYSE Arca"),
        "BATS" => Some("BATS"),
        "XTSE" => Some("TSX"),
        "XTSX" => Some("TSX-V"),
        "XCNQ" => Some("CSE"),
        "XMEX" => Some("BMV"),

        // UK & Ireland
        "XLON" => Some("LSE"),
        "XDUB" => Some("Euronext Dublin"),

        // Germany
        "XETR" => Some("XETRA"),
        "XFRA" => Some("Frankfurt"),
        "XSTU" => Some("Stuttgart"),
        "XHAM" => Some("Hamburg"),
        "XDUS" => Some("Dusseldorf"),
        "XMUN" => Some("Munich"),
        "XBER" => Some("Berlin"),
        "XHAN" => Some("Hanover"),

        // Euronext
        "XPAR" => Some("Euronext Paris"),
        "XAMS" => Some("Euronext Amsterdam"),
        "XBRU" => Some("Euronext Brussels"),
        "XLIS" => Some("Euronext Lisbon"),

        // Southern Europe
        "XMIL" => Some("Borsa Italiana"),
        "XMAD" => Some("BME"),
        "XATH" => Some("Athens"),

        // Nordic
        "XSTO" => Some("Nasdaq Stockholm"),
        "XHEL" => Some("Nasdaq Helsinki"),
        "XCSE" => Some("Nasdaq Copenhagen"),
        "XOSL" => Some("Oslo Bors"),
        "XICE" => Some("Nasdaq Iceland"),

        // Central/Eastern Europe
        "XSWX" => Some("SIX"),
        "XWBO" => Some("Vienna"),
        "XWAR" => Some("WSE"),
        "XPRA" => Some("Prague"),
        "XBUD" => Some("Budapest"),
        "XIST" => Some("Borsa Istanbul"),

        // Asia - China & Hong Kong
        "XSHG" => Some("Shanghai"),
        "XSHE" => Some("Shenzhen"),
        "XHKG" => Some("HKEX"),

        // Asia - Japan & Korea
        "XTKS" => Some("TSE"),
        "XKRX" => Some("KRX"),
        "XKOS" => Some("KOSDAQ"),

        // Southeast Asia
        "XSES" => Some("SGX"),
        "XBKK" => Some("SET"),
        "XIDX" => Some("IDX"),
        "XKLS" => Some("Bursa Malaysia"),

        // India
        "XBOM" => Some("BSE"),
        "XNSE" => Some("NSE"),

        // Taiwan
        "XTAI" => Some("TWSE"),

        // Oceania
        "XASX" => Some("ASX"),
        "XNZE" => Some("NZX"),

        // South America
        "BVMF" => Some("B3"),
        "XBUE" => Some("BCBA"),
        "XSGO" => Some("Santiago"),

        // Middle East
        "XTAE" => Some("TASE"),
        "XSAU" => Some("Tadawul"),
        "XDFM" => Some("DFM"),
        "XADS" => Some("ADX"),
        "DSMD" => Some("QSE"),

        // Africa
        "XJSE" => Some("JSE"),
        "XCAI" => Some("EGX"),

        _ => None,
    }
}

/// Get the primary currency for a MIC code.
///
/// Returns the primary trading currency for an exchange.
///
/// # Arguments
/// * `mic` - The ISO 10383 Market Identifier Code
///
/// # Returns
/// The primary currency code if known, or None for unknown MICs.
pub fn mic_to_currency(mic: &str) -> Option<&'static str> {
    match mic {
        // North America
        "XNYS" | "XNAS" | "XASE" | "ARCX" | "BATS" => Some("USD"),
        "XTSE" | "XTSX" | "XCNQ" => Some("CAD"),
        "XMEX" => Some("MXN"),

        // UK & Ireland
        // Note: LSE quotes are in pence (GBp), not pounds (GBP)
        "XLON" => Some("GBp"),
        "XDUB" => Some("EUR"),

        // Germany & Euronext
        "XETR" | "XFRA" | "XSTU" | "XHAM" | "XDUS" | "XMUN" | "XBER" | "XHAN" => Some("EUR"),
        "XPAR" | "XAMS" | "XBRU" | "XLIS" => Some("EUR"),

        // Southern Europe
        "XMIL" | "XMAD" | "XATH" => Some("EUR"),

        // Nordic
        "XSTO" => Some("SEK"),
        "XHEL" => Some("EUR"),
        "XCSE" => Some("DKK"),
        "XOSL" => Some("NOK"),
        "XICE" => Some("ISK"),

        // Central/Eastern Europe
        "XSWX" => Some("CHF"),
        "XWBO" => Some("EUR"),
        "XWAR" => Some("PLN"),
        "XPRA" => Some("CZK"),
        "XBUD" => Some("HUF"),
        "XIST" => Some("TRY"),

        // Asia - China & Hong Kong
        "XSHG" | "XSHE" => Some("CNY"),
        "XHKG" => Some("HKD"),

        // Asia - Japan & Korea
        "XTKS" => Some("JPY"),
        "XKRX" | "XKOS" => Some("KRW"),

        // Southeast Asia
        "XSES" => Some("SGD"),
        "XBKK" => Some("THB"),
        "XIDX" => Some("IDR"),
        "XKLS" => Some("MYR"),

        // India
        "XBOM" | "XNSE" => Some("INR"),

        // Taiwan
        "XTAI" => Some("TWD"),

        // Oceania
        "XASX" => Some("AUD"),
        "XNZE" => Some("NZD"),

        // South America
        "BVMF" => Some("BRL"),
        "XBUE" => Some("ARS"),
        "XSGO" => Some("CLP"),

        // Middle East
        "XTAE" => Some("ILS"),
        "XSAU" => Some("SAR"),
        "XDFM" | "XADS" => Some("AED"),
        "DSMD" => Some("QAR"),

        // Africa
        "XJSE" => Some("ZAR"),
        "XCAI" => Some("EGP"),

        _ => None,
    }
}

/// Get the list of preferred exchanges for a given currency.
///
/// Returns exchanges sorted by priority for the given currency.
/// Used for sorting search results by relevance to account currency.
///
/// # Arguments
/// * `currency` - The currency code (e.g., "USD", "CAD")
///
/// # Returns
/// A list of MIC codes in priority order.
pub fn exchanges_for_currency(currency: &str) -> &'static [&'static str] {
    match currency {
        "USD" => &["XNYS", "XNAS", "ARCX", "BATS", "XASE"],
        "CAD" => &["XTSE", "XTSX", "XCNQ"],
        "GBP" => &["XLON"],
        "EUR" => &["XETR", "XPAR", "XAMS", "XMIL", "XMAD"],
        "CHF" => &["XSWX"],
        "HKD" => &["XHKG"],
        "JPY" => &["XTKS"],
        "AUD" => &["XASX"],
        "NZD" => &["XNZE"],
        "SGD" => &["XSES"],
        "CNY" => &["XSHG", "XSHE"],
        "KRW" => &["XKRX", "XKOS"],
        "INR" => &["XNSE", "XBOM"],
        "BRL" => &["BVMF"],
        "MXN" => &["XMEX"],
        "SEK" => &["XSTO"],
        "DKK" => &["XCSE"],
        "NOK" => &["XOSL"],
        "PLN" => &["XWAR"],
        "ILS" => &["XTAE"],
        "ZAR" => &["XJSE"],
        "TWD" => &["XTAI"],
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mic_to_exchange_name() {
        assert_eq!(mic_to_exchange_name("XNYS"), Some("NYSE"));
        assert_eq!(mic_to_exchange_name("XNAS"), Some("NASDAQ"));
        assert_eq!(mic_to_exchange_name("XTSE"), Some("TSX"));
        assert_eq!(mic_to_exchange_name("XLON"), Some("LSE"));
        assert_eq!(mic_to_exchange_name("XETR"), Some("XETRA"));
        assert_eq!(mic_to_exchange_name("UNKNOWN"), None);
    }

    #[test]
    fn test_mic_to_currency() {
        assert_eq!(mic_to_currency("XNYS"), Some("USD"));
        assert_eq!(mic_to_currency("XNAS"), Some("USD"));
        assert_eq!(mic_to_currency("XTSE"), Some("CAD"));
        assert_eq!(mic_to_currency("XLON"), Some("GBp")); // LSE quotes in pence
        assert_eq!(mic_to_currency("XETR"), Some("EUR"));
        assert_eq!(mic_to_currency("XTKS"), Some("JPY"));
        assert_eq!(mic_to_currency("UNKNOWN"), None);
    }

    #[test]
    fn test_exchanges_for_currency() {
        let us_exchanges = exchanges_for_currency("USD");
        assert!(us_exchanges.contains(&"XNYS"));
        assert!(us_exchanges.contains(&"XNAS"));

        let ca_exchanges = exchanges_for_currency("CAD");
        assert!(ca_exchanges.contains(&"XTSE"));
        assert!(ca_exchanges.contains(&"XTSX"));

        let unknown = exchanges_for_currency("XYZ");
        assert!(unknown.is_empty());
    }
}
