//! Record Activity tool - create activity drafts from natural language input.
//!
//! This tool enables users to record transactions conversationally (e.g., "Buy 20 AAPL at 240 yesterday").
//! Returns an editable draft preview; user confirms via UI button.

use log::debug;
use rig::{completion::ToolDefinition, tool::Tool};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::env::AiEnvironment;
use crate::error::AiError;

// ============================================================================
// Tool Arguments (LLM Input)
// ============================================================================

/// Arguments for the record_activity tool.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordActivityArgs {
    /// Activity type: BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, TRANSFER_IN,
    /// TRANSFER_OUT, INTEREST, FEE, SPLIT, TAX, CREDIT, ADJUSTMENT, UNKNOWN.
    pub activity_type: String,

    /// Symbol (e.g., "AAPL", "BTC"). Required for trading activities.
    pub symbol: Option<String>,

    /// ISO 8601 date (e.g., "2026-01-17"). LLM converts "yesterday" to ISO.
    pub activity_date: String,

    /// Number of shares/units. Required for BUY/SELL.
    pub quantity: Option<f64>,

    /// Price per unit. If omitted, tool may attempt to fetch historical price.
    pub unit_price: Option<f64>,

    /// Total amount. For DEPOSIT/WITHDRAWAL/DIVIDEND/etc.
    pub amount: Option<f64>,

    /// Transaction fee.
    pub fee: Option<f64>,

    /// Account name or ID. If ambiguous/missing, tool returns available accounts.
    pub account: Option<String>,

    /// Activity subtype: DRIP, DIVIDEND_IN_KIND, STAKING_REWARD, BONUS.
    pub subtype: Option<String>,

    /// Optional notes.
    pub notes: Option<String>,
}

// ============================================================================
// Output Types
// ============================================================================

/// Output envelope for record_activity tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordActivityOutput {
    /// Draft preview data.
    pub draft: ActivityDraft,

    /// Validation status.
    pub validation: ValidationResult,

    /// Available accounts (for dropdown).
    pub available_accounts: Vec<AccountOption>,

    /// Resolved asset info (if symbol provided and resolved).
    pub resolved_asset: Option<ResolvedAsset>,

    /// Available subtypes for this activity type (for dropdown).
    pub available_subtypes: Vec<SubtypeOption>,
}

/// Activity draft data for preview/editing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDraft {
    pub activity_type: String,
    /// ISO 8601 date.
    pub activity_date: String,
    pub symbol: Option<String>,
    /// Resolved canonical ID (e.g., "SEC:AAPL:XNAS").
    pub asset_id: Option<String>,
    /// Display name for the asset.
    pub asset_name: Option<String>,
    pub quantity: Option<f64>,
    pub unit_price: Option<f64>,
    /// Computed or provided amount.
    pub amount: Option<f64>,
    pub fee: Option<f64>,
    /// From asset or account.
    pub currency: String,
    /// Resolved account ID.
    pub account_id: Option<String>,
    /// Display name for the account.
    pub account_name: Option<String>,
    /// Activity subtype.
    pub subtype: Option<String>,
    pub notes: Option<String>,

    /// Price source: "user", "historical", "none".
    pub price_source: String,

    /// Pricing mode: "MARKET" or "MANUAL".
    pub pricing_mode: String,

    /// True if asset not found and needs custom creation.
    pub is_custom_asset: bool,

    /// Asset kind for custom assets: "SECURITY", "CRYPTO", "OTHER".
    pub asset_kind: Option<String>,
}

/// Validation result for the draft.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub is_valid: bool,
    /// Fields that are required but missing (e.g., ["account_id", "quantity"]).
    pub missing_fields: Vec<String>,
    /// Semantic validation errors.
    pub errors: Vec<ValidationError>,
}

/// A validation error for a specific field.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

/// An account option for the dropdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountOption {
    pub id: String,
    pub name: String,
    pub currency: String,
}

