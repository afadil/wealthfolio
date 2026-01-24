//! Plan-based CSV import tool.
//!
//! Target architecture: LLM proposes an Import Plan (schema-enforced),
//! deterministic code applies it. Model never transforms full rows or saves data.
//!
//! Flow:
//! 1. Frontend parses CSV locally, computes stats + samples
//! 2. LLM receives stats/samples and proposes Import Plan
//! 3. This tool applies the plan deterministically to full data
//! 4. Tool UI renders preview; user edits and saves

use csv::ReaderBuilder;
use log::debug;
use rig::{completion::ToolDefinition, tool::Tool};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::sync::Arc;

use super::constants::MAX_IMPORT_ROWS;
use super::record_activity::AccountOption;
use crate::env::AiEnvironment;
use crate::error::AiError;

// ============================================================================
// Import Plan Types (LLM Output - Schema Enforced)
// ============================================================================

/// Column index mappings from CSV columns to activity fields.
/// All fields are required in the schema but can be null if not mapped.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnMappings {
    pub date: Option<usize>,
    pub activity_type: Option<usize>,
    pub symbol: Option<usize>,
    pub quantity: Option<usize>,
    pub unit_price: Option<usize>,
    pub amount: Option<usize>,
    pub fee: Option<usize>,
    pub currency: Option<usize>,
    pub account: Option<usize>,
    pub comment: Option<usize>,
}

/// Transform operation to apply to a field.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransformOp {
    Trim,
    Uppercase,
    ParseDate,
    ParseNumber,
    ParseNumberAbs,
    StripCurrency,
    Coalesce,
}

/// A single transform to apply to a field.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transform {
    /// Target field to transform.
    pub field: String,
    /// Operation to apply.
    pub op: TransformOp,
    /// Format hints for parsing (e.g., date formats).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub format_hints: Vec<String>,
    /// Column indices for coalesce operation.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub inputs: Vec<usize>,
}

/// Sign rule for numeric fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignRule {
    NegativeIsSell,
    NegativeIsWithdrawal,
    AlwaysAbs,
}

/// Sign rule configuration for a field.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignRuleConfig {
    pub field: String,
    pub rule: SignRule,
}

/// Confidence scores for the import plan.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Confidence {
    /// Overall confidence (0.0 - 1.0).
    pub overall: f64,
    /// Per-field confidence scores.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub by_field: HashMap<String, f64>,
}

/// The Import Plan proposed by the LLM.
/// Schema-enforced; non-conforming output is rejected.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlan {
    /// Column index mappings to activity fields.
    pub column_mappings: ColumnMappings,

    /// Transforms to apply (in order).
    #[serde(default)]
    pub transforms: Vec<Transform>,

    /// Enum mappings (e.g., activity type normalization).
    #[serde(default)]
    pub enum_maps: EnumMaps,

    /// Sign rules for numeric fields.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sign_rules: Vec<SignRuleConfig>,

    /// Confidence scores.
    #[serde(default)]
    pub confidence: Confidence,

    /// Notes from the model about the mapping.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<String>,

    /// If true, model abstains from mapping (low confidence).
    #[serde(default)]
    pub abstain: bool,
}

/// Enum mappings for normalizing values.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnumMaps {
    /// Activity type mappings (CSV value -> canonical type).
    #[serde(default)]
    pub activity_type: HashMap<String, String>,
}

// ============================================================================
// Tool Arguments (LLM Input)
// ============================================================================

/// Arguments for the import_csv tool.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCsvArgs {
    /// Raw CSV content to parse.
    pub csv_content: String,

    /// Optional account ID to assign to all activities.
    pub account_id: Option<String>,

    /// Import plan proposed by LLM (optional - auto-detect if not provided).
    pub import_plan: Option<ImportPlan>,

    /// Legacy: Column mappings (deprecated, use import_plan).
    pub column_mappings: Option<ColumnMappings>,
}

// ============================================================================
// Output Types
// ============================================================================

/// Output envelope for import_csv tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCsvOutput {
    /// Parsed activity drafts.
    pub activities: Vec<CsvActivityDraft>,

    /// The import plan that was applied (or auto-detected).
    pub applied_plan: ImportPlan,

    /// Data cleaning actions performed.
    pub cleaning_actions: Vec<CleaningAction>,

    /// Validation summary.
    pub validation: ValidationSummary,

    /// Available accounts for selection.
    pub available_accounts: Vec<AccountOption>,

    /// Detected headers from the CSV.
    pub detected_headers: Vec<String>,

    /// Total rows in source CSV (before truncation).
    pub total_rows: usize,

    /// Whether the output was truncated.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
}

/// Activity draft from CSV parsing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvActivityDraft {
    /// Row number in original CSV (1-indexed, after header).
    pub row_number: usize,

    /// Activity type (BUY, SELL, DIVIDEND, etc.).
    pub activity_type: Option<String>,

    /// ISO 8601 date (normalized).
    pub activity_date: Option<String>,

    /// Symbol/ticker.
    pub symbol: Option<String>,

    /// Resolved exchange MIC for the symbol (e.g., "XNAS", "XNYS").
    pub exchange_mic: Option<String>,

    /// Quantity of shares/units.
    pub quantity: Option<f64>,

    /// Price per unit.
    pub unit_price: Option<f64>,

    /// Total amount.
    pub amount: Option<f64>,

    /// Transaction fee.
    pub fee: Option<f64>,

    /// Currency code.
    pub currency: Option<String>,

    /// Notes/comments.
    pub notes: Option<String>,

    /// Account ID (from args or mapping).
    pub account_id: Option<String>,

    /// Whether this row is valid.
    pub is_valid: bool,

    /// Validation errors for this row.
    pub errors: Vec<String>,

    /// Validation warnings for this row.
    pub warnings: Vec<String>,

    /// Raw values from CSV (for debugging/display).
    pub raw_values: Vec<String>,
}

/// A cleaning action performed on the data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleaningAction {
    /// Type of cleaning action.
    pub action_type: String,

    /// Description of what was cleaned.
    pub description: String,

    /// Number of rows affected.
    pub affected_rows: usize,
}

/// Summary of validation results.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationSummary {
    /// Total number of rows parsed.
    pub total_rows: usize,

    /// Number of valid rows.
    pub valid_rows: usize,

    /// Number of rows with errors.
    pub error_rows: usize,

    /// Number of rows with warnings.
    pub warning_rows: usize,

    /// Global errors (not row-specific).
    pub global_errors: Vec<String>,
}

// ============================================================================
// Header Detection Patterns
// ============================================================================

/// Common header patterns for each field (case-insensitive).
const DATE_PATTERNS: &[&str] = &[
    "date",
    "trade date",
    "activity date",
    "transaction date",
    "settlement date",
    "trade_date",
    "activity_date",
    "transaction_date",
];

const SYMBOL_PATTERNS: &[&str] = &[
    "symbol",
    "ticker",
    "stock",
    "security",
    "asset",
    "instrument",
    "code",
];

const QUANTITY_PATTERNS: &[&str] = &[
    "quantity",
    "qty",
    "shares",
    "units",
    "amount of shares",
    "no. of shares",
    "number of shares",
];

const UNIT_PRICE_PATTERNS: &[&str] = &[
    "price",
    "unit price",
    "share price",
    "cost per share",
    "unit_price",
    "price per share",
    "avg price",
    "average price",
];

