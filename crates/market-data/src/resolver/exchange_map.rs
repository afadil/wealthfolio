//! MIC to provider suffix mappings.
//!
//! This module provides the exchange mapping data used by the rules resolver
//! to convert canonical (ticker, MIC) pairs to provider-specific symbols.

use std::borrow::Cow;
use std::collections::HashMap;

use crate::models::{Mic, ProviderId};

/// Provider-specific exchange suffix and currency.
#[derive(Clone, Debug)]
pub struct ExchangeSuffix {
    /// The suffix to append to the ticker (e.g., ".TO" for Yahoo TSX).
    pub suffix: Cow<'static, str>,
    /// The trading currency for this exchange (e.g., "CAD" for TSX).
    pub currency: Cow<'static, str>,
}

/// MIC to provider suffix mapping database.
///
/// Maps ISO 10383 Market Identifier Codes to provider-specific suffixes
/// for each supported provider.
pub struct ExchangeMap {
    mappings: HashMap<Mic, HashMap<ProviderId, ExchangeSuffix>>,
}

impl Default for ExchangeMap {
    fn default() -> Self {
        Self::new()
    }
}

impl ExchangeMap {
    /// Create a new ExchangeMap with default mappings.
    pub fn new() -> Self {
        let mut map = Self {
            mappings: HashMap::new(),
        };
        map.load_defaults();
        map
    }

