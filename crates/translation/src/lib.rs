//! Best-effort translation via the public MyMemory API (`api.mymemory.translated.net`).
//! Requires outbound HTTPS. Not suitable for highly confidential text — disclose in UI.

use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MyMemoryResponse {
    response_data: Option<MyMemoryData>,
    response_status: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MyMemoryData {
    translated_text: String,
}

/// Translate `text` from `source` ISO-639-1 code to `target` (e.g. `en` → `de`).
/// Long text is split into chunks to respect provider limits.
pub async fn translate_mymemory(
    client: &reqwest::Client,
    text: &str,
    source: &str,
    target: &str,
) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Ok(String::new());
    }
    if source == target {
        return Ok(text.to_string());
    }

    let chunks = chunk_text(text, 420);
    let mut out = Vec::with_capacity(chunks.len());

    for part in chunks {
        let url = reqwest::Url::parse_with_params(
            "https://api.mymemory.translated.net/get",
            &[
                ("q", part.as_str()),
                ("langpair", &format!("{source}|{target}")),
            ],
        )
        .map_err(|e| e.to_string())?;

        let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
        let status = resp.status();
        let body = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(format!("Translation request failed (HTTP {})", status));
        }

        let parsed: MyMemoryResponse = serde_json::from_str(&body).map_err(|e| {
            log::warn!("MyMemory JSON parse error: {e}");
            format!("Invalid translation response: {e}")
        })?;

        if let Some(code) = parsed.response_status {
            if code != 200 {
                return Err(format!("Translation provider returned status {code}"));
            }
        }

        let translated = parsed
            .response_data
            .map(|d| d.translated_text)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "Empty translation".to_string())?;

        if translated.contains("MYMEMORY WARNING") {
            return Err(
                "Translation quota or limit reached. Try again later or shorten the text."
                    .to_string(),
            );
        }

        out.push(normalize_translated_segment(&translated));
    }

    Ok(out.join(" "))
}

/// Collapse whitespace and line wraps inside a segment (API/chunk boundaries should not look like paragraphs).
fn normalize_translated_segment(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn chunk_text(s: &str, max: usize) -> Vec<String> {
    if s.len() <= max {
        return vec![s.to_string()];
    }
    let mut out = Vec::new();
    let mut rest = s;
    while !rest.is_empty() {
        if rest.len() <= max {
            out.push(rest.to_string());
            break;
        }
        let mut split_at = max.min(rest.len());
        let window = &rest[..split_at];
        split_at = window
            .rfind("\n\n")
            .or_else(|| window.rfind("\n"))
            .or_else(|| window.rfind(". "))
            .map(|i| i + 2)
            .or_else(|| window.rfind(' ').map(|i| i + 1))
            .unwrap_or(split_at);
        if split_at == 0 {
            split_at = max.min(rest.len());
        }
        let piece = rest[..split_at].trim();
        if !piece.is_empty() {
            out.push(piece.to_string());
        }
        rest = rest[split_at..].trim_start();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_preserves_short() {
        let s = "hello";
        assert_eq!(chunk_text(s, 420), vec!["hello".to_string()]);
    }

    #[test]
    fn normalize_collapses_line_breaks_inside_segment() {
        assert_eq!(
            normalize_translated_segment("foo\n\nbar"),
            "foo bar"
        );
    }
}