const AMOUNT_PATTERNS: &[&str] = &[
    "amount",
    "total",
    "value",
    "cost",
    "proceeds",
    "net amount",
    "gross amount",
    "total amount",
    "total value",
    "market value",
];

const FEE_PATTERNS: &[&str] = &[
    "fee",
    "commission",
    "fees",
    "transaction fee",
    "trading fee",
    "brokerage",
];

const ACTIVITY_TYPE_PATTERNS: &[&str] = &[
    "type",
    "action",
    "activity",
    "transaction type",
    "activity type",
    "trans type",
    "transaction",
    "side",
    "buy/sell",
];

const CURRENCY_PATTERNS: &[&str] = &["currency", "ccy", "curr", "currency code"];

const NOTES_PATTERNS: &[&str] = &["notes", "comment", "comments", "description", "memo", "remarks"];

// ============================================================================
// Activity Type Mappings (Default)
// ============================================================================

/// Map raw activity type strings to canonical types.
fn normalize_activity_type(raw: &str, custom_mappings: &HashMap<String, String>) -> Option<String> {
    let trimmed = raw.trim();

    // Check custom mappings first (case-insensitive)
    let upper = trimmed.to_uppercase();
    if let Some(mapped) = custom_mappings.get(&upper) {
        return Some(mapped.clone());
    }
    if let Some(mapped) = custom_mappings.get(trimmed) {
        return Some(mapped.clone());
    }

    let lower = trimmed.to_lowercase();

    // BUY variants
    if matches!(
        lower.as_str(),
        "buy" | "purchase" | "bought" | "b" | "long" | "buy to open" | "buy to cover"
    ) {
        return Some("BUY".to_string());
    }

    // SELL variants
    if matches!(
        lower.as_str(),
        "sell" | "sold" | "s" | "short" | "sell to close" | "sell to open"
    ) {
        return Some("SELL".to_string());
    }

    // DIVIDEND variants
    if lower.contains("dividend") || lower.contains("div") || lower == "dist" {
        return Some("DIVIDEND".to_string());
    }

    // INTEREST variants
    if lower.contains("interest") || lower == "int" {
        return Some("INTEREST".to_string());
    }

    // DEPOSIT variants
    if matches!(lower.as_str(), "deposit" | "contribution" | "add cash") {
        return Some("DEPOSIT".to_string());
    }

    // WITHDRAWAL variants
    if matches!(lower.as_str(), "withdrawal" | "withdraw" | "remove cash") {
        return Some("WITHDRAWAL".to_string());
    }

    // TRANSFER variants
    if lower.contains("transfer in") || lower == "transfer_in" {
        return Some("TRANSFER_IN".to_string());
    }
    if lower.contains("transfer out") || lower == "transfer_out" {
        return Some("TRANSFER_OUT".to_string());
    }
    if lower.contains("transfer") {
        return Some("TRANSFER_IN".to_string()); // Default to IN
    }

    // FEE variants
    if matches!(
        lower.as_str(),
        "fee" | "fees" | "commission" | "charge" | "expense"
    ) {
        return Some("FEE".to_string());
    }

    // TAX variants
    if lower.contains("tax") || lower.contains("withholding") {
        return Some("TAX".to_string());
    }

    // SPLIT variants
    if lower.contains("split") || lower.contains("stock dividend") {
        return Some("SPLIT".to_string());
    }

    // CREDIT variants
    if matches!(
        lower.as_str(),
        "credit" | "refund" | "rebate" | "bonus" | "adjustment credit"
    ) {
        return Some("CREDIT".to_string());
    }

    None
}

// ============================================================================
// Date Parsing
// ============================================================================

/// Try to parse and normalize a date string to ISO 8601 format (YYYY-MM-DD).
fn normalize_date(raw: &str, format_hints: &[String]) -> Option<String> {
    let cleaned = raw.trim();
    if cleaned.is_empty() {
        return None;
    }

    // Strip timezone suffix for datetime parsing
    let without_tz = cleaned
        .trim_end_matches('Z')
        .trim_end_matches("+00:00")
        .trim_end_matches("-00:00");

    // Build format list: hints first, then defaults
    let mut formats: Vec<&str> = format_hints.iter().map(|s| s.as_str()).collect();

    // Date-only formats (most common first)
    const DATE_FORMATS: &[&str] = &[
        "%Y-%m-%d",    // ISO 8601: 2024-01-15
        "%m/%d/%Y",    // US: 01/15/2024
        "%d/%m/%Y",    // EU: 15/01/2024
        "%Y/%m/%d",    // Alt ISO: 2024/01/15
        "%m-%d-%Y",    // US with dash: 01-15-2024
        "%d-%m-%Y",    // EU with dash: 15-01-2024
        "%d-%b-%Y",    // 15-Jan-2024
        "%b %d, %Y",   // Jan 15, 2024
        "%Y%m%d",      // Compact: 20240115
    ];

    // Datetime formats
    const DATETIME_FORMATS: &[&str] = &[
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
    ];

    formats.extend(DATE_FORMATS);

    // Try date-only formats
    for fmt in &formats {
        if let Ok(date) = chrono::NaiveDate::parse_from_str(cleaned, fmt) {
            return Some(date.format("%Y-%m-%d").to_string());
        }
    }

    // Try datetime formats
    for fmt in DATETIME_FORMATS {
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(without_tz, fmt) {
            return Some(dt.date().format("%Y-%m-%d").to_string());
        }
    }

    // Fallback: YYYYMMDD if exactly 8 digits
    if cleaned.len() == 8 && cleaned.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(date) = chrono::NaiveDate::parse_from_str(cleaned, "%Y%m%d") {
            return Some(date.format("%Y-%m-%d").to_string());
        }
    }

    None
}

// ============================================================================
// Number Parsing
// ============================================================================

/// Parse a number string, handling currency symbols and formatting.
fn parse_number(raw: &str, strip_currency: bool) -> Option<f64> {
    let cleaned = raw.trim();
    if cleaned.is_empty() {
        return None;
    }

    // Handle parentheses as negative (accounting format)
    let is_negative = cleaned.starts_with('(') && cleaned.ends_with(')');
    let cleaned = if is_negative {
        &cleaned[1..cleaned.len() - 1]
    } else {
        cleaned
    };

    // Remove currency symbols if requested
    let cleaned: String = if strip_currency {
        cleaned
            .chars()
            .filter(|c| !matches!(c, '$' | '€' | '£' | '¥' | '₹' | ' '))
            .collect()
    } else {
        cleaned.to_string()
    };

    // Handle comma as decimal separator vs thousands separator
    let cleaned = if cleaned.matches(',').count() == 1 {
        let comma_pos = cleaned.find(',').unwrap();
        let after_comma = cleaned.len() - comma_pos - 1;
        if after_comma <= 2 {
            // European decimal format
            cleaned.replace(',', ".")
        } else {
            // Thousands separator
            cleaned.replace(',', "")
        }
    } else {
        cleaned.replace(',', "")
    };

    match cleaned.parse::<f64>() {
        Ok(num) => Some(if is_negative { -num } else { num }),
        Err(_) => None,
    }
}

// ============================================================================
// CSV Parsing (using csv crate for robustness)
// ============================================================================