    /// Load all default exchange mappings.
    fn load_defaults(&mut self) {
        // ===== North America =====
        // NYSE
        self.add(
            "XNYS",
            &[("YAHOO", "", "USD"), ("ALPHA_VANTAGE", "", "USD")],
        );
        // NASDAQ
        self.add(
            "XNAS",
            &[("YAHOO", "", "USD"), ("ALPHA_VANTAGE", "", "USD")],
        );
        // NYSE American (AMEX)
        self.add(
            "XASE",
            &[("YAHOO", "", "USD"), ("ALPHA_VANTAGE", "", "USD")],
        );
        // Toronto Stock Exchange
        self.add(
            "XTSE",
            &[("YAHOO", ".TO", "CAD"), ("ALPHA_VANTAGE", ".TRT", "CAD")],
        );
        // TSX Venture
        self.add(
            "XTSX",
            &[("YAHOO", ".V", "CAD"), ("ALPHA_VANTAGE", ".TRV", "CAD")],
        );
        // Canadian Securities Exchange
        self.add(
            "XCNQ",
            &[("YAHOO", ".CN", "CAD"), ("ALPHA_VANTAGE", ".CNQ", "CAD")],
        );
        // Mexican Stock Exchange
        self.add(
            "XMEX",
            &[("YAHOO", ".MX", "MXN"), ("ALPHA_VANTAGE", ".MEX", "MXN")],
        );

        // ===== UK & Ireland =====
        // London Stock Exchange
        self.add(
            "XLON",
            &[("YAHOO", ".L", "GBP"), ("ALPHA_VANTAGE", ".LON", "GBP")],
        );
        // London International
        self.add("XLON_IL", &[("YAHOO", ".IL", "GBP")]);
        // Euronext Dublin
        self.add(
            "XDUB",
            &[("YAHOO", ".IR", "EUR"), ("ALPHA_VANTAGE", ".DUB", "EUR")],
        );

        // ===== Germany =====
        // XETRA
        self.add(
            "XETR",
            &[("YAHOO", ".DE", "EUR"), ("ALPHA_VANTAGE", ".DEX", "EUR")],
        );
        // Frankfurt
        self.add(
            "XFRA",
            &[("YAHOO", ".F", "EUR"), ("ALPHA_VANTAGE", ".FRK", "EUR")],
        );
        // Stuttgart
        self.add(
            "XSTU",
            &[("YAHOO", ".SG", "EUR"), ("ALPHA_VANTAGE", ".STU", "EUR")],
        );
        // Hamburg
        self.add("XHAM", &[("YAHOO", ".HM", "EUR")]);
        // Dusseldorf
        self.add("XDUS", &[("YAHOO", ".DU", "EUR")]);
        // Munich
        self.add("XMUN", &[("YAHOO", ".MU", "EUR")]);
        // Berlin
        self.add("XBER", &[("YAHOO", ".BE", "EUR")]);
        // Hanover
        self.add("XHAN", &[("YAHOO", ".HA", "EUR")]);

        // ===== Euronext =====
        // Paris
        self.add(
            "XPAR",
            &[("YAHOO", ".PA", "EUR"), ("ALPHA_VANTAGE", ".PAR", "EUR")],
        );
        // Amsterdam
        self.add(
            "XAMS",
            &[("YAHOO", ".AS", "EUR"), ("ALPHA_VANTAGE", "", "EUR")],
        );
        // Brussels
        self.add(
            "XBRU",
            &[("YAHOO", ".BR", "EUR"), ("ALPHA_VANTAGE", ".BRU", "EUR")],
        );
        // Lisbon
        self.add(
            "XLIS",
            &[("YAHOO", ".LS", "EUR"), ("ALPHA_VANTAGE", ".LIS", "EUR")],
        );

        // ===== Southern Europe =====
        // Milan
        self.add(
            "XMIL",
            &[("YAHOO", ".MI", "EUR"), ("ALPHA_VANTAGE", ".MIL", "EUR")],
        );
        // Madrid
        self.add(
            "XMAD",
            &[("YAHOO", ".MC", "EUR"), ("ALPHA_VANTAGE", ".MCE", "EUR")],
        );
        // Athens
        self.add("XATH", &[("YAHOO", ".AT", "EUR")]);

        // ===== Nordic =====
        // Stockholm
        self.add(
            "XSTO",
            &[("YAHOO", ".ST", "SEK"), ("ALPHA_VANTAGE", ".STO", "SEK")],
        );
        // Helsinki
        self.add(
            "XHEL",
            &[("YAHOO", ".HE", "EUR"), ("ALPHA_VANTAGE", ".HEL", "EUR")],
        );
        // Copenhagen
        self.add(
            "XCSE",
            &[("YAHOO", ".CO", "DKK"), ("ALPHA_VANTAGE", ".CPH", "DKK")],
        );
        // Oslo
        self.add(
            "XOSL",
            &[("YAHOO", ".OL", "NOK"), ("ALPHA_VANTAGE", ".OSL", "NOK")],
        );
        // Iceland
        self.add("XICE", &[("YAHOO", ".IC", "ISK")]);

        // ===== Central/Eastern Europe =====
        // Swiss Exchange
        self.add(
            "XSWX",
            &[("YAHOO", ".SW", "CHF"), ("ALPHA_VANTAGE", ".SWX", "CHF")],
        );
        // Vienna
        self.add(
            "XWBO",
            &[("YAHOO", ".VI", "EUR"), ("ALPHA_VANTAGE", ".VIE", "EUR")],
        );
        // Warsaw
        self.add("XWAR", &[("YAHOO", ".WA", "PLN")]);
        // Prague
        self.add("XPRA", &[("YAHOO", ".PR", "CZK")]);
        // Budapest
        self.add("XBUD", &[("YAHOO", ".BD", "HUF")]);
        // Istanbul
        self.add("XIST", &[("YAHOO", ".IS", "TRY")]);

        // ===== Asia - China =====
        // Shanghai
        self.add(
            "XSHG",
            &[("YAHOO", ".SS", "CNY"), ("ALPHA_VANTAGE", ".SHH", "CNY")],
        );
        // Shenzhen
        self.add(
            "XSHE",
            &[("YAHOO", ".SZ", "CNY"), ("ALPHA_VANTAGE", ".SHZ", "CNY")],
        );
        // Hong Kong
        self.add(
            "XHKG",
            &[("YAHOO", ".HK", "HKD"), ("ALPHA_VANTAGE", ".HKG", "HKD")],
        );

        // ===== Asia - Japan & Korea =====
        // Tokyo
        self.add(
            "XTKS",
            &[("YAHOO", ".T", "JPY"), ("ALPHA_VANTAGE", ".TYO", "JPY")],
        );
        // Korea (KOSPI)
        self.add("XKRX", &[("YAHOO", ".KS", "KRW")]);
        // Korea (KOSDAQ)
        self.add("XKOS", &[("YAHOO", ".KQ", "KRW")]);

        // ===== Asia - Southeast =====
        // Singapore
        self.add("XSES", &[("YAHOO", ".SI", "SGD")]);
        // Bangkok
        self.add("XBKK", &[("YAHOO", ".BK", "THB")]);
        // Jakarta
        self.add("XIDX", &[("YAHOO", ".JK", "IDR")]);
        // Kuala Lumpur
        self.add("XKLS", &[("YAHOO", ".KL", "MYR")]);

        // ===== Asia - South (India) =====
        // Bombay Stock Exchange
        self.add(
            "XBOM",
            &[("YAHOO", ".BO", "INR"), ("ALPHA_VANTAGE", ".BSE", "INR")],
        );
        // National Stock Exchange of India
        self.add(
            "XNSE",
            &[("YAHOO", ".NS", "INR"), ("ALPHA_VANTAGE", ".NSE", "INR")],
        );

        // ===== Asia - Taiwan =====
        // Taiwan Stock Exchange
        self.add("XTAI", &[("YAHOO", ".TW", "TWD")]);
        // Taiwan OTC
        self.add("XTAI_OTC", &[("YAHOO", ".TWO", "TWD")]);

        // ===== Oceania =====
        // Australian Securities Exchange
        self.add(
            "XASX",
            &[("YAHOO", ".AX", "AUD"), ("ALPHA_VANTAGE", ".AX", "AUD")],
        );
        // New Zealand
        self.add("XNZE", &[("YAHOO", ".NZ", "NZD")]);

        // ===== South America =====
        // B3 (Brazil)
        self.add("BVMF", &[("YAHOO", ".SA", "BRL")]);
        // Buenos Aires
        self.add("XBUE", &[("YAHOO", ".BA", "ARS")]);
        // Santiago
        self.add("XSGO", &[("YAHOO", ".SN", "CLP")]);

        // ===== Middle East =====
        // Tel Aviv
        self.add("XTAE", &[("YAHOO", ".TA", "ILS")]);
        // Saudi Arabia
        self.add("XSAU", &[("YAHOO", ".SAU", "SAR")]);
        // Dubai Financial Market
        self.add("XDFM", &[("YAHOO", ".AE", "AED")]);
        // Abu Dhabi Securities Exchange
        self.add("XADS", &[("YAHOO", ".AE", "AED")]);
        // Qatar
        self.add("DSMD", &[("YAHOO", ".QA", "QAR")]);

        // ===== Africa =====
        // Johannesburg
        self.add("XJSE", &[("YAHOO", ".JO", "ZAR")]);
        // Cairo
        self.add("XCAI", &[("YAHOO", ".CA", "EGP")]);
    }

