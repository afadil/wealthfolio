//! CSV import tool using shared ImportMappingData format.
//!
//! Uses the same mapping format as manual import for consistency.
//! LLM proposes mappings using header names (not column indices).
//!
//! Flow:
//! 1. Tool receives CSV content and optional account_id
//! 2. If account has saved profile, load it as starting point
//! 3. LLM can override/enhance mappings via import_mapping parameter
//! 4. Tool parses CSV using core parser (same as manual import)
//! 5. Returns activity drafts + mapping for user to save

use log::debug;
use rig::{completion::ToolDefinition, tool::Tool};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use wealthfolio_core::activities::{ImportMappingData, ParseConfig, ParsedCsvResult};

use super::constants::MAX_IMPORT_ROWS;
use super::record_activity::AccountOption;
use crate::env::AiEnvironment;
use crate::error::AiError;

// ============================================================================
// Tool Arguments
// ============================================================================

/// Arguments for the import_csv tool.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCsvArgs {
    /// Raw CSV content to parse.
    pub csv_content: String,

    /// Account ID to assign to all activities and load saved mapping from.
    pub account_id: Option<String>,

    /// Import mapping proposed by LLM (uses same format as manual import).
    /// If not provided, auto-detection + saved profile will be used.
    pub import_mapping: Option<ImportMappingData>,
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

    /// The mapping that was applied (can be saved by user).
    pub applied_mapping: ImportMappingData,

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

    /// Whether a saved profile was loaded as starting point.
    #[serde(default)]
    pub used_saved_profile: bool,
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
// Field Constants (matching ImportMappingData keys)
// ============================================================================

const FIELD_DATE: &str = "date";
const FIELD_ACTIVITY_TYPE: &str = "activityType";
const FIELD_SYMBOL: &str = "symbol";
const FIELD_QUANTITY: &str = "quantity";
const FIELD_UNIT_PRICE: &str = "unitPrice";
const FIELD_AMOUNT: &str = "amount";
const FIELD_FEE: &str = "fee";
const FIELD_CURRENCY: &str = "currency";
const FIELD_ACCOUNT: &str = "account";
const FIELD_COMMENT: &str = "comment";
const FIELD_FX_RATE: &str = "fxRate";
const FIELD_SUBTYPE: &str = "subtype";

// ============================================================================
// Header Detection Patterns (shared logic for auto-mapping)
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
    "time",
    "datetime",
];

const ACTIVITY_TYPE_PATTERNS: &[&str] = &[
    "type",
    "activity type",
    "transaction type",
    "action",
    "activity",
    "activity_type",
    "transaction_type",
    "trans type",
    "operation",
];

const SYMBOL_PATTERNS: &[&str] = &[
    "symbol",
    "ticker",
    "stock",
    "security",
    "asset",
    "instrument",
    "ticker symbol",
    "stock symbol",
    "isin",
    "cusip",
];

const QUANTITY_PATTERNS: &[&str] = &[
    "quantity",
    "qty",
    "shares",
    "units",
    "no of shares",
    "number of shares",
    "volume",
];

const UNIT_PRICE_PATTERNS: &[&str] = &[
    "price",
    "unit price",
    "share price",
    "cost per share",
    "avg price",
    "unit_price",
    "share_price",
    "execution price",
    "trade price",
];

const AMOUNT_PATTERNS: &[&str] = &[
    "total",
    "amount",
    "value",
    "net amount",
    "gross amount",
    "market value",
    "total amount",
    "total value",
    "proceeds",
    "cost",
    "net value",
];

const CURRENCY_PATTERNS: &[&str] = &["currency", "ccy", "currency code", "curr", "trade currency"];

const FEE_PATTERNS: &[&str] = &[
    "fee",
    "fees",
    "commission",
    "commissions",
    "trading fee",
    "transaction fee",
    "brokerage",
    "charges",
];

const ACCOUNT_PATTERNS: &[&str] = &[
    "account",
    "account id",
    "account name",
    "portfolio",
    "account number",
];

const COMMENT_PATTERNS: &[&str] = &[
    "comment",
    "comments",
    "note",
    "notes",
    "description",
    "memo",
    "remarks",
];

const FX_RATE_PATTERNS: &[&str] = &[
    "fx rate",
    "fxrate",
    "fx_rate",
    "exchange rate",
    "exchangerate",
    "exchange_rate",
    "forex rate",
    "conversion rate",
];