/// Resolved asset information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedAsset {
    /// Canonical asset ID (e.g., "SEC:AAPL:XNAS").
    pub asset_id: String,
    pub symbol: String,
    pub name: String,
    pub currency: String,
    /// Exchange name (e.g., "NASDAQ").
    pub exchange: Option<String>,
    /// Exchange MIC code (e.g., "XNAS").
    pub exchange_mic: Option<String>,
}

/// A subtype option for the dropdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtypeOption {
    /// Value (e.g., "DRIP").
    pub value: String,
    /// Display label (e.g., "Dividend Reinvested").
    pub label: String,
}

// ============================================================================
// Constants
// ============================================================================

/// Canonical activity types.
const ACTIVITY_TYPES: &[&str] = &[
    "BUY",
    "SELL",
    "SPLIT",
    "DIVIDEND",
    "INTEREST",
    "DEPOSIT",
    "WITHDRAWAL",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "FEE",
    "TAX",
    "CREDIT",
    "ADJUSTMENT",
    "UNKNOWN",
];

// ============================================================================
// Subtype Mappings
// ============================================================================

/// Get available subtypes for an activity type.
/// Only includes subtypes that affect calculations (compiler expansion or flow classification).
fn get_subtypes_for_activity_type(activity_type: &str) -> Vec<SubtypeOption> {
    match activity_type.to_uppercase().as_str() {
        // DIVIDEND subtypes
        "DIVIDEND" => vec![
            SubtypeOption {
                value: "DRIP".to_string(),
                label: "Dividend Reinvested (DRIP)".to_string(),
            },
            SubtypeOption {
                value: "DIVIDEND_IN_KIND".to_string(),
                label: "Dividend in Kind".to_string(),
            },
        ],
        // STAKING_REWARD expands to INTEREST + BUY
        "INTEREST" => vec![SubtypeOption {
            value: "STAKING_REWARD".to_string(),
            label: "Staking Reward".to_string(),
        }],
        // BONUS is external flow (affects TWR)
        "CREDIT" => vec![SubtypeOption {
            value: "BONUS".to_string(),
            label: "Bonus".to_string(),
        }],
        _ => vec![],
    }
}

// ============================================================================
// Tool Implementation
// ============================================================================

/// Tool to record investment activities from natural language.
pub struct RecordActivityTool<E: AiEnvironment> {
    env: Arc<E>,
}

impl<E: AiEnvironment> RecordActivityTool<E> {
    pub fn new(env: Arc<E>) -> Self {
        Self { env }
    }

    /// Resolve account by name or ID with fuzzy matching.
    /// Auto-selects if there's only one account and no hint provided.
    fn resolve_account(
        &self,
        account_hint: Option<&str>,
        accounts: &[wealthfolio_core::accounts::Account],
    ) -> (Option<String>, Option<String>) {
        // If no hint provided, auto-select if there's only one account
        let Some(hint) = account_hint else {
            if accounts.len() == 1 {
                return (
                    Some(accounts[0].id.clone()),
                    Some(accounts[0].name.clone()),
                );
            }
            return (None, None);
        };

        let hint_lower = hint.to_lowercase();

        // First try exact ID match
        if let Some(account) = accounts.iter().find(|a| a.id == hint) {
            return (Some(account.id.clone()), Some(account.name.clone()));
        }

        // Try exact name match (case-insensitive)
        if let Some(account) = accounts
            .iter()
            .find(|a| a.name.to_lowercase() == hint_lower)
        {
            return (Some(account.id.clone()), Some(account.name.clone()));
        }

        // Try partial name match (contains)
        let matches: Vec<_> = accounts
            .iter()
            .filter(|a| a.name.to_lowercase().contains(&hint_lower))
            .collect();

        if matches.len() == 1 {
            return (
                Some(matches[0].id.clone()),
                Some(matches[0].name.clone()),
            );
        }

        // Ambiguous or not found
        (None, None)
    }

