//! ISO 3166-1 alpha-2 normalisation for provider country strings.
//!
//! `AssetProfile::country` documents an ISO 3166-1 alpha-2 code and the
//! providers disagree about what they actually send: Yahoo returns
//! `"United States"`, Alpha Vantage returns `"USA"`, Finnhub returns `"US"`.
//! Normalising at the provider boundary keeps that contract true and leaves
//! every consumer one shape to read instead of a country-name table each.
//!
//! `NAMES` is generated from the seeded regions taxonomy
//! (`2026-01-01-000002_taxonomies`), so the two agree by construction and a name
//! this resolves is a country the application can also place. Those 227 are not
//! the whole of ISO 3166-1 — the seed carries no `CI`, `MD`, `MK`, `PS` or `CW`
//! — and anything outside the tables resolves to `None` rather than to a code
//! that nothing downstream renders.

/// Resolve a provider country string to its ISO 3166-1 alpha-2 code.
///
/// Accepts a bare code (`"US"`), a taxonomy name (`"United States"`), or a
/// colloquial spelling or endonym (`"USA"`, `"Holland"`, `"日本"`), and is
/// insensitive to case and surrounding whitespace.
///
/// Returns `None` when the string names nothing recognised, so a caller can keep
/// the provider's own value rather than record a code that means nothing.
pub fn to_iso_alpha2(country: &str) -> Option<&'static str> {
    let country = country.trim();
    if country.is_empty() {
        return None;
    }

    // Already a code, which is what Finnhub and the asset-profiles dataset send.
    if country.len() == 2 && country.bytes().all(|b| b.is_ascii_alphabetic()) {
        let code = country.to_ascii_uppercase();
        return CODES.binary_search(&code.as_str()).ok().map(|i| CODES[i]);
    }

    let lower = country.to_lowercase();
    lookup(&NAMES, &lower).or_else(|| lookup(&ALIASES, &lower))
}

/// Both tables are sorted by key in byte order, which `tables_are_sorted` holds.
fn lookup(table: &[(&'static str, &'static str)], key: &str) -> Option<&'static str> {
    table
        .binary_search_by(|(name, _)| (*name).cmp(key))
        .ok()
        .map(|i| table[i].1)
}