    /// Add exchange mapping for a MIC.
    fn add(&mut self, mic: &'static str, providers: &[(&'static str, &'static str, &'static str)]) {
        let mut provider_map = HashMap::new();
        for (provider, suffix, currency) in providers {
            provider_map.insert(
                Cow::Borrowed(*provider),
                ExchangeSuffix {
                    suffix: Cow::Borrowed(*suffix),
                    currency: Cow::Borrowed(*currency),
                },
            );
        }
        self.mappings.insert(Cow::Borrowed(mic), provider_map);
    }

    /// Get the suffix for a MIC and provider.
    ///
    /// # Arguments
    /// * `mic` - The ISO 10383 Market Identifier Code
    /// * `provider` - The provider ID
    ///
    /// # Returns
    /// The suffix string if found, or None if the MIC/provider combination is not mapped.
    pub fn get_suffix(&self, mic: &Mic, provider: &ProviderId) -> Option<&str> {
        self.mappings
            .get(mic)?
            .get(provider)
            .map(|s| s.suffix.as_ref())
    }

    /// Get the currency for a MIC and provider.
    ///
    /// # Arguments
    /// * `mic` - The ISO 10383 Market Identifier Code
    /// * `provider` - The provider ID
    ///
    /// # Returns
    /// The currency code if found, or None if the MIC/provider combination is not mapped.
    pub fn get_currency(&self, mic: &Mic, provider: &ProviderId) -> Option<&str> {
        self.mappings
            .get(mic)?
            .get(provider)
            .map(|s| s.currency.as_ref())
    }

    /// Check if a MIC is supported.
    pub fn has_mic(&self, mic: &Mic) -> bool {
        self.mappings.contains_key(mic)
    }

    /// Check if a MIC/provider combination is supported.
    pub fn has_mapping(&self, mic: &Mic, provider: &ProviderId) -> bool {
        self.mappings
            .get(mic)
            .map(|p| p.contains_key(provider))
            .unwrap_or(false)
    }
}