    /// Validate activity type against canonical types.
    fn validate_activity_type(&self, activity_type: &str) -> Option<String> {
        let upper = activity_type.to_uppercase();
        if ACTIVITY_TYPES.contains(&upper.as_str()) {
            Some(upper)
        } else {
            None
        }
    }

    /// Validate required fields based on activity type.
    fn validate_draft(&self, draft: &ActivityDraft) -> ValidationResult {
        let mut missing_fields = Vec::new();
        let mut errors = Vec::new();

        let activity_type = draft.activity_type.to_uppercase();

        // Account is always required
        if draft.account_id.is_none() {
            missing_fields.push("account_id".to_string());
        }

        // Validate based on activity type
        match activity_type.as_str() {
            "BUY" | "SELL" => {
                if draft.symbol.is_none() && draft.asset_id.is_none() {
                    missing_fields.push("symbol".to_string());
                }
                if draft.quantity.is_none() {
                    missing_fields.push("quantity".to_string());
                }
                // Either unit_price or amount is required
                if draft.unit_price.is_none() && draft.amount.is_none() {
                    missing_fields.push("unit_price".to_string());
                }
            }
            "DEPOSIT" | "WITHDRAWAL" | "TAX" | "FEE" | "CREDIT" => {
                if draft.amount.is_none() {
                    missing_fields.push("amount".to_string());
                }
            }
            "DIVIDEND" => {
                if draft.symbol.is_none() && draft.asset_id.is_none() {
                    missing_fields.push("symbol".to_string());
                }
                // Either amount or (quantity + unit_price) is required
                if draft.amount.is_none()
                    && (draft.quantity.is_none() || draft.unit_price.is_none())
                {
                    missing_fields.push("amount".to_string());
                }
            }
            "INTEREST" => {
                // Amount is required, symbol is optional
                if draft.amount.is_none()
                    && (draft.quantity.is_none() || draft.unit_price.is_none())
                {
                    missing_fields.push("amount".to_string());
                }
            }
            "SPLIT" => {
                if draft.symbol.is_none() && draft.asset_id.is_none() {
                    missing_fields.push("symbol".to_string());
                }
                if draft.quantity.is_none() {
                    missing_fields.push("quantity".to_string());
                }
            }
            "TRANSFER_IN" | "TRANSFER_OUT" => {
                // Either amount (for cash) or (symbol + quantity) for assets
                if draft.amount.is_none() && draft.symbol.is_none() {
                    missing_fields.push("amount".to_string());
                }
            }
            _ => {}
        }

        // Validate date format
        if chrono::NaiveDate::parse_from_str(&draft.activity_date, "%Y-%m-%d").is_err()
            && chrono::DateTime::parse_from_rfc3339(&draft.activity_date).is_err()
        {
            errors.push(ValidationError {
                field: "activity_date".to_string(),
                message: "Invalid date format. Expected YYYY-MM-DD or ISO 8601".to_string(),
            });
        }

        // Check for custom asset creation
        if draft.is_custom_asset && draft.asset_kind.is_none() {
            missing_fields.push("asset_kind".to_string());
        }

        ValidationResult {
            is_valid: missing_fields.is_empty() && errors.is_empty(),
            missing_fields,
            errors,
        }
    }

    /// Compute amount from quantity and unit_price if not provided.
    fn compute_amount(
        &self,
        quantity: Option<f64>,
        unit_price: Option<f64>,
        fee: Option<f64>,
        provided_amount: Option<f64>,
    ) -> Option<f64> {
        if let Some(amount) = provided_amount {
            return Some(amount);
        }

        match (quantity, unit_price) {
            (Some(qty), Some(price)) => {
                let base = qty * price;
                Some(base + fee.unwrap_or(0.0))
            }
            _ => None,
        }
    }
}

impl<E: AiEnvironment> Clone for RecordActivityTool<E> {
    fn clone(&self) -> Self {
        Self {
            env: self.env.clone(),
        }
    }
}