/// Parse CSV content using the csv crate for robust handling of:
/// - Quoted fields with commas and newlines
/// - Different delimiters (auto-detected)
/// - Escaped quotes
/// - UTF-8 encoding
fn parse_csv_content(content: &str) -> Result<(Vec<Vec<String>>, Option<char>), String> {
    let content = content.trim();
    if content.is_empty() {
        return Ok((Vec::new(), None));
    }

    // Try to detect delimiter from first line
    let first_line = content.lines().next().unwrap_or("");
    let delimiter = detect_delimiter(first_line);

    let cursor = Cursor::new(content.as_bytes());
    let mut reader = ReaderBuilder::new()
        .delimiter(delimiter as u8)
        .has_headers(false) // We'll detect headers ourselves
        .flexible(true) // Allow variable number of fields per row
        .trim(csv::Trim::All)
        .from_reader(cursor);

    let mut rows = Vec::new();
    for result in reader.records() {
        match result {
            Ok(record) => {
                let fields: Vec<String> = record.iter().map(|s| s.to_string()).collect();
                rows.push(fields);
            }
            Err(e) => {
                // Log parse error but continue - some rows may be malformed
                debug!("CSV parse warning: {}", e);
            }
        }
    }

    Ok((rows, Some(delimiter)))
}

/// Detect the most likely delimiter from the first line.
fn detect_delimiter(first_line: &str) -> char {
    // Count occurrences of common delimiters
    let comma_count = first_line.matches(',').count();
    let semicolon_count = first_line.matches(';').count();
    let tab_count = first_line.matches('\t').count();
    let pipe_count = first_line.matches('|').count();

    // Return the most frequent delimiter, defaulting to comma
    let counts = [
        (',', comma_count),
        (';', semicolon_count),
        ('\t', tab_count),
        ('|', pipe_count),
    ];

    counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(delim, count)| if count > 0 { delim } else { ',' })
        .unwrap_or(',')
}

/// Parse a single CSV row (for backwards compatibility)
fn parse_csv_row(line: &str) -> Vec<String> {
    let cursor = Cursor::new(line.as_bytes());
    let mut reader = ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(cursor);

    if let Some(Ok(record)) = reader.records().next() {
        record.iter().map(|s| s.to_string()).collect()
    } else {
        // Fallback: simple split
        line.split(',').map(|s| s.trim().to_string()).collect()
    }
}

/// Check if a row looks like a metadata/header row (skip candidate).
fn is_metadata_row(fields: &[String]) -> bool {
    let populated_count = fields.iter().filter(|f| !f.trim().is_empty()).count();
    if populated_count < 3 {
        return true;
    }

    let has_numeric = fields.iter().any(|f| {
        let cleaned = f.replace(['$', '€', '£', ',', ' '], "");
        cleaned.parse::<f64>().is_ok()
    });

    !has_numeric
}

/// Detect header row by matching common column name patterns.
fn detect_header_mappings(headers: &[String]) -> ColumnMappings {
    let mut mappings = ColumnMappings::default();

    for (idx, header) in headers.iter().enumerate() {
        let lower = header.to_lowercase();
        let lower = lower.trim();

        if mappings.date.is_none()
            && DATE_PATTERNS.iter().any(|p| lower == *p || lower.contains(p))
        {
            mappings.date = Some(idx);
            continue;
        }

        if mappings.symbol.is_none()
            && SYMBOL_PATTERNS.iter().any(|p| lower == *p || lower.contains(p))
        {
            mappings.symbol = Some(idx);
            continue;
        }

        if mappings.activity_type.is_none()
            && ACTIVITY_TYPE_PATTERNS.iter().any(|p| lower == *p || lower.contains(p))
        {
            mappings.activity_type = Some(idx);
            continue;
        }

        if mappings.quantity.is_none()
            && QUANTITY_PATTERNS.iter().any(|p| lower == *p || lower.contains(p))
        {
            mappings.quantity = Some(idx);
            continue;
        }

        if mappings.unit_price.is_none()
            && UNIT_PRICE_PATTERNS.iter().any(|p| lower == *p || lower.contains(p))
        {
            mappings.unit_price = Some(idx);
            continue;
        }

        if mappings.fee.is_none()
            && FEE_PATTERNS.iter().any(|p| lower == *p || lower.contains(p))
        {
            mappings.fee = Some(idx);
            continue;
        }

        if mappings.amount.is_none()
            && AMOUNT_PATTERNS.iter().any(|p| lower == *p || lower.contains(p))
        {
            mappings.amount = Some(idx);
            continue;
        }

        if mappings.currency.is_none()
            && CURRENCY_PATTERNS.iter().any(|p| lower == *p || lower.contains(p))
        {
            mappings.currency = Some(idx);
            continue;
        }

        if mappings.comment.is_none()
            && NOTES_PATTERNS.iter().any(|p| lower == *p || lower.contains(p))
        {
            mappings.comment = Some(idx);
        }
    }

    mappings
}

// ============================================================================
// Tool Implementation
// ============================================================================

/// Tool to import activities from CSV content using a plan-based architecture.
pub struct ImportCsvTool<E: AiEnvironment> {
    env: Arc<E>,
    base_currency: String,
}

impl<E: AiEnvironment> ImportCsvTool<E> {
    pub fn new(env: Arc<E>, base_currency: String) -> Self {
        Self { env, base_currency }
    }