/// Map Yahoo exchange code to MIC.
///
/// Yahoo Finance uses its own exchange codes in search results. This function
/// maps those codes to standard ISO 10383 MICs.
///
/// # Arguments
/// * `code` - The Yahoo exchange code (e.g., "NMS", "TOR", "LSE")
///
/// # Returns
/// The corresponding MIC if known, or None for unknown codes.
pub fn yahoo_exchange_to_mic(code: &str) -> Option<Mic> {
    let mic = match code {
        // ===== North America =====
        // NASDAQ variants
        "NMS" | "NGM" | "NCM" => "XNAS",
        // NYSE
        "NYQ" | "NYS" => "XNYS",
        // NYSE American (AMEX)
        "PCX" | "ASE" => "XASE",
        // Toronto
        "TOR" => "XTSE",
        // TSX Venture
        "VAN" | "CVE" => "XTSX",
        // CSE Canada
        "CNQ" => "XCNQ",
        // Mexico
        "MEX" => "XMEX",

        // ===== UK & Ireland =====
        "LSE" => "XLON",
        "IOB" => "XLON", // London IOB
        "ISE" => "XDUB", // Dublin

        // ===== Germany =====
        "GER" | "XETRA" => "XETR",
        "FRA" => "XFRA",
        "STU" => "XSTU",
        "HAM" => "XHAM",
        "DUS" => "XDUS",
        "MUN" => "XMUN",
        "BER" => "XBER",

        // ===== Euronext =====
        "PAR" | "ENX" => "XPAR",
        "AMS" => "XAMS",
        "BRU" => "XBRU",
        "LIS" => "XLIS",

        // ===== Southern Europe =====
        "MIL" => "XMIL",
        "MCE" => "XMAD",
        "ATH" => "XATH",

        // ===== Nordic =====
        "STO" => "XSTO",
        "HEL" => "XHEL",
        "CPH" => "XCSE",
        "OSL" => "XOSL",

        // ===== Switzerland & Central Europe =====
        "EBS" | "SWX" => "XSWX",
        "VIE" => "XWBO",
        "WSE" => "XWAR",
        "PRA" => "XPRA",
        "BUD" => "XBUD",
        "IST" => "XIST",

        // ===== China & Hong Kong =====
        "SHH" => "XSHG",
        "SHZ" => "XSHE",
        "HKG" => "XHKG",

        // ===== Japan & Korea =====
        "TYO" | "JPX" => "XTKS",
        "KSC" | "KRX" => "XKRX",
        "KOE" | "KOSDAQ" => "XKOS",

        // ===== Southeast Asia =====
        "SES" | "SGX" => "XSES",
        "BKK" | "SET" => "XBKK",
        "JKT" | "IDX" => "XIDX",
        "KLS" | "KLSE" => "XKLS",

        // ===== India =====
        "BSE" | "BOM" => "XBOM",
        "NSI" | "NSE" => "XNSE",

        // ===== Taiwan =====
        "TAI" | "TPE" => "XTAI",
        "TWO" => "XTAI_OTC",

        // ===== Oceania =====
        "ASX" | "AX" => "XASX",
        "NZE" => "XNZE",

        // ===== South America =====
        "SAO" | "BVMF" => "BVMF",
        "BUE" => "XBUE",
        "SGO" => "XSGO",

        // ===== Middle East =====
        "TLV" => "XTAE",
        "SAU" => "XSAU",
        "DFM" => "XDFM",
        "ADX" => "XADS",
        "DOH" => "DSMD",

        // ===== Africa =====
        "JNB" | "JSE" => "XJSE",
        "CAI" => "XCAI",

        _ => return None,
    };

    Some(Cow::Borrowed(mic))
}

/// Known Yahoo exchange suffixes.
///
/// This whitelist is used by `strip_yahoo_suffix` to safely extract the canonical
/// ticker from a Yahoo symbol. Only suffixes in this list will be stripped,
/// avoiding false positives like BRK.B or RDS.A.
pub const YAHOO_EXCHANGE_SUFFIXES: &[&str] = &[
    // North America
    ".TO", ".V", ".CN", ".MX", // UK & Europe
    ".L", ".IL", ".IR", ".DE", ".F", ".SG", ".HM", ".DU", ".MU", ".BE", ".HA", ".PA", ".AS", ".BR",
    ".LS", ".MI", ".MC", ".AT", // Nordic
    ".ST", ".HE", ".CO", ".OL", ".IC", // Central/Eastern Europe
    ".SW", ".VI", ".WA", ".PR", ".BD", ".IS", // Asia
    ".SS", ".SZ", ".HK", ".T", ".KS", ".KQ", ".SI", ".BK", ".JK", ".KL", ".BO", ".NS", ".TW",
    ".TWO", // Oceania
    ".AX", ".NZ", // South America
    ".SA", ".BA", ".SN", // Middle East & Africa
    ".TA", ".SAU", ".AE", ".QA", ".JO", ".CA",
];

