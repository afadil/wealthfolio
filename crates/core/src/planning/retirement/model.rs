use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::portfolio::fire::GlidepathSettings;

fn default_pre_retirement_annual_return() -> f64 {
    0.0577
}

fn default_retirement_annual_return() -> f64 {
    0.0337
}

fn default_annual_investment_fee_rate() -> f64 {
    0.006
}

fn default_annual_volatility() -> f64 {
    0.12
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RetirementPlan {
    pub personal: PersonalProfile,
    pub expenses: ExpenseBudget,
    pub income_streams: Vec<RetirementIncomeStream>,
    pub investment: InvestmentAssumptions,
    pub withdrawal: WithdrawalConfig,
    pub tax: Option<TaxProfile>,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PersonalProfile {
    pub current_age: u32,
    pub target_retirement_age: u32,
    pub planning_horizon_age: u32,
    pub current_annual_salary: Option<f64>,
    pub salary_growth_rate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseBudget {
    pub living: ExpenseBucket,
    pub healthcare: ExpenseBucket,
    pub housing: Option<ExpenseBucket>,
    pub discretionary: Option<ExpenseBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseBucket {
    pub monthly_amount: f64,
    pub inflation_rate: Option<f64>,
    pub start_age: Option<u32>,
    pub end_age: Option<u32>,
    pub essential: Option<bool>,
}

impl ExpenseBudget {
    /// Returns all buckets with their essential flag.
    /// Living and healthcare default to essential=true; housing and discretionary default to false.
    pub fn all_buckets(&self) -> Vec<(&ExpenseBucket, bool)> {
        let mut out = vec![
            (&self.living, self.living.essential.unwrap_or(true)),
            (&self.healthcare, self.healthcare.essential.unwrap_or(true)),
        ];
        if let Some(ref h) = self.housing {
            out.push((h, h.essential.unwrap_or(false)));
        }
        if let Some(ref d) = self.discretionary {
            out.push((d, d.essential.unwrap_or(false)));
        }
        out
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RetirementIncomeStream {
    pub id: String,
    pub label: String,
    pub stream_type: StreamKind,
    pub start_age: u32,
    pub adjust_for_inflation: bool,
    pub annual_growth_rate: Option<f64>,
    pub monthly_amount: Option<f64>,
    pub linked_account_id: Option<String>,
    pub current_value: Option<f64>,
    pub monthly_contribution: Option<f64>,
    pub accumulation_return: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum StreamKind {
    #[serde(rename = "db")]
    DefinedBenefit,
    #[serde(rename = "dc")]
    DefinedContribution,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentAssumptions {
    #[serde(
        alias = "expectedAnnualReturn",
        default = "default_pre_retirement_annual_return"
    )]
    pub pre_retirement_annual_return: f64,
    #[serde(default = "default_retirement_annual_return")]
    pub retirement_annual_return: f64,
    #[serde(default = "default_annual_investment_fee_rate")]
    pub annual_investment_fee_rate: f64,
    #[serde(alias = "expectedReturnStdDev", default = "default_annual_volatility")]
    pub annual_volatility: f64,
    pub inflation_rate: f64,
    pub monthly_contribution: f64,
    pub contribution_growth_rate: f64,
    pub glide_path: Option<GlidepathSettings>,
    pub target_allocations: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GuardrailsConfig {
    /// Cut spending when gross_withdrawal / portfolio exceeds this rate.
    pub ceiling_rate: f64,
    /// Raise spending when gross_withdrawal / portfolio falls below this rate.
    pub floor_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WithdrawalConfig {
    pub safe_withdrawal_rate: f64,
    pub strategy: WithdrawalPolicy,
    pub guardrails: Option<GuardrailsConfig>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum WithdrawalPolicy {
    #[default]
    #[serde(rename = "constant-dollar")]
    ConstantDollar,
    #[serde(rename = "constant-percentage")]
    ConstantPercentage,
    #[serde(rename = "guardrails")]
    Guardrails,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
pub enum RetirementTimingMode {
    #[default]
    #[serde(rename = "fire")]
    Fire,
    #[serde(rename = "traditional")]
    Traditional,
}

impl RetirementTimingMode {
    pub fn from_str(value: &str) -> Self {
        match value {
            "traditional" => Self::Traditional,
            _ => Self::Fire,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fire => "fire",
            Self::Traditional => "traditional",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RetirementStartReason {
    #[serde(rename = "funded")]
    Funded,
    #[serde(rename = "target_age_forced")]
    TargetAgeForced,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaxBucketBalances {
    pub taxable: f64,
    pub tax_deferred: f64,
    pub tax_free: f64,
}

impl TaxBucketBalances {
    pub fn total(&self) -> f64 {
        self.taxable + self.tax_deferred + self.tax_free
    }

    pub fn scale_to_total(&self, total: f64) -> Self {
        let source_total = self.total();
        if total <= 0.0 {
            return Self::default();
        }
        if source_total <= 0.0 {
            return Self {
                taxable: total,
                tax_deferred: 0.0,
                tax_free: 0.0,
            };
        }
        let scale = total / source_total;
        Self {
            taxable: self.taxable * scale,
            tax_deferred: self.tax_deferred * scale,
            tax_free: self.tax_free * scale,
        }
    }
}

/// Simple effective-tax model with optional bucket balances for retirement-only
/// withdrawal ordering. Missing balances fall back to "all taxable".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaxProfile {
    /// Effective rate applied to taxable-account withdrawals (0.0–1.0).
    pub taxable_withdrawal_rate: f64,
    /// Effective rate applied to tax-deferred-account withdrawals (0.0–1.0).
    pub tax_deferred_withdrawal_rate: f64,
    /// Effective rate applied to tax-free-account withdrawals (typically 0.0).
    pub tax_free_withdrawal_rate: f64,
    /// Penalty rate on withdrawals before `early_withdrawal_penalty_age`.
    pub early_withdrawal_penalty_rate: Option<f64>,
    /// Age at which early-withdrawal penalty no longer applies.
    pub early_withdrawal_penalty_age: Option<u32>,
    /// Country code for future locale-specific presets.
    pub country_code: Option<String>,
    /// Retirement-only spendable balances by tax bucket.
    #[serde(default)]
    pub withdrawal_buckets: TaxBucketBalances,
}