const SUBTYPE_PATTERNS: &[&str] = &[
    "subtype",
    "sub type",
    "sub_type",
    "variation",
    "subcategory",
];

// ============================================================================
// Helper Functions
// ============================================================================

/// Auto-detect field mappings from CSV headers.
fn auto_detect_field_mappings(headers: &[String]) -> HashMap<String, String> {
    let mut mappings = HashMap::new();
    let mut used_headers = HashSet::new();

    let field_patterns: &[(&str, &[&str])] = &[
        (FIELD_DATE, DATE_PATTERNS),
        (FIELD_ACTIVITY_TYPE, ACTIVITY_TYPE_PATTERNS),
        (FIELD_SYMBOL, SYMBOL_PATTERNS),
        (FIELD_QUANTITY, QUANTITY_PATTERNS),
        (FIELD_UNIT_PRICE, UNIT_PRICE_PATTERNS),
        (FIELD_AMOUNT, AMOUNT_PATTERNS),
        (FIELD_CURRENCY, CURRENCY_PATTERNS),
        (FIELD_FEE, FEE_PATTERNS),
        (FIELD_ACCOUNT, ACCOUNT_PATTERNS),
        (FIELD_COMMENT, COMMENT_PATTERNS),
        (FIELD_FX_RATE, FX_RATE_PATTERNS),
        (FIELD_SUBTYPE, SUBTYPE_PATTERNS),
    ];

    for (field, patterns) in field_patterns {
        for header in headers {
            if used_headers.contains(header) {
                continue;
            }
            let lower = header.to_lowercase();
            if patterns.iter().any(|p| lower == *p || lower.contains(p)) {
                mappings.insert(field.to_string(), header.clone());
                used_headers.insert(header.clone());
                break;
            }
        }
    }

    mappings
}

/// Normalize a date string to ISO 8601 format.
fn normalize_date(input: &str, _format_hints: &[String]) -> Option<String> {
    let input = input.trim();
    if input.is_empty() {
        return None;
    }

    // Try ISO 8601 first (YYYY-MM-DD or with time)
    if let Some(date_part) = input.split('T').next() {
        if date_part.len() == 10 && date_part.chars().nth(4) == Some('-') {
            return Some(date_part.to_string());
        }
    }

    // Common date formats to try
    let formats = [
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%m-%d-%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
        "%d %b %Y",
        "%d-%b-%Y",
        "%b %d, %Y",
    ];

    for fmt in formats {
        if let Ok(parsed) = chrono::NaiveDate::parse_from_str(input, fmt) {
            return Some(parsed.format("%Y-%m-%d").to_string());
        }
    }

    // Try parsing with chrono's flexible parser
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(input) {
        return Some(dt.format("%Y-%m-%d").to_string());
    }

    None
}

/// Parse a number from string, handling various formats.
fn parse_number(input: &str, strip_sign: bool) -> Option<f64> {
    let mut s = input.trim().to_string();
    if s.is_empty() {
        return None;
    }

    // Track if negative (parentheses or minus)
    let is_negative = s.starts_with('(') && s.ends_with(')') || s.starts_with('-');

    // Remove currency symbols and formatting
    s = s.replace(['$', '€', '£', '¥', '(', ')', ' '], "");

    // Handle European format (1.234,56 -> 1234.56)
    if s.contains(',') && s.contains('.') {
        if s.rfind(',') > s.rfind('.') {
            // European: dots are thousands, comma is decimal
            s = s.replace('.', "").replace(',', ".");
        } else {
            // US: commas are thousands
            s = s.replace(',', "");
        }
    } else if s.contains(',') && !s.contains('.') {
        // Could be European decimal or US thousands
        let comma_pos = s.rfind(',').unwrap();
        let after_comma = s.len() - comma_pos - 1;
        if after_comma <= 2 {
            // Likely decimal
            s = s.replace(',', ".");
        } else {
            // Likely thousands separator
            s = s.replace(',', "");
        }
    }

    // Remove any remaining minus sign for parsing
    s = s.replace('-', "");

    match s.parse::<f64>() {
        Ok(num) => {
            let result = if is_negative && !strip_sign {
                -num
            } else {
                num.abs()
            };
            Some(result)
        }
        Err(_) => None,
    }
}