/// Country names as the regions taxonomy spells them, lowercased.
const NAMES: [(&str, &str); 227] = [
    ("afghanistan", "AF"),
    ("albania", "AL"),
    ("algeria", "DZ"),
    ("american samoa", "AS"),
    ("andorra", "AD"),
    ("angola", "AO"),
    ("anguilla", "AI"),
    ("antigua and barbuda", "AG"),
    ("argentina", "AR"),
    ("armenia", "AM"),
    ("aruba", "AW"),
    ("australia", "AU"),
    ("austria", "AT"),
    ("azerbaijan", "AZ"),
    ("bahamas", "BS"),
    ("bahrain", "BH"),
    ("bangladesh", "BD"),
    ("barbados", "BB"),
    ("belarus", "BY"),
    ("belgium", "BE"),
    ("belize", "BZ"),
    ("benin", "BJ"),
    ("bermuda", "BM"),
    ("bhutan", "BT"),
    ("bolivia", "BO"),
    ("bosnia and herzegovina", "BA"),
    ("botswana", "BW"),
    ("brazil", "BR"),
    ("british indian ocean territory", "IO"),
    ("brunei darussalam", "BN"),
    ("bulgaria", "BG"),
    ("burkina faso", "BF"),
    ("burundi", "BI"),
    ("cabo verde", "CV"),
    ("cambodia", "KH"),
    ("cameroon", "CM"),
    ("canada", "CA"),
    ("cayman islands", "KY"),
    ("central african republic", "CF"),
    ("chad", "TD"),
    ("chile", "CL"),
    ("china", "CN"),
    ("colombia", "CO"),
    ("comoros", "KM"),
    ("congo", "CG"),
    ("congo, democratic republic of the", "CD"),
    ("cook islands", "CK"),
    ("costa rica", "CR"),
    ("croatia", "HR"),
    ("cuba", "CU"),
    ("cyprus", "CY"),
    ("czechia", "CZ"),
    ("denmark", "DK"),
    ("djibouti", "DJ"),
    ("dominica", "DM"),
    ("dominican republic", "DO"),
    ("ecuador", "EC"),
    ("egypt", "EG"),
    ("el salvador", "SV"),
    ("equatorial guinea", "GQ"),
    ("eritrea", "ER"),
    ("estonia", "EE"),
    ("eswatini", "SZ"),
    ("ethiopia", "ET"),
    ("falkland islands (malvinas)", "FK"),
    ("fiji", "FJ"),
    ("finland", "FI"),
    ("france", "FR"),
    ("french guiana", "GF"),
    ("french polynesia", "PF"),
    ("french southern territories", "TF"),
    ("gabon", "GA"),
    ("gambia", "GM"),
    ("georgia", "GE"),
    ("germany", "DE"),
    ("ghana", "GH"),
    ("gibraltar", "GI"),
    ("greece", "GR"),
    ("greenland", "GL"),
    ("grenada", "GD"),
    ("guadeloupe", "GP"),
    ("guam", "GU"),
    ("guatemala", "GT"),
    ("guinea", "GN"),
    ("guinea-bissau", "GW"),
    ("guyana", "GY"),
    ("haiti", "HT"),
    ("holy see", "VA"),
    ("honduras", "HN"),
    ("hong kong", "HK"),
    ("hungary", "HU"),
    ("iceland", "IS"),
    ("india", "IN"),
    ("indonesia", "ID"),
    ("iran", "IR"),
    ("iraq", "IQ"),
    ("ireland", "IE"),
    ("israel", "IL"),
    ("italy", "IT"),
    ("jamaica", "JM"),
    ("japan", "JP"),
    ("jordan", "JO"),
    ("kazakhstan", "KZ"),
    ("kenya", "KE"),
    ("kiribati", "KI"),
    ("korea (north)", "KP"),
    ("korea (south)", "KR"),
    ("kuwait", "KW"),
    ("kyrgyzstan", "KG"),
    ("lao pdr", "LA"),
    ("latvia", "LV"),
    ("lebanon", "LB"),
    ("lesotho", "LS"),
    ("liberia", "LR"),
    ("libya", "LY"),
    ("liechtenstein", "LI"),
    ("lithuania", "LT"),
    ("luxembourg", "LU"),
    ("macao", "MO"),
    ("madagascar", "MG"),
    ("malawi", "MW"),
    ("malaysia", "MY"),
    ("maldives", "MV"),
    ("mali", "ML"),
    ("malta", "MT"),
    ("marshall islands", "MH"),
    ("martinique", "MQ"),
    ("mauritania", "MR"),
    ("mauritius", "MU"),
    ("mayotte", "YT"),
    ("mexico", "MX"),
    ("micronesia (federated states of)", "FM"),
    ("monaco", "MC"),
    ("mongolia", "MN"),
    ("montenegro", "ME"),
    ("montserrat", "MS"),
    ("morocco", "MA"),
    ("mozambique", "MZ"),
    ("myanmar", "MM"),
    ("namibia", "NA"),
    ("nauru", "NR"),
    ("nepal", "NP"),
    ("netherlands", "NL"),
    ("new caledonia", "NC"),
    ("new zealand", "NZ"),
    ("nicaragua", "NI"),
    ("niger", "NE"),
    ("nigeria", "NG"),
    ("niue", "NU"),
    ("norfolk island", "NF"),
    ("northern mariana islands", "MP"),
    ("norway", "NO"),
    ("oman", "OM"),
    ("pakistan", "PK"),
    ("palau", "PW"),
    ("panama", "PA"),
    ("papua new guinea", "PG"),
    ("paraguay", "PY"),
    ("peru", "PE"),
    ("philippines", "PH"),
    ("pitcairn", "PN"),
    ("poland", "PL"),
    ("portugal", "PT"),
    ("puerto rico", "PR"),
    ("qatar", "QA"),
    ("romania", "RO"),
    ("russian federation", "RU"),
    ("rwanda", "RW"),
    ("réunion", "RE"),
    ("saint barthélemy", "BL"),
    ("saint helena, atc", "SH"),
    ("saint kitts and nevis", "KN"),
    ("saint lucia", "LC"),
    ("saint martin (french part)", "MF"),
    ("saint pierre and miquelon", "PM"),
    ("saint vincent and the grenadines", "VC"),
    ("samoa", "WS"),
    ("san marino", "SM"),
    ("saudi arabia", "SA"),
    ("senegal", "SN"),
    ("serbia", "RS"),
    ("seychelles", "SC"),
    ("sierra leone", "SL"),
    ("singapore", "SG"),
    ("sint maarten (dutch part)", "SX"),
    ("slovakia", "SK"),
    ("somalia", "SO"),
    ("south africa", "ZA"),
    ("south sudan", "SS"),
    ("spain", "ES"),
    ("sri lanka", "LK"),
    ("sudan", "SD"),
    ("suriname", "SR"),
    ("sweden", "SE"),
    ("switzerland", "CH"),
    ("syrian arab republic", "SY"),
    ("são tomé and príncipe", "ST"),
    ("taiwan", "TW"),
    ("tajikistan", "TJ"),
    ("tanzania", "TZ"),
    ("thailand", "TH"),
    ("timor-leste", "TL"),
    ("togo", "TG"),
    ("tokelau", "TK"),
    ("tonga", "TO"),
    ("trinidad and tobago", "TT"),
    ("tunisia", "TN"),
    ("turkey", "TR"),
    ("turkmenistan", "TM"),
    ("turks and caicos islands", "TC"),
    ("tuvalu", "TV"),
    ("uganda", "UG"),
    ("ukraine", "UA"),
    ("united arab emirates", "AE"),
    ("united kingdom", "GB"),
    ("united states", "US"),
    ("uruguay", "UY"),
    ("uzbekistan", "UZ"),
    ("vanuatu", "VU"),
    ("venezuela", "VE"),
    ("viet nam", "VN"),
    ("virgin islands (british)", "VG"),
    ("virgin islands (u.s.)", "VI"),
    ("wallis and futuna", "WF"),
    ("yemen", "YE"),
    ("zambia", "ZM"),
    ("zimbabwe", "ZW"),
];

