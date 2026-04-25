use chrono::{Datelike, Local, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::portfolio::fire::GlidepathSettings;

/// Default annual draw estimate for defined-contribution income streams that
/// have fund details but no explicit monthly payout.
pub const DEFAULT_DC_PAYOUT_ESTIMATE_RATE: f64 = 0.035;

pub(crate) const FUNDING_TOLERANCE: f64 = 0.999;

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
    pub tax: Option<TaxProfile>,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PersonalProfile {
    #[serde(default)]
    pub birth_year_month: Option<String>,
    pub current_age: u32,
    pub target_retirement_age: u32,
    pub planning_horizon_age: u32,
    pub current_annual_salary: Option<f64>,
    pub salary_growth_rate: Option<f64>,
}

pub fn age_from_birth_year_month(birth_year_month: &str, as_of: NaiveDate) -> Option<u32> {
    let (year, month) = birth_year_month.split_once('-')?;
    let birth_year = year.parse::<i32>().ok()?;
    let birth_month = month.parse::<u32>().ok()?;
    if !(1..=12).contains(&birth_month) || birth_year > as_of.year() {
        return None;
    }

    let mut age = as_of.year() - birth_year;
    if as_of.month() < birth_month {
        age -= 1;
    }
    u32::try_from(age).ok()
}

pub fn normalize_retirement_plan_ages(plan: &mut RetirementPlan) {
    if let Some(age) = plan
        .personal
        .birth_year_month
        .as_deref()
        .and_then(|birth_year_month| {
            age_from_birth_year_month(birth_year_month, Local::now().date_naive())
        })
    {
        plan.personal.current_age = age;
    }
}

#[cfg(test)]
mod tests {
    use super::{age_from_birth_year_month, RetirementPlan};
    use chrono::NaiveDate;

    #[test]
    fn derives_age_from_birth_year_month() {
        let as_of = NaiveDate::from_ymd_opt(2026, 4, 21).unwrap();

        assert_eq!(age_from_birth_year_month("1981-04", as_of), Some(45));
        assert_eq!(age_from_birth_year_month("1981-05", as_of), Some(44));
        assert_eq!(age_from_birth_year_month("1981-13", as_of), None);
    }

    #[test]
    fn old_withdrawal_rule_json_is_ignored() {
        let raw = r#"{
            "personal": {
                "currentAge": 45,
                "targetRetirementAge": 55,
                "planningHorizonAge": 90
            },
            "expenses": { "items": [{ "monthlyAmount": 6000.0 }] },
            "incomeStreams": [],
            "investment": {
                "preRetirementAnnualReturn": 0.057,
                "retirementAnnualReturn": 0.034,
                "annualInvestmentFeeRate": 0.006,
                "annualVolatility": 0.12,
                "inflationRate": 0.02,
                "monthlyContribution": 3000.0,
                "contributionGrowthRate": 0.02,
                "glidePath": null
            },
            "withdrawal": {
                "safeWithdrawalRate": 0.04,
                "strategy": "guardrails",
                "guardrails": { "ceilingRate": 0.06 }
            },
            "tax": null,
            "currency": "CAD"
        }"#;

        let plan: RetirementPlan = serde_json::from_str(raw).expect("old JSON should parse");
        let serialized = serde_json::to_string(&plan).expect("plan should serialize");

        assert_eq!(plan.currency, "CAD");
        assert!(!serialized.contains("withdrawal"));
        assert!(!serialized.contains("safeWithdrawalRate"));
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseBudget {
    #[serde(default)]
    pub items: Vec<ExpenseBucket>,
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
    pub fn all_buckets(&self) -> Vec<(&ExpenseBucket, bool)> {
        self.items
            .iter()
            .map(|bucket| (bucket, bucket.essential.unwrap_or(true)))
            .collect()
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
    /// Net monthly payout in today's money. Tax on portfolio withdrawals is modeled separately.
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
    #[allow(clippy::should_implement_trait)]
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
    /// Until contribution routing exists, these balances also define the tax-bucket mix for
    /// future contributions.
    #[serde(default)]
    pub withdrawal_buckets: TaxBucketBalances,
}