/// Normalize activity type to canonical form.
fn normalize_activity_type(
    input: &str,
    custom_mappings: &HashMap<String, Vec<String>>,
) -> Option<String> {
    let upper = input.trim().to_uppercase();
    if upper.is_empty() {
        return None;
    }

    // Check custom mappings first (ActivityType -> [csv_values])
    for (activity_type, csv_values) in custom_mappings {
        for csv_value in csv_values {
            if upper == csv_value.to_uppercase() || upper.starts_with(&csv_value.to_uppercase()) {
                return Some(activity_type.clone());
            }
        }
    }

    // Built-in mappings
    let builtin: &[(&[&str], &str)] = &[
        (
            &["BUY", "PURCHASE", "BOUGHT", "MARKET BUY", "LIMIT BUY"],
            "BUY",
        ),
        (&["SELL", "SOLD", "MARKET SELL", "LIMIT SELL"], "SELL"),
        (
            &["DIVIDEND", "DIV", "CASH DIVIDEND", "QUALIFIED DIVIDEND"],
            "DIVIDEND",
        ),
        (&["INTEREST", "INT", "CASH INTEREST"], "INTEREST"),
        (
            &["DEPOSIT", "DEP", "CASH DEPOSIT", "WIRE IN", "ACH IN"],
            "DEPOSIT",
        ),
        (
            &[
                "WITHDRAWAL",
                "WITHDRAW",
                "CASH WITHDRAWAL",
                "WIRE OUT",
                "ACH OUT",
            ],
            "WITHDRAWAL",
        ),
        (
            &["TRANSFER IN", "TRANSFER_IN", "JOURNAL IN", "ACAT IN"],
            "TRANSFER_IN",
        ),
        (
            &["TRANSFER OUT", "TRANSFER_OUT", "JOURNAL OUT", "ACAT OUT"],
            "TRANSFER_OUT",
        ),
        (
            &["SPLIT", "STOCK SPLIT", "FORWARD SPLIT", "REVERSE SPLIT"],
            "SPLIT",
        ),
        (&["FEE", "FEES", "SERVICE FEE", "MANAGEMENT FEE"], "FEE"),
        (&["TAX", "TAXES", "WITHHOLDING", "TAX WITHHELD"], "TAX"),
    ];

    for (patterns, canonical) in builtin {
        if patterns.iter().any(|p| upper == *p || upper.starts_with(p)) {
            return Some(canonical.to_string());
        }
    }

    None
}

/// Check if a row looks like metadata (should be skipped).
fn is_metadata_row(fields: &[String]) -> bool {
    let populated_count = fields.iter().filter(|f| !f.trim().is_empty()).count();
    if populated_count < 3 {
        return true;
    }

    // Check if row has any numeric values
    let has_numeric = fields.iter().any(|f| {
        let cleaned = f.replace(['$', '€', '£', ',', ' '], "");
        cleaned.parse::<f64>().is_ok()
    });

    !has_numeric
}

// ============================================================================
// Tool Implementation
// ============================================================================

/// Tool to import activities from CSV using shared ImportMappingData format.
pub struct ImportCsvTool<E: AiEnvironment> {
    env: Arc<E>,
    base_currency: String,
}

impl<E: AiEnvironment> ImportCsvTool<E> {
    pub fn new(env: Arc<E>, base_currency: String) -> Self {
        Self { env, base_currency }
    }

