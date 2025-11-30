//! HTTP headers for Vietnamese market API providers

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE, ORIGIN, REFERER, USER_AGENT};

const DEFAULT_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

/// Create headers for VCI (Vietcap) API requests
pub fn vci_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        REFERER,
        HeaderValue::from_static("https://trading.vietcap.com.vn/"),
    );
    headers.insert(
        ORIGIN,
        HeaderValue::from_static("https://trading.vietcap.com.vn/"),
    );
    headers.insert(USER_AGENT, HeaderValue::from_static(DEFAULT_USER_AGENT));
    headers
}

/// Create headers for FMarket API requests
pub fn fmarket_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(REFERER, HeaderValue::from_static("https://fmarket.vn/"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://fmarket.vn/"));
    headers.insert(USER_AGENT, HeaderValue::from_static(DEFAULT_USER_AGENT));
    headers
}

/// Create headers for SJC Gold API requests
pub fn sjc_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    headers.insert(
        REFERER,
        HeaderValue::from_static("https://sjc.com.vn/bieu-do-gia-vang"),
    );
    headers.insert(ORIGIN, HeaderValue::from_static("https://sjc.com.vn"));
    headers.insert(USER_AGENT, HeaderValue::from_static(DEFAULT_USER_AGENT));
    headers
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vci_headers_has_required_fields() {
        let headers = vci_headers();
        assert!(headers.contains_key(ACCEPT));
        assert!(headers.contains_key(CONTENT_TYPE));
        assert!(headers.contains_key(REFERER));
        assert!(headers.contains_key(ORIGIN));
        assert!(headers.contains_key(USER_AGENT));
    }

    #[test]
    fn test_fmarket_headers_has_required_fields() {
        let headers = fmarket_headers();
        assert!(headers.contains_key(ACCEPT));
        assert!(headers.contains_key(REFERER));
    }

    #[test]
    fn test_sjc_headers_has_form_content_type() {
        let headers = sjc_headers();
        let content_type = headers.get(CONTENT_TYPE).unwrap().to_str().unwrap();
        assert!(content_type.contains("x-www-form-urlencoded"));
    }
}