    /// Apply an import plan to CSV content deterministically.
    fn apply_plan(
        &self,
        content: &str,
        plan: &ImportPlan,
        account_id: Option<&str>,
    ) -> (
        Vec<CsvActivityDraft>,
        Vec<CleaningAction>,
        Vec<String>,
        usize,
    ) {
        let mut activities = Vec::new();
        let mut cleaning_actions = Vec::new();
        let mut detected_headers = Vec::new();

        // Parse CSV using the csv crate for robustness
        let (rows, detected_delimiter) = match parse_csv_content(content) {
            Ok(result) => result,
            Err(e) => {
                debug!("Failed to parse CSV: {}", e);
                return (activities, cleaning_actions, detected_headers, 0);
            }
        };

        if rows.is_empty() {
            return (activities, cleaning_actions, detected_headers, 0);
        }

        // Log detected delimiter
        if let Some(delim) = detected_delimiter {
            if delim != ',' {
                let delim_name = match delim {
                    '\t' => "tab".to_string(),
                    _ => delim.to_string(),
                };
                cleaning_actions.push(CleaningAction {
                    action_type: "detect_delimiter".to_string(),
                    description: format!("Detected delimiter: '{}'", delim_name),
                    affected_rows: 0,
                });
            }
        }

        // Find header row
        let mut header_row_idx = 0;
        let mut skipped_metadata_rows = 0;

        for (idx, fields) in rows.iter().enumerate() {
            let candidate_mappings = detect_header_mappings(fields);

            let recognized_count = [
                candidate_mappings.date,
                candidate_mappings.symbol,
                candidate_mappings.quantity,
                candidate_mappings.unit_price,
                candidate_mappings.amount,
                candidate_mappings.activity_type,
            ]
            .iter()
            .filter(|m| m.is_some())
            .count();

            if recognized_count >= 2 {
                header_row_idx = idx;
                detected_headers = fields.clone();
                break;
            }

            if is_metadata_row(fields) {
                skipped_metadata_rows += 1;
            } else {
                header_row_idx = 0;
                detected_headers = rows.first().cloned().unwrap_or_default();
                break;
            }
        }

        if skipped_metadata_rows > 0 {
            cleaning_actions.push(CleaningAction {
                action_type: "skip_metadata".to_string(),
                description: format!("Skipped {} metadata rows before header", skipped_metadata_rows),
                affected_rows: skipped_metadata_rows,
            });
        }

        // Get date format hints from transforms
        let date_format_hints: Vec<String> = plan
            .transforms
            .iter()
            .filter(|t| t.field == "date" && matches!(t.op, TransformOp::ParseDate))
            .flat_map(|t| t.format_hints.clone())
            .collect();

        // Track cleaning stats
        let mut dates_normalized = 0;
        let mut numbers_cleaned = 0;
        let mut activity_types_mapped = 0;

        // Parse data rows
        let data_start = header_row_idx + 1;
        let total_data_rows = rows.len().saturating_sub(data_start);
        let mappings = &plan.column_mappings;

        for (row_idx, fields) in rows.iter().enumerate().skip(data_start) {
            let row_number = row_idx - header_row_idx;

            if is_metadata_row(&fields) {
                continue;
            }

            let mut draft = CsvActivityDraft {
                row_number,
                activity_type: None,
                activity_date: None,
                symbol: None,
                exchange_mic: None,
                quantity: None,
                unit_price: None,
                amount: None,
                fee: None,
                currency: None,
                notes: None,
                account_id: account_id.map(|s| s.to_string()),
                is_valid: true,
                errors: Vec::new(),
                warnings: Vec::new(),
                raw_values: fields.clone(),
            };

            // Apply column mappings
            if let Some(idx) = mappings.date {
                if let Some(raw) = fields.get(idx) {
                    if let Some(normalized) = normalize_date(raw, &date_format_hints) {
                        if normalized != raw.trim() {
                            dates_normalized += 1;
                        }
                        draft.activity_date = Some(normalized);
                    } else if !raw.trim().is_empty() {
                        draft.errors.push(format!("Invalid date format: '{}'", raw));
                    }
                }
            }

            if let Some(idx) = mappings.symbol {
                if let Some(raw) = fields.get(idx) {
                    let symbol = raw.trim().to_uppercase();
                    if !symbol.is_empty() {
                        draft.symbol = Some(symbol);
                    }
                }
            }

            if let Some(idx) = mappings.activity_type {
                if let Some(raw) = fields.get(idx) {
                    if let Some(normalized) = normalize_activity_type(raw, &plan.enum_maps.activity_type) {
                        if normalized.to_lowercase() != raw.to_lowercase().trim() {
                            activity_types_mapped += 1;
                        }
                        draft.activity_type = Some(normalized);
                    } else if !raw.trim().is_empty() {
                        draft.warnings.push(format!("Unknown activity type: '{}', defaulting to UNKNOWN", raw));
                        draft.activity_type = Some("UNKNOWN".to_string());
                    }
                }
            }

            // Determine if we should use absolute values
            let use_abs = plan.transforms.iter().any(|t| {
                t.field == "quantity" && matches!(t.op, TransformOp::ParseNumberAbs)
            });

            if let Some(idx) = mappings.quantity {
                if let Some(raw) = fields.get(idx) {
                    if let Some(num) = parse_number(raw, true) {
                        if raw.contains(['$', '€', '£', ',']) {
                            numbers_cleaned += 1;
                        }
                        draft.quantity = Some(if use_abs { num.abs() } else { num });
                    } else if !raw.trim().is_empty() {
                        draft.errors.push(format!("Invalid quantity: '{}'", raw));
                    }
                }
            }

            let use_abs_price = plan.transforms.iter().any(|t| {
                t.field == "unitPrice" && matches!(t.op, TransformOp::ParseNumberAbs)
            });

            if let Some(idx) = mappings.unit_price {
                if let Some(raw) = fields.get(idx) {
                    if let Some(num) = parse_number(raw, true) {
                        if raw.contains(['$', '€', '£', ',']) {
                            numbers_cleaned += 1;
                        }
                        draft.unit_price = Some(if use_abs_price { num.abs() } else { num });
                    } else if !raw.trim().is_empty() {
                        draft.errors.push(format!("Invalid unit price: '{}'", raw));
                    }
                }
            }

            if let Some(idx) = mappings.amount {
                if let Some(raw) = fields.get(idx) {
                    if let Some(num) = parse_number(raw, true) {
                        if raw.contains(['$', '€', '£', ',', '(', ')']) {
                            numbers_cleaned += 1;
                        }
                        draft.amount = Some(num);
                    } else if !raw.trim().is_empty() {
                        draft.errors.push(format!("Invalid amount: '{}'", raw));
                    }
                }
            }

            if let Some(idx) = mappings.fee {
                if let Some(raw) = fields.get(idx) {
                    if let Some(num) = parse_number(raw, true) {
                        if raw.contains(['$', '€', '£', ',']) {
                            numbers_cleaned += 1;
                        }
                        draft.fee = Some(num.abs());
                    }
                }
            }

            if let Some(idx) = mappings.currency {
                if let Some(raw) = fields.get(idx) {
                    let currency = raw.trim().to_uppercase();
                    if !currency.is_empty() {
                        draft.currency = Some(currency);
                    }
                }
            }

            if let Some(idx) = mappings.comment {
                if let Some(raw) = fields.get(idx) {
                    let notes = raw.trim().to_string();
                    if !notes.is_empty() {
                        draft.notes = Some(notes);
                    }
                }
            }

            // Apply sign rules
            for rule in &plan.sign_rules {
                match rule.field.as_str() {
                    "amount" => {
                        if let Some(amt) = draft.amount {
                            match rule.rule {
                                SignRule::NegativeIsSell if amt < 0.0 => {
                                    if draft.activity_type.is_none() {
                                        draft.activity_type = Some("SELL".to_string());
                                    }
                                    draft.amount = Some(amt.abs());
                                }
                                SignRule::NegativeIsWithdrawal if amt < 0.0 => {
                                    if draft.activity_type.is_none() {
                                        draft.activity_type = Some("WITHDRAWAL".to_string());
                                    }
                                    draft.amount = Some(amt.abs());
                                }
                                SignRule::AlwaysAbs => {
                                    draft.amount = Some(amt.abs());
                                }
                                _ => {}
                            }
                        }
                    }
                    "quantity" => {
                        if let Some(qty) = draft.quantity {
                            match rule.rule {
                                SignRule::NegativeIsSell if qty < 0.0 => {
                                    if draft.activity_type.is_none() {
                                        draft.activity_type = Some("SELL".to_string());
                                    }
                                    draft.quantity = Some(qty.abs());
                                }
                                SignRule::AlwaysAbs => {
                                    draft.quantity = Some(qty.abs());
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => {}
                }
            }

            // Validate and derive missing values
            self.validate_and_derive(&mut draft);

            activities.push(draft);
        }

        // Record cleaning actions
        if dates_normalized > 0 {
            cleaning_actions.push(CleaningAction {
                action_type: "normalize_dates".to_string(),
                description: format!("Normalized {} date values to ISO format", dates_normalized),
                affected_rows: dates_normalized,
            });
        }

        if numbers_cleaned > 0 {
            cleaning_actions.push(CleaningAction {
                action_type: "clean_numbers".to_string(),
                description: format!("Cleaned {} numeric values (removed currency symbols, formatting)", numbers_cleaned),
                affected_rows: numbers_cleaned,
            });
        }

        if activity_types_mapped > 0 {
            cleaning_actions.push(CleaningAction {
                action_type: "map_activity_types".to_string(),
                description: format!("Mapped {} activity types to canonical format", activity_types_mapped),
                affected_rows: activity_types_mapped,
            });
        }

        (activities, cleaning_actions, detected_headers, total_data_rows)
    }

    /// Validate a draft and derive missing values.
    fn validate_and_derive(&self, draft: &mut CsvActivityDraft) {
        let activity_type = draft.activity_type.as_deref().unwrap_or("UNKNOWN");

        // Date is required for all activities
        if draft.activity_date.is_none() {
            draft.errors.push("Date is required".to_string());
        }

        match activity_type {
            "BUY" | "SELL" => {
                if draft.symbol.is_none() {
                    draft.errors.push("Symbol is required for BUY/SELL".to_string());
                }
                if draft.quantity.is_none() {
                    draft.errors.push("Quantity is required for BUY/SELL".to_string());
                }
                if draft.unit_price.is_none() && draft.amount.is_none() {
                    draft.errors.push("Either unit price or amount is required for BUY/SELL".to_string());
                }
                // Derive amount if missing
                if draft.amount.is_none() {
                    if let (Some(qty), Some(price)) = (draft.quantity, draft.unit_price) {
                        let fee = draft.fee.unwrap_or(0.0);
                        draft.amount = Some(qty * price + fee);
                    }
                }
            }
            "DIVIDEND" | "INTEREST" => {
                if draft.amount.is_none() {
                    draft.errors.push("Amount is required for DIVIDEND/INTEREST".to_string());
                }
                if activity_type == "DIVIDEND" && draft.symbol.is_none() {
                    draft.warnings.push("Symbol recommended for DIVIDEND".to_string());
                }
            }
            "DEPOSIT" | "WITHDRAWAL" | "FEE" | "TAX" | "CREDIT" => {
                if draft.amount.is_none() {
                    draft.errors.push(format!("Amount is required for {}", activity_type));
                }
            }
            "TRANSFER_IN" | "TRANSFER_OUT" => {
                if draft.amount.is_none() && (draft.symbol.is_none() || draft.quantity.is_none()) {
                    draft.errors.push("Either amount or symbol+quantity is required for transfers".to_string());
                }
            }
            "SPLIT" => {
                if draft.symbol.is_none() {
                    draft.errors.push("Symbol is required for SPLIT".to_string());
                }
                if draft.quantity.is_none() {
                    draft.errors.push("Quantity is required for SPLIT".to_string());
                }
            }
            _ => {}
        }

        if let Some(qty) = draft.quantity {
            if qty < 0.0 {
                draft.warnings.push("Quantity is negative, will use absolute value".to_string());
            }
        }

        draft.is_valid = draft.errors.is_empty();
    }

    /// Build a default import plan from auto-detected mappings.
    fn build_default_plan(&self, headers: &[String]) -> ImportPlan {
        let column_mappings = detect_header_mappings(headers);

        // Default transforms
        let mut transforms = Vec::new();

        if column_mappings.date.is_some() {
            transforms.push(Transform {
                field: "date".to_string(),
                op: TransformOp::ParseDate,
                format_hints: vec![],
                inputs: vec![],
            });
        }

        if column_mappings.symbol.is_some() {
            transforms.push(Transform {
                field: "symbol".to_string(),
                op: TransformOp::Uppercase,
                format_hints: vec![],
                inputs: vec![],
            });
        }

        if column_mappings.quantity.is_some() {
            transforms.push(Transform {
                field: "quantity".to_string(),
                op: TransformOp::ParseNumberAbs,
                format_hints: vec![],
                inputs: vec![],
            });
        }

        if column_mappings.unit_price.is_some() {
            transforms.push(Transform {
                field: "unitPrice".to_string(),
                op: TransformOp::ParseNumberAbs,
                format_hints: vec![],
                inputs: vec![],
            });
        }

        // Calculate confidence based on matched columns
        let (overall, by_field) = calculate_mapping_confidence(&column_mappings);

        ImportPlan {
            column_mappings,
            transforms,
            enum_maps: EnumMaps::default(),
            sign_rules: vec![],
            confidence: Confidence { overall, by_field },
            notes: vec!["Auto-detected column mappings".to_string()],
            abstain: false,
        }
    }
}

/// Calculate confidence score based on which columns were mapped.
/// Required fields (date, symbol for trades) get higher weight.
fn calculate_mapping_confidence(mappings: &ColumnMappings) -> (f64, HashMap<String, f64>) {
    let mut by_field = HashMap::new();
    let mut total_score = 0.0;
    let mut total_weight = 0.0;

    // Required fields have higher weight
    const REQUIRED_WEIGHT: f64 = 2.0;
    const OPTIONAL_WEIGHT: f64 = 1.0;

    // Date is critical
    let date_score = if mappings.date.is_some() { 1.0 } else { 0.0 };
    by_field.insert("date".to_string(), date_score);
    total_score += date_score * REQUIRED_WEIGHT;
    total_weight += REQUIRED_WEIGHT;

    // Activity type is important
    let type_score = if mappings.activity_type.is_some() { 1.0 } else { 0.3 }; // Partial credit - can often be inferred
    by_field.insert("activityType".to_string(), type_score);
    total_score += type_score * REQUIRED_WEIGHT;
    total_weight += REQUIRED_WEIGHT;

    // Symbol is required for trades
    let symbol_score = if mappings.symbol.is_some() { 1.0 } else { 0.0 };
    by_field.insert("symbol".to_string(), symbol_score);
    total_score += symbol_score * REQUIRED_WEIGHT;
    total_weight += REQUIRED_WEIGHT;

    // Quantity is required for trades
    let qty_score = if mappings.quantity.is_some() { 1.0 } else { 0.0 };
    by_field.insert("quantity".to_string(), qty_score);
    total_score += qty_score * REQUIRED_WEIGHT;
    total_weight += REQUIRED_WEIGHT;

    // Unit price or amount - at least one should be mapped
    let price_score: f64 = if mappings.unit_price.is_some() { 1.0 } else { 0.0 };
    let amount_score: f64 = if mappings.amount.is_some() { 1.0 } else { 0.0 };
    let price_or_amount = price_score.max(amount_score);
    by_field.insert("unitPrice".to_string(), price_score);
    by_field.insert("amount".to_string(), amount_score);
    total_score += price_or_amount * REQUIRED_WEIGHT;
    total_weight += REQUIRED_WEIGHT;

    // Optional fields
    let fee_score = if mappings.fee.is_some() { 1.0 } else { 0.5 }; // Often not present
    by_field.insert("fee".to_string(), fee_score);
    total_score += fee_score * OPTIONAL_WEIGHT;
    total_weight += OPTIONAL_WEIGHT;

    let currency_score = if mappings.currency.is_some() { 1.0 } else { 0.5 }; // Often defaults to account currency
    by_field.insert("currency".to_string(), currency_score);
    total_score += currency_score * OPTIONAL_WEIGHT;
    total_weight += OPTIONAL_WEIGHT;

    let comment_score = if mappings.comment.is_some() { 1.0 } else { 0.8 }; // Nice to have
    by_field.insert("comment".to_string(), comment_score);
    total_score += comment_score * OPTIONAL_WEIGHT;
    total_weight += OPTIONAL_WEIGHT;

    let overall = if total_weight > 0.0 {
        (total_score / total_weight).min(1.0)
    } else {
        0.0
    };

    (overall, by_field)
}

impl<E: AiEnvironment> Clone for ImportCsvTool<E> {
    fn clone(&self) -> Self {
        Self {
            env: self.env.clone(),
            base_currency: self.base_currency.clone(),
        }
    }
}

impl<E: AiEnvironment + 'static> Tool for ImportCsvTool<E> {
    const NAME: &'static str = "import_csv";

    type Error = AiError;
    type Args = ImportCsvArgs;
    type Output = ImportCsvOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "REQUIRED for CSV file imports. When a user attaches a CSV file or provides CSV content, \
                you MUST call this tool. Pass the complete CSV text to csvContent. \
                The tool parses CSV data, auto-detects column mappings, normalizes dates/numbers/activity types, \
                and returns activity drafts for user review. Never analyze CSV content manually - always use this tool.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "csvContent": {
                        "type": "string",
                        "description": "Raw CSV content to parse. Include the full CSV text including headers."
                    },
                    "accountId": {
                        "type": "string",
                        "description": "Optional account ID to assign to all imported activities."
                    },
                    "importPlan": {
                        "type": "object",
                        "description": "Import plan with column mappings, transforms, and enum maps. If not provided, auto-detection is used.",
                        "properties": {
                            "columnMappings": {
                                "type": "object",
                                "description": "Maps CSV column indices (0-based) to activity fields.",
                                "properties": {
                                    "date": { "type": ["integer", "null"], "description": "Column index for date" },
                                    "activityType": { "type": ["integer", "null"], "description": "Column index for activity type" },
                                    "symbol": { "type": ["integer", "null"], "description": "Column index for symbol" },
                                    "quantity": { "type": ["integer", "null"], "description": "Column index for quantity" },
                                    "unitPrice": { "type": ["integer", "null"], "description": "Column index for unit price" },
                                    "amount": { "type": ["integer", "null"], "description": "Column index for amount" },
                                    "fee": { "type": ["integer", "null"], "description": "Column index for fee" },
                                    "currency": { "type": ["integer", "null"], "description": "Column index for currency" },
                                    "account": { "type": ["integer", "null"], "description": "Column index for account" },
                                    "comment": { "type": ["integer", "null"], "description": "Column index for notes" }
                                }
                            },
                            "transforms": {
                                "type": "array",
                                "description": "List of transforms to apply to fields.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "field": { "type": "string", "enum": ["date", "activityType", "symbol", "quantity", "unitPrice", "amount", "fee", "currency", "account", "comment"] },
                                        "op": { "type": "string", "enum": ["trim", "uppercase", "parse_date", "parse_number", "parse_number_abs", "strip_currency", "coalesce"] },
                                        "formatHints": { "type": "array", "items": { "type": "string" }, "description": "Format hints for parsing (e.g., date formats)" },
                                        "inputs": { "type": "array", "items": { "type": "integer" }, "description": "Column indices for coalesce" }
                                    },
                                    "required": ["field", "op"]
                                }
                            },
                            "enumMaps": {
                                "type": "object",
                                "description": "Enum mappings for normalizing values.",
                                "properties": {
                                    "activityType": {
                                        "type": "object",
                                        "description": "Maps CSV activity type values to canonical types (BUY, SELL, DIVIDEND, etc.)",
                                        "additionalProperties": { "type": "string" }
                                    }
                                }
                            },
                            "signRules": {
                                "type": "array",
                                "description": "Rules for interpreting sign of numeric fields.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "field": { "type": "string", "enum": ["amount", "quantity", "unitPrice", "fee"] },
                                        "rule": { "type": "string", "enum": ["negative_is_sell", "negative_is_withdrawal", "always_abs"] }
                                    },
                                    "required": ["field", "rule"]
                                }
                            },
                            "confidence": {
                                "type": "object",
                                "properties": {
                                    "overall": { "type": "number", "minimum": 0, "maximum": 1 },
                                    "byField": { "type": "object", "additionalProperties": { "type": "number" } }
                                }
                            },
                            "notes": { "type": "array", "items": { "type": "string" }, "description": "Notes about the mapping" },
                            "abstain": { "type": "boolean", "description": "Set to true if confidence is too low to propose a mapping" }
                        }
                    }
                },
                "required": ["csvContent"]
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        debug!(
            "import_csv called: content_len={}, account_id={:?}, has_plan={}",
            args.csv_content.len(),
            args.account_id,
            args.import_plan.is_some()
        );

        // Get available accounts
        let accounts = self
            .env
            .account_service()
            .get_active_accounts()
            .map_err(|e| AiError::ToolExecutionFailed(e.to_string()))?;

        let available_accounts: Vec<AccountOption> = accounts
            .iter()
            .map(|a| AccountOption {
                id: a.id.clone(),
                name: a.name.clone(),
                currency: a.currency.clone(),
            })
            .collect();

        // Detect headers first for default plan building
        let lines: Vec<&str> = args.csv_content
            .lines()
            .filter(|l| !l.trim().is_empty())
            .collect();

        let first_row_fields = if !lines.is_empty() {
            parse_csv_row(lines[0])
        } else {
            Vec::new()
        };

        // Build or use provided plan
        let mut plan = args.import_plan.unwrap_or_else(|| {
            // Check for legacy column_mappings
            if let Some(legacy_mappings) = args.column_mappings {
                let (overall, by_field) = calculate_mapping_confidence(&legacy_mappings);
                ImportPlan {
                    column_mappings: legacy_mappings,
                    transforms: vec![
                        Transform {
                            field: "date".to_string(),
                            op: TransformOp::ParseDate,
                            format_hints: vec![],
                            inputs: vec![],
                        },
                        Transform {
                            field: "symbol".to_string(),
                            op: TransformOp::Uppercase,
                            format_hints: vec![],
                            inputs: vec![],
                        },
                        Transform {
                            field: "quantity".to_string(),
                            op: TransformOp::ParseNumberAbs,
                            format_hints: vec![],
                            inputs: vec![],
                        },
                        Transform {
                            field: "unitPrice".to_string(),
                            op: TransformOp::ParseNumberAbs,
                            format_hints: vec![],
                            inputs: vec![],
                        },
                    ],
                    enum_maps: EnumMaps::default(),
                    sign_rules: vec![],
                    confidence: Confidence { overall, by_field },
                    notes: vec!["Using legacy column mappings".to_string()],
                    abstain: false,
                }
            } else {
                self.build_default_plan(&first_row_fields)
            }
        });

        // Recalculate confidence if it's at default (0.0) - LLM may not have provided it
        if plan.confidence.overall == 0.0 {
            let (overall, by_field) = calculate_mapping_confidence(&plan.column_mappings);
            plan.confidence = Confidence { overall, by_field };
        }

        // Check if model abstained
        if plan.abstain {
            return Ok(ImportCsvOutput {
                activities: Vec::new(),
                applied_plan: plan,
                cleaning_actions: Vec::new(),
                validation: ValidationSummary {
                    total_rows: 0,
                    valid_rows: 0,
                    error_rows: 0,
                    warning_rows: 0,
                    global_errors: vec!["Model abstained from mapping due to low confidence. Please map columns manually.".to_string()],
                },
                available_accounts,
                detected_headers: first_row_fields,
                total_rows: 0,
                truncated: None,
            });
        }

        // Apply the plan
        let (mut activities, cleaning_actions, detected_headers, total_rows) =
            self.apply_plan(&args.csv_content, &plan, args.account_id.as_deref());

        // Apply base currency as default
        for draft in &mut activities {
            if draft.currency.is_none() {
                draft.currency = Some(self.base_currency.clone());
            }
        }

        // Validate symbols against market data
        // Collect unique symbols that need resolution (non-cash activities with symbols)
        let cash_activity_types = [
            "DEPOSIT",
            "WITHDRAWAL",
            "INTEREST",
            "TRANSFER_IN",
            "TRANSFER_OUT",
            "TAX",
            "FEE",
            "CREDIT",
        ];

        let symbols_to_resolve: HashSet<String> = activities
            .iter()
            .filter_map(|a| {
                let symbol = a.symbol.as_ref()?;
                // Skip cash symbols and cash activity types
                if symbol.starts_with("$CASH-") {
                    return None;
                }
                if let Some(ref activity_type) = a.activity_type {
                    if cash_activity_types.contains(&activity_type.to_uppercase().as_str()) {
                        return None;
                    }
                }
                Some(symbol.clone())
            })
            .collect();

        // Resolve symbols via quote service
        let mut symbol_mic_cache: HashMap<String, Option<String>> = HashMap::new();
        for symbol in &symbols_to_resolve {
            let results = self
                .env
                .quote_service()
                .search_symbol_with_currency(symbol, Some(&self.base_currency))
                .await
                .unwrap_or_default();

            let exchange_mic = results.first().and_then(|r| r.exchange_mic.clone());
            symbol_mic_cache.insert(symbol.clone(), exchange_mic);
        }

        // Update activities with resolved exchange_mic or mark as invalid
        for draft in &mut activities {
            if let Some(ref symbol) = draft.symbol {
                // Skip cash symbols and cash activities
                if symbol.starts_with("$CASH-") {
                    continue;
                }
                if let Some(ref activity_type) = draft.activity_type {
                    if cash_activity_types.contains(&activity_type.to_uppercase().as_str()) {
                        continue;
                    }
                }

                // Check if symbol was resolved
                if let Some(mic_option) = symbol_mic_cache.get(symbol) {
                    if let Some(mic) = mic_option {
                        draft.exchange_mic = Some(mic.clone());
                    } else {
                        // Symbol couldn't be resolved - mark as invalid
                        draft.is_valid = false;
                        draft.errors.push(format!(
                            "Could not find '{}' in market data. Please search for the correct ticker symbol.",
                            symbol
                        ));
                    }
                }
            }
        }

        // Build validation summary
        let valid_rows = activities.iter().filter(|a| a.is_valid).count();
        let error_rows = activities.iter().filter(|a| !a.errors.is_empty()).count();
        let warning_rows = activities.iter().filter(|a| !a.warnings.is_empty()).count();

        let validation = ValidationSummary {
            total_rows: activities.len(),
            valid_rows,
            error_rows,
            warning_rows,
            global_errors: Vec::new(),
        };

        // Truncate if needed
        let original_count = activities.len();
        let truncated = original_count > MAX_IMPORT_ROWS;
        if truncated {
            activities.truncate(MAX_IMPORT_ROWS);
        }

        Ok(ImportCsvOutput {
            activities,
            applied_plan: plan,
            cleaning_actions,
            validation,
            available_accounts,
            detected_headers,
            total_rows,
            truncated: if truncated { Some(true) } else { None },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[test]
    fn test_parse_csv_row() {
        let row = r#"2024-01-15,AAPL,"Apple Inc.",100,150.50"#;
        let fields = parse_csv_row(row);
        assert_eq!(fields.len(), 5);
        assert_eq!(fields[0], "2024-01-15");
        assert_eq!(fields[1], "AAPL");
        assert_eq!(fields[2], "Apple Inc.");
        assert_eq!(fields[3], "100");
        assert_eq!(fields[4], "150.50");
    }

    #[test]
    fn test_parse_csv_row_escaped_quotes() {
        let row = r#""He said ""hello""",value"#;
        let fields = parse_csv_row(row);
        assert_eq!(fields.len(), 2);
        assert_eq!(fields[0], r#"He said "hello""#);
        assert_eq!(fields[1], "value");
    }

    #[test]
    fn test_normalize_date() {
        assert_eq!(normalize_date("2024-01-15", &[]), Some("2024-01-15".to_string()));
        assert_eq!(normalize_date("01/15/2024", &[]), Some("2024-01-15".to_string()));
        assert_eq!(normalize_date("15-Jan-2024", &[]), Some("2024-01-15".to_string()));
        assert_eq!(normalize_date("invalid", &[]), None);
        assert_eq!(normalize_date("2025-03-31T04:00:00Z", &[]), Some("2025-03-31".to_string()));
    }

    #[test]
    fn test_parse_number() {
        assert_eq!(parse_number("100.50", false), Some(100.50));
        assert_eq!(parse_number("$1,234.56", true), Some(1234.56));
        assert_eq!(parse_number("(100.00)", true), Some(-100.00));
        assert_eq!(parse_number("1234,56", false), Some(1234.56)); // European format
        assert_eq!(parse_number("invalid", false), None);
    }

    #[test]
    fn test_normalize_activity_type() {
        let custom = HashMap::new();
        assert_eq!(normalize_activity_type("Buy", &custom), Some("BUY".to_string()));
        assert_eq!(normalize_activity_type("PURCHASE", &custom), Some("BUY".to_string()));
        assert_eq!(normalize_activity_type("Sell", &custom), Some("SELL".to_string()));
        assert_eq!(normalize_activity_type("Dividend", &custom), Some("DIVIDEND".to_string()));
        assert_eq!(normalize_activity_type("unknown_type", &custom), None);
    }

    #[test]
    fn test_normalize_activity_type_with_custom_mappings() {
        let mut custom = HashMap::new();
        custom.insert("ACHAT".to_string(), "BUY".to_string());
        custom.insert("VENTE".to_string(), "SELL".to_string());

        assert_eq!(normalize_activity_type("ACHAT", &custom), Some("BUY".to_string()));
        assert_eq!(normalize_activity_type("Vente", &custom), Some("SELL".to_string()));
    }

    #[test]
    fn test_detect_header_mappings() {
        let headers = vec![
            "Date".to_string(),
            "Symbol".to_string(),
            "Quantity".to_string(),
            "Price".to_string(),
            "Total".to_string(),
            "Type".to_string(),
        ];
        let mappings = detect_header_mappings(&headers);
        assert_eq!(mappings.date, Some(0));
        assert_eq!(mappings.symbol, Some(1));
        assert_eq!(mappings.quantity, Some(2));
        assert_eq!(mappings.unit_price, Some(3));
        assert_eq!(mappings.amount, Some(4));
        assert_eq!(mappings.activity_type, Some(5));
    }

    #[tokio::test]
    async fn test_import_csv_basic() {
        let env = Arc::new(MockEnvironment::new());
        let tool = ImportCsvTool::new(env, "USD".to_string());

        let csv = r#"Date,Symbol,Quantity,Price,Type
2024-01-15,AAPL,100,150.50,Buy
2024-01-16,GOOGL,50,140.00,Sell"#;

        let result = tool
            .call(ImportCsvArgs {
                csv_content: csv.to_string(),
                account_id: None,
                import_plan: None,
                column_mappings: None,
            })
            .await;

        assert!(result.is_ok());
        let output = result.unwrap();
        assert_eq!(output.activities.len(), 2);
        assert_eq!(output.activities[0].symbol, Some("AAPL".to_string()));
        assert_eq!(output.activities[0].activity_type, Some("BUY".to_string()));
        assert_eq!(output.activities[1].activity_type, Some("SELL".to_string()));
    }

    #[tokio::test]
    async fn test_import_csv_with_plan() {
        let env = Arc::new(MockEnvironment::new());
        let tool = ImportCsvTool::new(env, "USD".to_string());

        let csv = r#"Datum,Ticker,Menge,Preis,Aktion
2024-01-15,AAPL,100,150.50,KAUF
2024-01-16,GOOGL,50,140.00,VERKAUF"#;

        let mut activity_type_map = HashMap::new();
        activity_type_map.insert("KAUF".to_string(), "BUY".to_string());
        activity_type_map.insert("VERKAUF".to_string(), "SELL".to_string());

        let plan = ImportPlan {
            column_mappings: ColumnMappings {
                date: Some(0),
                symbol: Some(1),
                quantity: Some(2),
                unit_price: Some(3),
                activity_type: Some(4),
                ..Default::default()
            },
            transforms: vec![
                Transform {
                    field: "date".to_string(),
                    op: TransformOp::ParseDate,
                    format_hints: vec![],
                    inputs: vec![],
                },
                Transform {
                    field: "symbol".to_string(),
                    op: TransformOp::Uppercase,
                    format_hints: vec![],
                    inputs: vec![],
                },
            ],
            enum_maps: EnumMaps {
                activity_type: activity_type_map,
            },
            sign_rules: vec![],
            confidence: Confidence {
                overall: 0.9,
                by_field: HashMap::new(),
            },
            notes: vec!["German broker format".to_string()],
            abstain: false,
        };

        let result = tool
            .call(ImportCsvArgs {
                csv_content: csv.to_string(),
                account_id: None,
                import_plan: Some(plan),
                column_mappings: None,
            })
            .await;

        assert!(result.is_ok());
        let output = result.unwrap();
        assert_eq!(output.activities.len(), 2);
        assert_eq!(output.activities[0].activity_type, Some("BUY".to_string()));
        assert_eq!(output.activities[1].activity_type, Some("SELL".to_string()));
    }

    #[tokio::test]
    async fn test_import_csv_with_sign_rules() {
        let env = Arc::new(MockEnvironment::new());
        let tool = ImportCsvTool::new(env, "USD".to_string());

        let csv = r#"Date,Symbol,Quantity,Amount
2024-01-15,AAPL,100,15050.00
2024-01-16,GOOGL,-50,-7000.00"#;

        let plan = ImportPlan {
            column_mappings: ColumnMappings {
                date: Some(0),
                symbol: Some(1),
                quantity: Some(2),
                amount: Some(3),
                ..Default::default()
            },
            transforms: vec![],
            enum_maps: EnumMaps::default(),
            sign_rules: vec![
                SignRuleConfig {
                    field: "quantity".to_string(),
                    rule: SignRule::NegativeIsSell,
                },
            ],
            confidence: Confidence::default(),
            notes: vec![],
            abstain: false,
        };

        let result = tool
            .call(ImportCsvArgs {
                csv_content: csv.to_string(),
                account_id: None,
                import_plan: Some(plan),
                column_mappings: None,
            })
            .await;

        assert!(result.is_ok());
        let output = result.unwrap();
        assert_eq!(output.activities.len(), 2);
        // First row should remain as-is (positive quantity)
        assert_eq!(output.activities[0].quantity, Some(100.0));
        // Second row: negative quantity should be converted to SELL with absolute value
        assert_eq!(output.activities[1].activity_type, Some("SELL".to_string()));
        assert_eq!(output.activities[1].quantity, Some(50.0));
    }

    #[test]
    fn test_calculate_mapping_confidence() {
        // Full mappings should give high confidence
        let full_mappings = ColumnMappings {
            date: Some(0),
            activity_type: Some(1),
            symbol: Some(2),
            quantity: Some(3),
            unit_price: Some(4),
            amount: Some(5),
            fee: Some(6),
            currency: Some(7),
            comment: Some(8),
            account: None,
        };
        let (overall, by_field) = calculate_mapping_confidence(&full_mappings);
        assert!(overall > 0.9, "Full mappings should have high confidence, got {}", overall);
        assert_eq!(by_field.get("date"), Some(&1.0));
        assert_eq!(by_field.get("symbol"), Some(&1.0));

        // Minimal mappings should still have decent confidence if core fields are present
        let minimal_mappings = ColumnMappings {
            date: Some(0),
            symbol: Some(1),
            quantity: Some(2),
            unit_price: Some(3),
            ..Default::default()
        };
        let (overall_min, _) = calculate_mapping_confidence(&minimal_mappings);
        assert!(overall_min > 0.6, "Minimal trade mappings should have decent confidence, got {}", overall_min);

        // Empty mappings should have low confidence
        let empty_mappings = ColumnMappings::default();
        let (overall_empty, _) = calculate_mapping_confidence(&empty_mappings);
        assert!(overall_empty < 0.5, "Empty mappings should have low confidence, got {}", overall_empty);
    }

    #[tokio::test]
    async fn test_import_csv_confidence_recalculated() {
        let env = Arc::new(MockEnvironment::new());
        let tool = ImportCsvTool::new(env, "USD".to_string());

        let csv = r#"Date,Symbol,Quantity,Amount
2024-01-15,AAPL,100,15050.00"#;

        // Provide plan with zero confidence - should be recalculated
        let plan = ImportPlan {
            column_mappings: ColumnMappings {
                date: Some(0),
                symbol: Some(1),
                quantity: Some(2),
                amount: Some(3),
                ..Default::default()
            },
            transforms: vec![],
            enum_maps: EnumMaps::default(),
            sign_rules: vec![],
            confidence: Confidence::default(), // 0.0 - should be recalculated
            notes: vec![],
            abstain: false,
        };

        let result = tool
            .call(ImportCsvArgs {
                csv_content: csv.to_string(),
                account_id: None,
                import_plan: Some(plan),
                column_mappings: None,
            })
            .await;

        assert!(result.is_ok());
        let output = result.unwrap();
        // Confidence should be recalculated and > 0
        assert!(
            output.applied_plan.confidence.overall > 0.0,
            "Confidence should be recalculated, got {}",
            output.applied_plan.confidence.overall
        );
        // Should have field-level confidence
        assert!(!output.applied_plan.confidence.by_field.is_empty());
    }
}