    /// Apply mapping to parsed CSV content.
    fn apply_mapping(
        &self,
        parsed: &ParsedCsvResult,
        mapping: &ImportMappingData,
        account_id: Option<&str>,
    ) -> (Vec<CsvActivityDraft>, Vec<CleaningAction>, usize) {
        let mut activities = Vec::new();
        let mut cleaning_actions = Vec::new();

        let headers = &parsed.headers;
        let rows = &parsed.rows;

        if rows.is_empty() {
            return (activities, cleaning_actions, 0);
        }

        // Build header name -> index lookup (case-insensitive)
        let header_index: HashMap<String, usize> = headers
            .iter()
            .enumerate()
            .map(|(i, h)| (h.to_lowercase(), i))
            .collect();

        // Helper to get column index for a field
        let get_index = |field: &str| -> Option<usize> {
            mapping
                .field_mappings
                .get(field)
                .and_then(|header_name| header_index.get(&header_name.to_lowercase()).copied())
        };

        // Get column indices for each field
        let date_idx = get_index(FIELD_DATE);
        let type_idx = get_index(FIELD_ACTIVITY_TYPE);
        let symbol_idx = get_index(FIELD_SYMBOL);
        let qty_idx = get_index(FIELD_QUANTITY);
        let price_idx = get_index(FIELD_UNIT_PRICE);
        let amount_idx = get_index(FIELD_AMOUNT);
        let fee_idx = get_index(FIELD_FEE);
        let currency_idx = get_index(FIELD_CURRENCY);
        let account_idx = get_index(FIELD_ACCOUNT);
        let comment_idx = get_index(FIELD_COMMENT);

        // Track stats
        let mut dates_normalized = 0;
        let mut numbers_cleaned = 0;
        let mut activity_types_mapped = 0;

        // Process rows
        let total_rows = rows.len();
        for (row_idx, fields) in rows.iter().enumerate() {
            let row_number = row_idx + 1;

            if is_metadata_row(fields) {
                continue;
            }

            let get_field = |idx: Option<usize>| -> Option<String> {
                idx.and_then(|i| fields.get(i).map(|s| s.trim().to_string()))
                    .filter(|s| !s.is_empty())
            };

            // Extract and normalize fields
            let raw_date = get_field(date_idx);
            let activity_date = raw_date.as_ref().and_then(|d| {
                let result = normalize_date(d, &[]);
                if result.is_some() {
                    dates_normalized += 1;
                }
                result
            });

            let raw_type = get_field(type_idx);
            let activity_type = raw_type.as_ref().and_then(|t| {
                let result = normalize_activity_type(t, &mapping.activity_mappings);
                if result.is_some() {
                    activity_types_mapped += 1;
                }
                result
            });

            let raw_symbol = get_field(symbol_idx);
            let symbol = raw_symbol.as_ref().map(|s| {
                // Apply symbol mappings if defined
                mapping
                    .symbol_mappings
                    .get(s)
                    .cloned()
                    .unwrap_or_else(|| s.to_uppercase())
            });

            let quantity = get_field(qty_idx).and_then(|q| {
                let result = parse_number(&q, true);
                if result.is_some() {
                    numbers_cleaned += 1;
                }
                result
            });

            let unit_price = get_field(price_idx).and_then(|p| {
                let result = parse_number(&p, true);
                if result.is_some() {
                    numbers_cleaned += 1;
                }
                result
            });

            let amount = get_field(amount_idx).and_then(|a| {
                let result = parse_number(&a, false);
                if result.is_some() {
                    numbers_cleaned += 1;
                }
                result
            });

            let fee = get_field(fee_idx).and_then(|f| {
                let result = parse_number(&f, true);
                if result.is_some() {
                    numbers_cleaned += 1;
                }
                result
            });

            let currency = get_field(currency_idx);
            let notes = get_field(comment_idx);

            // Determine account ID
            let draft_account_id = account_id.map(|s| s.to_string()).or_else(|| {
                get_field(account_idx)
                    .and_then(|csv_acc| mapping.account_mappings.get(&csv_acc).cloned())
            });

            let mut draft = CsvActivityDraft {
                row_number,
                activity_type,
                activity_date,
                symbol,
                exchange_mic: None,
                quantity,
                unit_price,
                amount,
                fee,
                currency,
                notes,
                account_id: draft_account_id,
                is_valid: true,
                errors: Vec::new(),
                warnings: Vec::new(),
                raw_values: fields.clone(),
            };

            // Validate the draft
            self.validate_draft(&mut draft);

            activities.push(draft);
        }

        // Add cleaning stats
        if dates_normalized > 0 {
            cleaning_actions.push(CleaningAction {
                action_type: "normalize_dates".to_string(),
                description: format!("Normalized {} dates to ISO 8601", dates_normalized),
                affected_rows: dates_normalized,
            });
        }
        if numbers_cleaned > 0 {
            cleaning_actions.push(CleaningAction {
                action_type: "parse_numbers".to_string(),
                description: format!("Parsed {} numeric values", numbers_cleaned),
                affected_rows: numbers_cleaned,
            });
        }
        if activity_types_mapped > 0 {
            cleaning_actions.push(CleaningAction {
                action_type: "map_activity_types".to_string(),
                description: format!("Mapped {} activity types", activity_types_mapped),
                affected_rows: activity_types_mapped,
            });
        }

        (activities, cleaning_actions, total_rows)
    }

