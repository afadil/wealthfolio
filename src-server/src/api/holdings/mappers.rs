use wealthfolio_core::portfolio::snapshot::SnapshotSource;

// Re-export date parsing utilities from shared module
pub use crate::api::shared::{parse_date, parse_date_optional};

pub fn snapshot_source_to_string(source: SnapshotSource) -> String {
    serde_json::to_string(&source)
        .unwrap_or_else(|_| "\"CALCULATED\"".to_string())
        .trim_matches('"')
        .to_string()
}