/// Extract canonical ticker from Yahoo provider symbol.
///
/// Uses a whitelist approach to safely strip exchange suffixes while preserving
/// share classes like BRK.B or RDS.A (since .B and .A are not in the whitelist).
///
/// # Arguments
/// * `symbol` - The Yahoo symbol (e.g., "SHOP.TO", "EURUSD=X", "BRK.B")
///
/// # Returns
/// The canonical ticker with exchange suffix removed if applicable.
///
/// # Examples
/// ```ignore
/// assert_eq!(strip_yahoo_suffix("SHOP.TO"), "SHOP");
/// assert_eq!(strip_yahoo_suffix("BRK.B"), "BRK.B");  // Preserved
/// assert_eq!(strip_yahoo_suffix("EURUSD=X"), "EURUSD");
/// assert_eq!(strip_yahoo_suffix("GC=F"), "GC");
/// ```
pub fn strip_yahoo_suffix(symbol: &str) -> &str {
    // Handle special suffixes first
    if symbol.ends_with("=X") {
        // FX pairs like EURUSD=X
        return &symbol[..symbol.len() - 2];
    }
    if symbol.ends_with("=F") {
        // Futures like GC=F
        return &symbol[..symbol.len() - 2];
    }

    // Only strip if suffix is in our known exchange whitelist
    for suffix in YAHOO_EXCHANGE_SUFFIXES {
        if symbol.ends_with(suffix) {
            return &symbol[..symbol.len() - suffix.len()];
        }
    }

    // No known suffix found - return as-is (preserves BRK.B, RDS.A, etc.)
    symbol
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exchange_map_north_america() {
        let map = ExchangeMap::new();

        // NYSE - no suffix for US exchanges
        assert_eq!(
            map.get_suffix(&Cow::Borrowed("XNYS"), &Cow::Borrowed("YAHOO")),
            Some("")
        );
        assert_eq!(
            map.get_currency(&Cow::Borrowed("XNYS"), &Cow::Borrowed("YAHOO")),
            Some("USD")
        );

        // Toronto
        assert_eq!(
            map.get_suffix(&Cow::Borrowed("XTSE"), &Cow::Borrowed("YAHOO")),
            Some(".TO")
        );
        assert_eq!(
            map.get_suffix(&Cow::Borrowed("XTSE"), &Cow::Borrowed("ALPHA_VANTAGE")),
            Some(".TRT")
        );
        assert_eq!(
            map.get_currency(&Cow::Borrowed("XTSE"), &Cow::Borrowed("YAHOO")),
            Some("CAD")
        );
    }

    #[test]
    fn test_exchange_map_europe() {
        let map = ExchangeMap::new();

        // London
        assert_eq!(
            map.get_suffix(&Cow::Borrowed("XLON"), &Cow::Borrowed("YAHOO")),
            Some(".L")
        );
        assert_eq!(
            map.get_currency(&Cow::Borrowed("XLON"), &Cow::Borrowed("YAHOO")),
            Some("GBP")
        );

        // XETRA
        assert_eq!(
            map.get_suffix(&Cow::Borrowed("XETR"), &Cow::Borrowed("YAHOO")),
            Some(".DE")
        );
    }

    #[test]
    fn test_yahoo_exchange_to_mic() {
        // NASDAQ variants
        assert_eq!(yahoo_exchange_to_mic("NMS"), Some(Cow::Borrowed("XNAS")));
        assert_eq!(yahoo_exchange_to_mic("NGM"), Some(Cow::Borrowed("XNAS")));

        // Toronto
        assert_eq!(yahoo_exchange_to_mic("TOR"), Some(Cow::Borrowed("XTSE")));

        // Unknown
        assert_eq!(yahoo_exchange_to_mic("UNKNOWN"), None);
    }

    #[test]
    fn test_strip_yahoo_suffix() {
        // Normal exchange suffixes
        assert_eq!(strip_yahoo_suffix("SHOP.TO"), "SHOP");
        assert_eq!(strip_yahoo_suffix("AAPL"), "AAPL");
        assert_eq!(strip_yahoo_suffix("VOD.L"), "VOD");

        // Share classes preserved
        assert_eq!(strip_yahoo_suffix("BRK.B"), "BRK.B");
        assert_eq!(strip_yahoo_suffix("RDS.A"), "RDS.A");

        // Special suffixes
        assert_eq!(strip_yahoo_suffix("EURUSD=X"), "EURUSD");
        assert_eq!(strip_yahoo_suffix("GC=F"), "GC");
    }
}
