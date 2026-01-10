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

/// Map Yahoo Finance symbol suffix to canonical MIC.
///
/// This function maps the suffix part of Yahoo symbols (e.g., ".TO" from "SHOP.TO")
/// to ISO 10383 Market Identifier Codes.
///
/// # Arguments
/// * `suffix` - The suffix portion without the dot (e.g., "TO", "L", "DE")
///
/// # Returns
/// The corresponding MIC if known, or None for unknown suffixes.
///
/// # Examples
/// ```ignore
/// assert_eq!(yahoo_suffix_to_mic("TO"), Some("XTSE"));
/// assert_eq!(yahoo_suffix_to_mic("L"), Some("XLON"));
/// assert_eq!(yahoo_suffix_to_mic("DE"), Some("XETR"));
/// assert_eq!(yahoo_suffix_to_mic("UNKNOWN"), None);
/// ```
pub fn yahoo_suffix_to_mic(suffix: &str) -> Option<&'static str> {
    match suffix.to_uppercase().as_str() {
        // North America
        "TO" => Some("XTSE"),        // Toronto Stock Exchange
        "V" | "VN" => Some("XTSX"),  // TSX Venture
        "CN" | "NE" => Some("XCNQ"), // Canadian Securities Exchange
        "MX" => Some("XMEX"),        // Mexican Stock Exchange

        // UK & Ireland
        "L" => Some("XLON"),  // London Stock Exchange
        "IL" => Some("XLON"), // London International
        "IR" => Some("XDUB"), // Dublin

        // Germany
        "DE" => Some("XETR"), // XETRA
        "F" => Some("XFRA"),  // Frankfurt
        "SG" => Some("XSTU"), // Stuttgart
        "HM" => Some("XHAM"), // Hamburg
        "DU" => Some("XDUS"), // Dusseldorf
        "MU" => Some("XMUN"), // Munich
        "BE" => Some("XBER"), // Berlin
        "HA" => Some("XHAN"), // Hanover

        // Euronext
        "PA" => Some("XPAR"), // Paris
        "AS" => Some("XAMS"), // Amsterdam
        "BR" => Some("XBRU"), // Brussels
        "LS" => Some("XLIS"), // Lisbon

        // Southern Europe
        "MI" => Some("XMIL"), // Milan
        "MC" => Some("XMAD"), // Madrid
        "AT" => Some("XATH"), // Athens

        // Nordic
        "ST" => Some("XSTO"), // Stockholm
        "HE" => Some("XHEL"), // Helsinki
        "CO" => Some("XCSE"), // Copenhagen
        "OL" => Some("XOSL"), // Oslo
        "IC" => Some("XICE"), // Iceland

        // Central/Eastern Europe
        "SW" => Some("XSWX"), // Swiss Exchange
        "VI" => Some("XWBO"), // Vienna
        "WA" => Some("XWAR"), // Warsaw
        "PR" => Some("XPRA"), // Prague
        "BD" => Some("XBUD"), // Budapest
        "IS" => Some("XIST"), // Istanbul

        // Asia - China & Hong Kong
        "SS" => Some("XSHG"), // Shanghai
        "SZ" => Some("XSHE"), // Shenzhen
        "HK" => Some("XHKG"), // Hong Kong

        // Asia - Japan & Korea
        "T" => Some("XTKS"),  // Tokyo
        "KS" => Some("XKRX"), // Korea (KOSPI)
        "KQ" => Some("XKOS"), // Korea (KOSDAQ)

        // Southeast Asia
        "SI" => Some("XSES"), // Singapore
        "BK" => Some("XBKK"), // Bangkok
        "JK" => Some("XIDX"), // Jakarta
        "KL" => Some("XKLS"), // Kuala Lumpur

        // India
        "BO" => Some("XBOM"), // Bombay
        "NS" => Some("XNSE"), // National Stock Exchange India

        // Taiwan
        "TW" => Some("XTAI"),     // Taiwan
        "TWO" => Some("XTAI"),    // Taiwan OTC (simplified to main exchange)

        // Oceania
        "AX" => Some("XASX"), // Australia
        "NZ" => Some("XNZE"), // New Zealand

        // South America
        "SA" => Some("BVMF"), // Brazil (B3)
        "BA" => Some("XBUE"), // Buenos Aires
        "SN" => Some("XSGO"), // Santiago

        // Middle East
        "TA" => Some("XTAE"),  // Tel Aviv
        "SAU" => Some("XSAU"), // Saudi Arabia
        "AE" => Some("XDFM"),  // Dubai Financial Market
        "QA" => Some("DSMD"),  // Qatar

        // Africa
        "JO" => Some("XJSE"), // Johannesburg
        "CA" => Some("XCAI"), // Cairo

        _ => None,
    }
}

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
        "XLON" => Some("GBP"),
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

    #[test]
    fn test_yahoo_suffix_to_mic() {
        // North America
        assert_eq!(yahoo_suffix_to_mic("TO"), Some("XTSE"));
        assert_eq!(yahoo_suffix_to_mic("V"), Some("XTSX"));
        assert_eq!(yahoo_suffix_to_mic("to"), Some("XTSE")); // Case insensitive

        // UK & Europe
        assert_eq!(yahoo_suffix_to_mic("L"), Some("XLON"));
        assert_eq!(yahoo_suffix_to_mic("DE"), Some("XETR"));
        assert_eq!(yahoo_suffix_to_mic("PA"), Some("XPAR"));

        // Asia
        assert_eq!(yahoo_suffix_to_mic("T"), Some("XTKS"));
        assert_eq!(yahoo_suffix_to_mic("HK"), Some("XHKG"));

        // Unknown
        assert_eq!(yahoo_suffix_to_mic("UNKNOWN"), None);
        assert_eq!(yahoo_suffix_to_mic("B"), None); // Share class, not suffix
    }

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
        assert_eq!(mic_to_currency("XLON"), Some("GBP"));
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
