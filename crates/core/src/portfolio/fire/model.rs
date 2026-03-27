use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WithdrawalStrategy {
    #[serde(rename = "constant-dollar")]
    ConstantDollar,
    #[serde(rename = "constant-percentage")]
    ConstantPercentage,
}

impl Default for WithdrawalStrategy {
    fn default() -> Self {
        Self::ConstantDollar
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeStream {
    pub id: String,
    pub label: String,
    pub monthly_amount: f64,
    pub start_age: u32,
    pub start_age_is_auto: Option<bool>,
    pub adjust_for_inflation: bool,
    pub annual_growth_rate: Option<f64>,
    pub linked_account_id: Option<String>,
    pub current_value: Option<f64>,
    pub monthly_contribution: Option<f64>,
    pub accumulation_return: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FireSettings {
    pub monthly_expenses_at_fire: f64,
    pub safe_withdrawal_rate: f64,
    #[serde(default)]
    pub withdrawal_strategy: WithdrawalStrategy,
    pub expected_annual_return: f64,
    pub expected_return_std_dev: f64,
    pub inflation_rate: f64,
    pub current_age: u32,
    pub target_fire_age: u32,
    pub monthly_contribution: f64,
    pub contribution_growth_rate: f64,
    pub current_annual_salary: Option<f64>,
    pub salary_growth_rate: Option<f64>,
    pub additional_income_streams: Vec<IncomeStream>,
    pub planning_horizon_age: u32,
    pub included_account_ids: Option<Vec<String>>,
    pub target_allocations: HashMap<String, f64>,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YearlySnapshot {
    pub age: u32,
    pub year: u32,
    pub phase: String,
    pub portfolio_value: f64,
    pub annual_contribution: f64,
    pub annual_withdrawal: f64,
    pub annual_income: f64,
    pub net_withdrawal_from_portfolio: f64,
    pub pension_assets: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FireProjection {
    pub fire_age: Option<u32>,
    pub fire_year: Option<u32>,
    pub portfolio_at_fire: f64,
    pub coast_fire_amount: f64,
    pub coast_fire_reached: bool,
    pub year_by_year: Vec<YearlySnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PercentilePaths {
    pub p10: Vec<f64>,
    pub p25: Vec<f64>,
    pub p50: Vec<f64>,
    pub p75: Vec<f64>,
    pub p90: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalPortfolioPercentiles {
    pub p10: f64,
    pub p25: f64,
    pub p50: f64,
    pub p75: f64,
    pub p90: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonteCarloResult {
    pub success_rate: f64,
    pub median_fire_age: u32,
    pub percentiles: PercentilePaths,
    pub age_axis: Vec<u32>,
    pub final_portfolio_at_horizon: FinalPortfolioPercentiles,
    pub n_simulations: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioResult {
    pub label: String,
    pub annual_return: f64,
    pub fire_age: Option<u32>,
    pub portfolio_at_horizon: f64,
    pub year_by_year: Vec<YearlySnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SorrScenario {
    pub label: String,
    pub returns: Vec<f64>,
    pub portfolio_path: Vec<f64>,
    pub final_value: f64,
    pub survived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitivityMatrix {
    pub contribution_rows: Vec<f64>,
    pub return_columns: Vec<f64>,
    pub fire_ages: Vec<Vec<Option<u32>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitivitySwrMatrix {
    pub swr_rows: Vec<f64>,
    pub return_columns: Vec<f64>,
    pub fire_ages: Vec<Vec<Option<u32>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitivityResult {
    pub contribution: SensitivityMatrix,
    pub swr: SensitivitySwrMatrix,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyComparisonResult {
    pub constant_dollar: MonteCarloResult,
    pub constant_percentage: MonteCarloResult,
}