/// Spellings the taxonomy does not use: colloquial names ("Russia" for "Russian
/// Federation"), constituent countries ("Scotland"), long ISO forms, and the
/// endonyms a localised provider can return. Only disagreements are listed —
/// `aliases_do_not_shadow_names` holds that none of these is already a name.
const ALIASES: [(&str, &str); 61] = [
    ("america", "US"),
    ("bolivia, plurinational state of", "BO"),
    ("brasil", "BR"),
    ("britain", "GB"),
    ("brunei", "BN"),
    ("burma", "MM"),
    ("cape verde", "CV"),
    ("czech republic", "CZ"),
    ("danmark", "DK"),
    ("democratic republic of the congo", "CD"),
    ("deutschland", "DE"),
    ("east timor", "TL"),
    ("england", "GB"),
    ("españa", "ES"),
    ("great britain", "GB"),
    ("holland", "NL"),
    ("iran, islamic republic of", "IR"),
    ("italia", "IT"),
    ("korea", "KR"),
    ("korea, north", "KP"),
    ("korea, south", "KR"),
    ("laos", "LA"),
    ("macau", "MO"),
    ("méxico", "MX"),
    ("norge", "NO"),
    ("north korea", "KP"),
    ("northern ireland", "GB"),
    ("polska", "PL"),
    ("republic of korea", "KR"),
    ("republic of the congo", "CG"),
    ("russia", "RU"),
    ("schweiz", "CH"),
    ("scotland", "GB"),
    ("south korea", "KR"),
    ("suomi", "FI"),
    ("sverige", "SE"),
    ("swaziland", "SZ"),
    ("syria", "SY"),
    ("tanzania, united republic of", "TZ"),
    ("the bahamas", "BS"),
    ("the gambia", "GM"),
    ("türkiye", "TR"),
    ("u.k.", "GB"),
    ("u.s.", "US"),
    ("u.s.a.", "US"),
    ("uae", "AE"),
    ("uk", "GB"),
    ("united states of america", "US"),
    ("usa", "US"),
    ("vatican city", "VA"),
    ("venezuela, bolivarian republic of", "VE"),
    ("vietnam", "VN"),
    ("wales", "GB"),
    ("österreich", "AT"),
    ("भारत", "IN"),
    ("中国", "CN"),
    ("台湾", "TW"),
    ("日本", "JP"),
    ("臺灣", "TW"),
    ("香港", "HK"),
    ("대한민국", "KR"),
];

