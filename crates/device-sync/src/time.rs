use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};

fn normalize_offset_suffix(value: &str) -> Option<String> {
    let tz_idx = value.rfind(['+', '-']).filter(|idx| *idx > 9)?;
    let prefix = &value[..tz_idx];
    let suffix = &value[tz_idx..];

    if suffix.len() == 3 {
        let all_digits = suffix[1..].chars().all(|c| c.is_ascii_digit());
        if all_digits {
            return Some(format!("{prefix}{suffix}:00"));
        }
    }

    if suffix.len() == 5 {
        let all_digits = suffix[1..].chars().all(|c| c.is_ascii_digit());
        if all_digits {
            return Some(format!("{}{}:{}", prefix, &suffix[..3], &suffix[3..]));
        }
    }

    None
}

pub fn parse_sync_datetime_to_utc(value: &str) -> Result<DateTime<Utc>, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Datetime value is empty".to_string());
    }

    let mut candidates = vec![trimmed.to_string()];
    if trimmed.contains(' ') {
        candidates.push(trimmed.replacen(' ', "T", 1));
    }

    for candidate in candidates {
        if let Ok(parsed) = DateTime::parse_from_rfc3339(&candidate) {
            return Ok(parsed.with_timezone(&Utc));
        }

        if let Some(normalized) = normalize_offset_suffix(&candidate) {
            if let Ok(parsed) = DateTime::parse_from_rfc3339(&normalized) {
                return Ok(parsed.with_timezone(&Utc));
            }
        }
    }

    for fmt in ["%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S%.f"] {
        if let Ok(parsed) = NaiveDateTime::parse_from_str(trimmed, fmt) {
            return Ok(parsed.and_utc());
        }
    }

    Err(format!("Unsupported datetime format: {}", value))
}

pub fn normalize_sync_datetime(value: &str) -> Result<String, String> {
    parse_sync_datetime_to_utc(value)
        .map(|parsed| parsed.to_rfc3339_opts(SecondsFormat::Millis, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rfc3339() {
        let parsed = parse_sync_datetime_to_utc("2026-03-03T03:02:46.288Z").unwrap();
        assert_eq!(
            parsed.to_rfc3339_opts(SecondsFormat::Millis, true),
            "2026-03-03T03:02:46.288Z"
        );
    }

    #[test]
    fn parses_postgres_style_offset_hours() {
        let parsed = parse_sync_datetime_to_utc("2026-03-03 03:02:46.288162+00").unwrap();
        assert_eq!(
            parsed.to_rfc3339_opts(SecondsFormat::Millis, true),
            "2026-03-03T03:02:46.288Z"
        );
    }

    #[test]
    fn parses_postgres_style_offset_hhmm() {
        let parsed = parse_sync_datetime_to_utc("2026-03-03 03:02:46.288162+0000").unwrap();
        assert_eq!(
            parsed.to_rfc3339_opts(SecondsFormat::Millis, true),
            "2026-03-03T03:02:46.288Z"
        );
    }
}
