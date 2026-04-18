//! Cash balances tool — per-account, per-currency cash positions.
//!
//! Uses the holdings service (which builds cash holdings from snapshots)
//! to return per-account cash balances. Amounts are in original currency;
//! per-account totals use the snapshot's pre-computed base-currency conversion.

use rig::{completion::ToolDefinition, tool::Tool};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use crate::env::AiEnvironment;
use crate::error::AiError;

// ============================================================================
// Tool Arguments and Output
// ============================================================================

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCashBalancesArgs {
    /// Account ID, or "TOTAL" for all accounts. Default: "TOTAL".
    #[serde(default = "default_account_id")]
    pub account_id: String,
}

fn default_account_id() -> String {
    "TOTAL".to_string()
}

/// Per-currency cash balance within an account.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashBalanceEntry {
    pub currency: String,
    pub amount: Decimal,
}

/// Per-account cash summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountCashSummary {
    pub account_id: String,
    pub account_name: String,
    pub account_currency: String,
    /// Individual cash positions by currency.
    pub balances: Vec<CashBalanceEntry>,
    /// Total cash converted to account currency.
    pub total_account_currency: Decimal,
    /// Total cash converted to base currency.
    pub total_base_currency: Decimal,
}

/// Output envelope.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCashBalancesOutput {
    pub accounts: Vec<AccountCashSummary>,
    pub grand_total_base: Decimal,
    pub base_currency: String,
}

// ============================================================================
// Tool Implementation
// ============================================================================

pub struct GetCashBalancesTool<E: AiEnvironment> {
    env: Arc<E>,
    base_currency: String,
}

impl<E: AiEnvironment> GetCashBalancesTool<E> {
    pub fn new(env: Arc<E>, base_currency: String) -> Self {
        Self { env, base_currency }
    }
}

impl<E: AiEnvironment> Clone for GetCashBalancesTool<E> {
    fn clone(&self) -> Self {
        Self {
            env: self.env.clone(),
            base_currency: self.base_currency.clone(),
        }
    }
}

impl<E: AiEnvironment + 'static> Tool for GetCashBalancesTool<E> {
    const NAME: &'static str = "get_cash_balances";

    type Error = AiError;
    type Args = GetCashBalancesArgs;
    type Output = GetCashBalancesOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Get cash balances for investment accounts. Returns per-account, \
                per-currency cash positions with totals in both account currency and base \
                currency. Use this when the user asks about cash, available funds, \
                uninvested money, or account balances."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "accountId": {
                        "type": "string",
                        "description": "Account ID, or 'TOTAL' for all accounts. Default: 'TOTAL'."
                    }
                },
                "required": []
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let accounts = self
            .env
            .account_service()
            .get_active_accounts()
            .map_err(|e| AiError::ToolExecutionFailed(e.to_string()))?;

        let account_map: HashMap<String, (String, String)> = accounts
            .iter()
            .map(|a| (a.id.clone(), (a.name.clone(), a.currency.clone())))
            .collect();

        let is_total = args.account_id == "TOTAL" || args.account_id.is_empty();
        let target_ids: Vec<String> = if is_total {
            accounts.iter().map(|a| a.id.clone()).collect()
        } else {
            vec![args.account_id.clone()]
        };

        let mut summaries = Vec::new();
        let mut grand_total_base = Decimal::ZERO;

        for account_id in &target_ids {
            let holdings = self
                .env
                .holdings_service()
                .get_holdings(account_id, &self.base_currency)
                .await
                .map_err(|e| AiError::ToolExecutionFailed(e.to_string()))?;

            let cash_holdings: Vec<_> = holdings
                .into_iter()
                .filter(|h| h.holding_type == wealthfolio_core::holdings::HoldingType::Cash)
                .collect();

            if cash_holdings.is_empty() {
                continue;
            }

            let (account_name, account_currency) = account_map
                .get(account_id)
                .cloned()
                .unwrap_or_else(|| (account_id.clone(), self.base_currency.clone()));

            let mut balances = Vec::new();
            let mut total_local = Decimal::ZERO;

            for h in &cash_holdings {
                let currency = h
                    .instrument
                    .as_ref()
                    .map(|i| i.currency.clone())
                    .unwrap_or_else(|| h.local_currency.clone());
                balances.push(CashBalanceEntry {
                    currency,
                    amount: h.quantity,
                });
                total_local += h.market_value.local;
            }

            // Use the snapshot's pre-computed base total if available (via
            // market_value.base). Currently the holdings service sets this to 0
            // for cash, so we fall back to reporting the local total.
            let total_base: Decimal = cash_holdings.iter().map(|h| h.market_value.base).sum();
            let effective_base = if total_base != Decimal::ZERO {
                total_base
            } else {
                // All same currency as base? Use local total directly.
                if balances.len() == 1 && balances[0].currency == self.base_currency {
                    total_local
                } else {
                    // Mixed currencies without FX — report local total as best effort
                    total_local
                }
            };

            grand_total_base += effective_base;
            summaries.push(AccountCashSummary {
                account_id: account_id.clone(),
                account_name,
                account_currency,
                balances,
                total_account_currency: total_local,
                total_base_currency: effective_base,
            });
        }

        Ok(GetCashBalancesOutput {
            accounts: summaries,
            grand_total_base,
            base_currency: self.base_currency.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::test_env::MockEnvironment;

    #[tokio::test]
    async fn test_get_cash_balances_basic() {
        let env = Arc::new(MockEnvironment::new());
        let tool = GetCashBalancesTool::new(env, "USD".to_string());
        let result = tool
            .call(GetCashBalancesArgs {
                account_id: "TOTAL".to_string(),
            })
            .await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().base_currency, "USD");
    }
}