/// Every code `NAMES` maps to, sorted, so a bare code can be checked without
/// scanning the pairs.
const CODES: [&str; 227] = [
    "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AS", "AT", "AU", "AW", "AZ", "BA", "BB",
    "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BR", "BS", "BT", "BW", "BY",
    "BZ", "CA", "CD", "CF", "CG", "CH", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CY", "CZ",
    "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "ER", "ES", "ET", "FI", "FJ", "FK", "FM",
    "FR", "GA", "GB", "GD", "GE", "GF", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GT", "GU",
    "GW", "GY", "HK", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IN", "IO", "IQ", "IR", "IS", "IT",
    "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB",
    "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "ME", "MF", "MG", "MH", "ML",
    "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC",
    "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH",
    "PK", "PL", "PM", "PN", "PR", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SC",
    "SD", "SE", "SG", "SH", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
    "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
    "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT",
    "ZA", "ZM", "ZW",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_provider_spelling_of_the_united_states_resolves() {
        // The three integrated providers, each sending something different.
        assert_eq!(to_iso_alpha2("United States"), Some("US")); // Yahoo
        assert_eq!(to_iso_alpha2("USA"), Some("US")); // Alpha Vantage
        assert_eq!(to_iso_alpha2("US"), Some("US")); // Finnhub, already a code
    }

    #[test]
    fn case_and_surrounding_whitespace_do_not_matter() {
        assert_eq!(to_iso_alpha2("  germany  "), Some("DE"));
        assert_eq!(to_iso_alpha2("GERMANY"), Some("DE"));
        assert_eq!(to_iso_alpha2("  de  "), Some("DE"));
    }

    #[test]
    fn colloquial_spellings_resolve_where_the_taxonomy_uses_another() {
        // Taxonomy name on the left of each pair, provider spelling on the right.
        assert_eq!(to_iso_alpha2("Russian Federation"), Some("RU"));
        assert_eq!(to_iso_alpha2("Russia"), Some("RU"));
        assert_eq!(to_iso_alpha2("Czechia"), Some("CZ"));
        assert_eq!(to_iso_alpha2("Czech Republic"), Some("CZ"));
        assert_eq!(to_iso_alpha2("Viet Nam"), Some("VN"));
        assert_eq!(to_iso_alpha2("Vietnam"), Some("VN"));
        assert_eq!(to_iso_alpha2("Korea (South)"), Some("KR"));
        assert_eq!(to_iso_alpha2("South Korea"), Some("KR"));
        assert_eq!(to_iso_alpha2("Netherlands"), Some("NL"));
        assert_eq!(to_iso_alpha2("Holland"), Some("NL"));
    }

    #[test]
    fn endonyms_and_constituent_countries_resolve() {
        assert_eq!(to_iso_alpha2("日本"), Some("JP"));
        assert_eq!(to_iso_alpha2("Deutschland"), Some("DE"));
        assert_eq!(to_iso_alpha2("Scotland"), Some("GB"));
        assert_eq!(to_iso_alpha2("England"), Some("GB"));
    }

    #[test]
    fn an_unrecognised_string_resolves_to_nothing_rather_than_a_code() {
        assert_eq!(to_iso_alpha2("Atlantis"), None);
        assert_eq!(to_iso_alpha2(""), None);
        assert_eq!(to_iso_alpha2("   "), None);
        // Two letters that are not a country must not pass through as one.
        assert_eq!(to_iso_alpha2("ZZ"), None);
        // Countries the regions seed omits, so the caller keeps the raw name.
        assert_eq!(to_iso_alpha2("Moldova"), None);
    }

    #[test]
    fn tables_are_sorted() {
        // `lookup` and the `CODES` check both binary search.
        assert!(
            NAMES.windows(2).all(|w| w[0].0 < w[1].0),
            "NAMES must be sorted by key in byte order"
        );
        assert!(
            ALIASES.windows(2).all(|w| w[0].0 < w[1].0),
            "ALIASES must be sorted by key in byte order"
        );
        assert!(
            CODES.windows(2).all(|w| w[0] < w[1]),
            "CODES must be sorted in byte order"
        );
    }

    #[test]
    fn aliases_do_not_shadow_names() {
        for (alias, _) in ALIASES {
            assert!(
                lookup(&NAMES, alias).is_none(),
                "{alias} is already a taxonomy name, so the alias is dead"
            );
        }
    }

    #[test]
    fn every_name_maps_to_a_known_code() {
        for (name, code) in NAMES {
            assert!(CODES.binary_search(&code).is_ok(), "{name} -> {code}");
        }
        for (alias, code) in ALIASES {
            assert!(CODES.binary_search(&code).is_ok(), "{alias} -> {code}");
        }
    }

    #[test]
    fn keys_are_already_lowercase() {
        // `to_iso_alpha2` lowercases its input before looking up, so a key with
        // an uppercase character could never be reached.
        for (name, _) in NAMES.iter().chain(ALIASES.iter()) {
            assert_eq!(*name, name.to_lowercase(), "{name} is not lowercased");
        }
    }
}