    /// Validate an activity draft.
    fn validate_draft(&self, draft: &mut CsvActivityDraft) {
        let activity_type = draft.activity_type.as_deref().unwrap_or("");

        // Date is required for all activities
        if draft.activity_date.is_none() {
            draft.errors.push("Date is required".to_string());
        }

        match activity_type {
            "BUY" | "SELL" => {
                if draft.symbol.is_none() {
                    draft
                        .errors
                        .push("Symbol is required for BUY/SELL".to_string());
                }
                if draft.quantity.is_none() {
                    draft
                        .errors
                        .push("Quantity is required for BUY/SELL".to_string());
                }
                if draft.unit_price.is_none() && draft.amount.is_none() {
                    draft
                        .errors
                        .push("Either unit price or amount is required".to_string());
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
                    draft
                        .errors
                        .push(format!("Amount is required for {}", activity_type));
                }
            }
            "DEPOSIT" | "WITHDRAWAL" | "FEE" | "TAX" => {
                if draft.amount.is_none() {
                    draft
                        .errors
                        .push(format!("Amount is required for {}", activity_type));
                }
            }
            "TRANSFER_IN" | "TRANSFER_OUT" => {
                if draft.amount.is_none() && (draft.symbol.is_none() || draft.quantity.is_none()) {
                    draft
                        .errors
                        .push("Either amount or symbol+quantity required".to_string());
                }
            }
            "SPLIT" => {
                if draft.symbol.is_none() {
                    draft
                        .errors
                        .push("Symbol is required for SPLIT".to_string());
                }
                if draft.amount.is_none() {
                    draft
                        .errors
                        .push("Amount (split ratio) is required for SPLIT".to_string());
                }
            }
            "" => {
                draft.errors.push("Activity type is required".to_string());
            }
            _ => {}
        }

        draft.is_valid = draft.errors.is_empty();
    }
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
                        "description": "Account ID to assign to imported activities. Also loads saved mapping profile for this account."
                    },
                    "importMapping": {
                        "type": "object",
                        "description": "Import mapping configuration. Uses header names (not column indices). If not provided, auto-detection is used.",
                        "properties": {
                            "fieldMappings": {
                                "type": "object",
                                "description": "Maps field names to CSV header names. Keys: date, activityType, symbol, quantity, unitPrice, amount, fee, currency, account, comment",
                                "additionalProperties": { "type": "string" }
                            },
                            "activityMappings": {
                                "type": "object",
                                "description": "Maps canonical activity types to CSV values. E.g., {\"BUY\": [\"Purchase\", \"Buy\"]}",
                                "additionalProperties": {
                                    "type": "array",
                                    "items": { "type": "string" }
                                }
                            },
                            "symbolMappings": {
                                "type": "object",
                                "description": "Maps CSV symbols to canonical symbols. E.g., {\"AAPL.US\": \"AAPL\"}",
                                "additionalProperties": { "type": "string" }
                            }
                        }
                    }
                },
                "required": ["csvContent"]
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        debug!(
            "import_csv called: content_len={}, account_id={:?}, has_mapping={}",
            args.csv_content.len(),
            args.account_id,
            args.import_mapping.is_some()
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

        // Parse CSV using core parser (same as manual import)
        let parse_config = ParseConfig::default();
        let parsed_csv = self
            .env
            .activity_service()
            .parse_csv(args.csv_content.as_bytes(), &parse_config)
            .map_err(|e| AiError::ToolExecutionFailed(format!("CSV parse error: {}", e)))?;

        let headers = parsed_csv.headers.clone();

        // Build mapping: LLM provided > saved profile > auto-detect
        let mut used_saved_profile = false;
        let mut mapping = if let Some(llm_mapping) = args.import_mapping {
            // LLM provided mapping
            llm_mapping
        } else if let Some(ref account_id) = args.account_id {
            // Try to load saved profile
            match self
                .env
                .activity_service()
                .get_import_mapping(account_id.clone())
            {
                Ok(saved) => {
                    used_saved_profile = true;
                    debug!("Loaded saved import mapping for account {}", account_id);
                    saved
                }
                Err(_) => {
                    // No saved profile, use auto-detection
                    ImportMappingData {
                        account_id: account_id.clone(),
                        field_mappings: auto_detect_field_mappings(&headers),
                        ..Default::default()
                    }
                }
            }
        } else {
            // No account, use auto-detection
            ImportMappingData {
                account_id: String::new(),
                field_mappings: auto_detect_field_mappings(&headers),
                ..Default::default()
            }
        };

        // Ensure account_id is set
        if let Some(ref account_id) = args.account_id {
            mapping.account_id = account_id.clone();
        }

        // Apply mapping
        let (mut activities, mut cleaning_actions, total_rows) =
            self.apply_mapping(&parsed_csv, &mapping, args.account_id.as_deref());

        // Log delimiter if non-standard
        if let Some(ref delim) = parsed_csv.detected_config.delimiter {
            if delim != "," {
                cleaning_actions.insert(
                    0,
                    CleaningAction {
                        action_type: "detect_delimiter".to_string(),
                        description: format!(
                            "Detected delimiter: '{}'",
                            if delim == "\t" { "tab" } else { delim }
                        ),
                        affected_rows: 0,
                    },
                );
            }
        }

        // Apply base currency as default
        for draft in &mut activities {
            if draft.currency.is_none() {
                draft.currency = Some(self.base_currency.clone());
            }
        }

        // Resolve symbols for non-cash activities
        let cash_types: HashSet<&str> = [
            "DEPOSIT",
            "WITHDRAWAL",
            "INTEREST",
            "TRANSFER_IN",
            "TRANSFER_OUT",
            "TAX",
            "FEE",
            "CREDIT",
        ]
        .into_iter()
        .collect();

        let symbols_to_resolve: HashSet<String> = activities
            .iter()
            .filter_map(|a| {
                let symbol = a.symbol.as_ref()?;
                if symbol.starts_with("$CASH-") {
                    return None;
                }
                if let Some(ref t) = a.activity_type {
                    if cash_types.contains(t.to_uppercase().as_str()) {
                        return None;
                    }
                }
                Some(symbol.clone())
            })
            .collect();

        let mut symbol_mic_cache: HashMap<String, Option<String>> = HashMap::new();
        for symbol in &symbols_to_resolve {
            let results = self
                .env
                .quote_service()
                .search_symbol_with_currency(symbol, Some(&self.base_currency))
                .await
                .unwrap_or_default();
            symbol_mic_cache.insert(
                symbol.clone(),
                results.first().and_then(|r| r.exchange_mic.clone()),
            );
        }

        // Update activities with resolved MICs
        for draft in &mut activities {
            if let Some(ref symbol) = draft.symbol {
                if symbol.starts_with("$CASH-") {
                    continue;
                }
                if let Some(ref t) = draft.activity_type {
                    if cash_types.contains(t.to_uppercase().as_str()) {
                        continue;
                    }
                }
                if let Some(mic_opt) = symbol_mic_cache.get(symbol) {
                    if let Some(mic) = mic_opt {
                        draft.exchange_mic = Some(mic.clone());
                    } else {
                        draft
                            .warnings
                            .push(format!("Symbol '{}' not found in market data", symbol));
                    }
                }
            }
        }

        // Truncate if needed
        let truncated = if activities.len() > MAX_IMPORT_ROWS {
            activities.truncate(MAX_IMPORT_ROWS);
            Some(true)
        } else {
            None
        };

        // Build validation summary
        let valid_rows = activities.iter().filter(|a| a.is_valid).count();
        let error_rows = activities.iter().filter(|a| !a.errors.is_empty()).count();
        let warning_rows = activities.iter().filter(|a| !a.warnings.is_empty()).count();

        Ok(ImportCsvOutput {
            activities,
            applied_mapping: mapping,
            cleaning_actions,
            validation: ValidationSummary {
                total_rows,
                valid_rows,
                error_rows,
                warning_rows,
                global_errors: Vec::new(),
            },
            available_accounts,
            detected_headers: headers,
            total_rows,
            truncated,
            used_saved_profile,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[test]
    fn test_normalize_date() {
        assert_eq!(
            normalize_date("2024-01-15", &[]),
            Some("2024-01-15".to_string())
        );
        assert_eq!(
            normalize_date("01/15/2024", &[]),
            Some("2024-01-15".to_string())
        );
        assert_eq!(
            normalize_date("15-Jan-2024", &[]),
            Some("2024-01-15".to_string())
        );
        assert_eq!(normalize_date("invalid", &[]), None);
    }

    #[test]
    fn test_parse_number() {
        assert_eq!(parse_number("100.50", false), Some(100.50));
        assert_eq!(parse_number("$1,234.56", true), Some(1234.56));
        assert_eq!(parse_number("(100.00)", true), Some(100.00));
        assert_eq!(parse_number("1234,56", false), Some(1234.56));
        assert_eq!(parse_number("invalid", false), None);
    }

    #[test]
    fn test_normalize_activity_type() {
        let custom = HashMap::new();
        assert_eq!(
            normalize_activity_type("Buy", &custom),
            Some("BUY".to_string())
        );
        assert_eq!(
            normalize_activity_type("PURCHASE", &custom),
            Some("BUY".to_string())
        );
        assert_eq!(
            normalize_activity_type("Sell", &custom),
            Some("SELL".to_string())
        );
        assert_eq!(
            normalize_activity_type("Dividend", &custom),
            Some("DIVIDEND".to_string())
        );
    }

    #[test]
    fn test_normalize_activity_type_with_custom_mappings() {
        let mut custom = HashMap::new();
        custom.insert("BUY".to_string(), vec!["ACHAT".to_string()]);
        custom.insert("SELL".to_string(), vec!["VENTE".to_string()]);

        assert_eq!(
            normalize_activity_type("ACHAT", &custom),
            Some("BUY".to_string())
        );
        assert_eq!(
            normalize_activity_type("Vente", &custom),
            Some("SELL".to_string())
        );
    }

    #[test]
    fn test_auto_detect_field_mappings() {
        let headers = vec![
            "Date".to_string(),
            "Symbol".to_string(),
            "Quantity".to_string(),
            "Price".to_string(),
            "Total".to_string(),
            "Type".to_string(),
        ];
        let mappings = auto_detect_field_mappings(&headers);
        assert_eq!(mappings.get(FIELD_DATE), Some(&"Date".to_string()));
        assert_eq!(mappings.get(FIELD_SYMBOL), Some(&"Symbol".to_string()));
        assert_eq!(mappings.get(FIELD_QUANTITY), Some(&"Quantity".to_string()));
        assert_eq!(mappings.get(FIELD_UNIT_PRICE), Some(&"Price".to_string()));
        assert_eq!(mappings.get(FIELD_AMOUNT), Some(&"Total".to_string()));
        assert_eq!(mappings.get(FIELD_ACTIVITY_TYPE), Some(&"Type".to_string()));
    }

    #[tokio::test]
    async fn test_import_csv_basic() {
        let env = Arc::new(MockEnvironment::new());
        let tool = ImportCsvTool::new(env, "USD".to_string());

        let csv = "Date,Symbol,Quantity,Price,Type\n2024-01-15,AAPL,10,150.00,Buy";
        let args = ImportCsvArgs {
            csv_content: csv.to_string(),
            account_id: None,
            import_mapping: None,
        };

        let result = tool.call(args).await.unwrap();
        assert_eq!(result.activities.len(), 1);
        assert_eq!(result.activities[0].symbol, Some("AAPL".to_string()));
        assert_eq!(result.activities[0].activity_type, Some("BUY".to_string()));
        assert_eq!(result.activities[0].quantity, Some(10.0));
    }

    #[tokio::test]
    async fn test_import_csv_with_mapping() {
        let env = Arc::new(MockEnvironment::new());
        let tool = ImportCsvTool::new(env, "USD".to_string());

        let csv = "Datum,Ticker,Aantal,Prijs,Actie\n2024-01-15,AAPL,10,150.00,Kopen";

        let mut field_mappings = HashMap::new();
        field_mappings.insert("date".to_string(), "Datum".to_string());
        field_mappings.insert("symbol".to_string(), "Ticker".to_string());
        field_mappings.insert("quantity".to_string(), "Aantal".to_string());
        field_mappings.insert("unitPrice".to_string(), "Prijs".to_string());
        field_mappings.insert("activityType".to_string(), "Actie".to_string());

        let mut activity_mappings = HashMap::new();
        activity_mappings.insert("BUY".to_string(), vec!["Kopen".to_string()]);

        let args = ImportCsvArgs {
            csv_content: csv.to_string(),
            account_id: None,
            import_mapping: Some(ImportMappingData {
                account_id: String::new(),
                name: String::new(),
                field_mappings,
                activity_mappings,
                symbol_mappings: HashMap::new(),
                account_mappings: HashMap::new(),
                parse_config: None,
            }),
        };

        let result = tool.call(args).await.unwrap();
        assert_eq!(result.activities.len(), 1);
        assert_eq!(result.activities[0].symbol, Some("AAPL".to_string()));
        assert_eq!(result.activities[0].activity_type, Some("BUY".to_string()));
    }
}