impl<E: AiEnvironment + 'static> Tool for RecordActivityTool<E> {
    const NAME: &'static str = "record_activity";

    type Error = AiError;
    type Args = RecordActivityArgs;
    type Output = RecordActivityOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Record investment transactions from natural language. Creates a draft preview for user confirmation. Supports all activity types: BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, TRANSFER_IN, TRANSFER_OUT, INTEREST, FEE, SPLIT, TAX, CREDIT, ADJUSTMENT.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "activityType": {
                        "type": "string",
                        "description": "Activity type: BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, TRANSFER_IN, TRANSFER_OUT, INTEREST, FEE, SPLIT, TAX, CREDIT, ADJUSTMENT",
                        "enum": ["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL", "TRANSFER_IN", "TRANSFER_OUT", "INTEREST", "FEE", "SPLIT", "TAX", "CREDIT", "ADJUSTMENT", "UNKNOWN"]
                    },
                    "symbol": {
                        "type": "string",
                        "description": "Symbol or ticker (e.g., 'AAPL', 'BTC', 'VTI'). Required for BUY/SELL/DIVIDEND/SPLIT"
                    },
                    "activityDate": {
                        "type": "string",
                        "description": "ISO 8601 date (e.g., '2026-01-17'). Parse relative dates like 'yesterday' or 'last Monday' to ISO format"
                    },
                    "quantity": {
                        "type": "number",
                        "description": "Number of shares or units. Required for BUY/SELL/SPLIT"
                    },
                    "unitPrice": {
                        "type": "number",
                        "description": "Price per unit. If omitted for BUY/SELL, user will need to provide it"
                    },
                    "amount": {
                        "type": "number",
                        "description": "Total amount. For DEPOSIT/WITHDRAWAL/DIVIDEND or when quantity*price doesn't apply"
                    },
                    "fee": {
                        "type": "number",
                        "description": "Transaction fee (optional)"
                    },
                    "account": {
                        "type": "string",
                        "description": "Account name or ID. If user has multiple accounts and doesn't specify, ask which account"
                    },
                    "subtype": {
                        "type": "string",
                        "description": "Activity subtype for semantic variations: DRIP (dividend reinvested), DIVIDEND_IN_KIND (dividend paid in asset), STAKING_REWARD (crypto staking), BONUS (promotional credit)"
                    },
                    "notes": {
                        "type": "string",
                        "description": "Optional notes for the transaction"
                    }
                },
                "required": ["activityType", "activityDate"]
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        debug!(
            "record_activity called: type={}, symbol={:?}, account={:?}, date={}",
            args.activity_type,
            args.symbol,
            args.account,
            args.activity_date
        );

        // 1. Validate activity type
        let activity_type = self
            .validate_activity_type(&args.activity_type)
            .unwrap_or_else(|| "UNKNOWN".to_string());

        // 2. Get all active accounts
        let accounts = self
            .env
            .account_service()
            .get_active_accounts()
            .map_err(|e| AiError::ToolExecutionFailed(e.to_string()))?;

        debug!("Found {} active accounts", accounts.len());

        let available_accounts: Vec<AccountOption> = accounts
            .iter()
            .map(|a| AccountOption {
                id: a.id.clone(),
                name: a.name.clone(),
                currency: a.currency.clone(),
            })
            .collect();

        // 3. Resolve account
        // Treat empty string as None for auto-selection
        let account_hint = args.account.as_deref().filter(|s| !s.is_empty());
        debug!(
            "Account resolution: hint={:?}, num_accounts={}",
            account_hint,
            accounts.len()
        );
        let (account_id, account_name) = self.resolve_account(account_hint, &accounts);
        debug!(
            "Account resolved: id={:?}, name={:?}",
            account_id,
            account_name
        );

        // Get currency from resolved account, or use base currency as fallback
        let currency = account_id
            .as_ref()
            .and_then(|id| accounts.iter().find(|a| &a.id == id))
            .map(|a| a.currency.clone())
            .unwrap_or_else(|| self.env.base_currency());

        // 4. Handle symbol/asset resolution using quote_service
        let (resolved_asset, asset_id, asset_name, is_custom_asset) = if let Some(symbol) =
            &args.symbol
        {
            // Search for the symbol using quote_service
            let search_results = self
                .env
                .quote_service()
                .search_symbol_with_currency(symbol, Some(&currency))
                .await
                .unwrap_or_default();

            if let Some(top_result) = search_results.first() {
                // Found a match - use the top result
                let asset = ResolvedAsset {
                    asset_id: top_result
                        .existing_asset_id
                        .clone()
                        .unwrap_or_else(|| {
                            // Construct asset ID from symbol and exchange
                            format!(
                                "{}:{}",
                                top_result.symbol,
                                top_result.exchange_mic.as_deref().unwrap_or("UNKNOWN")
                            )
                        }),
                    symbol: top_result.symbol.clone(),
                    name: top_result.long_name.clone(),
                    currency: top_result.currency.clone().unwrap_or_else(|| currency.clone()),
                    exchange: top_result.exchange_name.clone(),
                    exchange_mic: top_result.exchange_mic.clone(),
                };
                (
                    Some(asset.clone()),
                    Some(asset.asset_id.clone()),
                    Some(asset.name.clone()),
                    false,
                )
            } else {
                // No match found - treat as custom asset
                (
                    None,
                    None,
                    Some(symbol.clone()),
                    true, // Mark as custom asset so user can create it
                )
            }
        } else {
            (None, None, None, false)
        };

        // 5. Determine price source
        let price_source = if args.unit_price.is_some() {
            "user"
        } else {
            "none"
        };

        // 6. Compute amount if not provided
        let amount =
            self.compute_amount(args.quantity, args.unit_price, args.fee, args.amount);

        // 7. Build draft
        // Use asset's currency for trading activities, otherwise use account currency
        let draft_currency = resolved_asset
            .as_ref()
            .map(|a| a.currency.clone())
            .unwrap_or(currency);

        let draft = ActivityDraft {
            activity_type: activity_type.clone(),
            activity_date: args.activity_date,
            symbol: args.symbol.clone(),
            asset_id,
            asset_name,
            quantity: args.quantity,
            unit_price: args.unit_price,
            amount,
            fee: args.fee,
            currency: draft_currency,
            account_id,
            account_name,
            subtype: args.subtype,
            notes: args.notes,
            price_source: price_source.to_string(),
            pricing_mode: "MARKET".to_string(),
            is_custom_asset,
            asset_kind: None,
        };

        // 8. Validate the draft
        let validation = self.validate_draft(&draft);

        // 9. Get available subtypes
        let available_subtypes = get_subtypes_for_activity_type(&activity_type);

        Ok(RecordActivityOutput {
            draft,
            validation,
            available_accounts,
            resolved_asset,
            available_subtypes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[tokio::test]
    async fn test_record_activity_buy() {
        let env = Arc::new(MockEnvironment::new());
        let tool = RecordActivityTool::new(env);

        let result = tool
            .call(RecordActivityArgs {
                activity_type: "BUY".to_string(),
                symbol: Some("AAPL".to_string()),
                activity_date: "2026-01-17".to_string(),
                quantity: Some(20.0),
                unit_price: Some(240.0),
                amount: None,
                fee: None,
                account: None,
                subtype: None,
                notes: None,
            })
            .await;

        assert!(result.is_ok());
        let output = result.unwrap();
        assert_eq!(output.draft.activity_type, "BUY");
        assert_eq!(output.draft.symbol, Some("AAPL".to_string()));
        assert_eq!(output.draft.quantity, Some(20.0));
        assert_eq!(output.draft.unit_price, Some(240.0));
        assert_eq!(output.draft.amount, Some(4800.0)); // 20 * 240
        assert_eq!(output.draft.price_source, "user");

        // Should have missing account_id since none provided
        assert!(output.validation.missing_fields.contains(&"account_id".to_string()));
    }

    #[tokio::test]
    async fn test_record_activity_deposit() {
        let env = Arc::new(MockEnvironment::new());
        let tool = RecordActivityTool::new(env);

        let result = tool
            .call(RecordActivityArgs {
                activity_type: "DEPOSIT".to_string(),
                symbol: None,
                activity_date: "2026-01-17".to_string(),
                quantity: None,
                unit_price: None,
                amount: Some(5000.0),
                fee: None,
                account: None,
                subtype: None,
                notes: None,
            })
            .await;

        assert!(result.is_ok());
        let output = result.unwrap();
        assert_eq!(output.draft.activity_type, "DEPOSIT");
        assert_eq!(output.draft.amount, Some(5000.0));
        assert!(output.draft.symbol.is_none());
    }

    #[tokio::test]
    async fn test_record_activity_dividend_with_subtype() {
        let env = Arc::new(MockEnvironment::new());
        let tool = RecordActivityTool::new(env);

        let result = tool
            .call(RecordActivityArgs {
                activity_type: "DIVIDEND".to_string(),
                symbol: Some("VTI".to_string()),
                activity_date: "2026-01-17".to_string(),
                quantity: Some(2.0),
                unit_price: None,
                amount: None,
                fee: None,
                account: None,
                subtype: Some("DRIP".to_string()),
                notes: None,
            })
            .await;

        assert!(result.is_ok());
        let output = result.unwrap();
        assert_eq!(output.draft.activity_type, "DIVIDEND");
        assert_eq!(output.draft.subtype, Some("DRIP".to_string()));

        // Should have subtypes available for DIVIDEND
        assert!(!output.available_subtypes.is_empty());
        assert!(output
            .available_subtypes
            .iter()
            .any(|s| s.value == "DRIP"));
    }

    #[tokio::test]
    async fn test_validate_activity_type() {
        let env = Arc::new(MockEnvironment::new());
        let tool = RecordActivityTool::new(env);

        assert_eq!(
            tool.validate_activity_type("buy"),
            Some("BUY".to_string())
        );
        assert_eq!(
            tool.validate_activity_type("SELL"),
            Some("SELL".to_string())
        );
        assert_eq!(tool.validate_activity_type("invalid"), None);
    }

    #[tokio::test]
    async fn test_get_subtypes_for_activity_type() {
        let subtypes = get_subtypes_for_activity_type("DIVIDEND");
        assert!(subtypes.iter().any(|s| s.value == "DRIP"));
        assert_eq!(subtypes.len(), 1); // Only DRIP

        let subtypes = get_subtypes_for_activity_type("INTEREST");
        assert!(subtypes.iter().any(|s| s.value == "STAKING_REWARD"));

        let subtypes = get_subtypes_for_activity_type("DEPOSIT");
        assert!(subtypes.is_empty());
    }

    #[tokio::test]
    async fn test_compute_amount() {
        let env = Arc::new(MockEnvironment::new());
        let tool = RecordActivityTool::new(env);

        // With quantity and price
        assert_eq!(
            tool.compute_amount(Some(10.0), Some(100.0), None, None),
            Some(1000.0)
        );

        // With fee
        assert_eq!(
            tool.compute_amount(Some(10.0), Some(100.0), Some(5.0), None),
            Some(1005.0)
        );

        // Provided amount takes precedence
        assert_eq!(
            tool.compute_amount(Some(10.0), Some(100.0), None, Some(500.0)),
            Some(500.0)
        );

        // Missing quantity or price
        assert_eq!(tool.compute_amount(Some(10.0), None, None, None), None);
        assert_eq!(tool.compute_amount(None, Some(100.0), None, None), None);
    }
}
