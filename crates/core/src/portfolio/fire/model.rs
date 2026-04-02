use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum WithdrawalStrategy {
    #[default]
    #[serde(rename = "constant-dollar")]
    ConstantDollar,
    #[serde(rename = "constant-percentage")]
    ConstantPercentage,
}

/// Whether the stream's payout amount is entered manually or derived from an accumulated balance.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum StreamType {
    /// Defined-benefit: user enters `monthly_amount` directly (default, backward-compat).
    #[serde(rename = "db")]
    DefinedBenefit,
    /// Defined-contribution: payout is derived as `balance_at_start_age × swr / 12`.
    #[serde(rename = "dc")]
    DefinedContribution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeStream {
    pub id: String,
    pub label: String,
    /// For DB streams: the manual monthly payout. For DC streams, ignored — payout is derived.
    pub monthly_amount: f64,
    pub start_age: u32,
    pub start_age_is_auto: Option<bool>,
    pub adjust_for_inflation: bool,
    pub annual_growth_rate: Option<f64>,
    pub linked_account_id: Option<String>,
    pub current_value: Option<f64>,
    pub monthly_contribution: Option<f64>,
    pub accumulation_return: Option<f64>,
    /// None = DefinedBenefit (backward-compatible default).
    #[serde(default)]
    pub stream_type: Option<StreamType>,
}

/// Gradual shift from equities to bonds during the withdrawal phase to reduce SORR.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlidepathSettings {
    pub enabled: bool,
    /// Expected annual return for the bond portion (e.g. 0.03 = 3 %).
    pub bond_return_rate: f64,
    /// Fraction held in bonds at the FIRE date (e.g. 0.2 = 20 %).
    pub bond_allocation_at_fire: f64,
    /// Fraction held in bonds at the planning horizon (e.g. 0.5 = 50 %).
    pub bond_allocation_at_horizon: f64,
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
    #[serde(default)]
    pub linked_goal_id: Option<String>,
    /// Monthly healthcare cost at FIRE in today's money (on top of monthly_expenses_at_fire).
    #[serde(default)]
    pub healthcare_monthly_at_fire: Option<f64>,
    /// Annual inflation rate for healthcare costs. Defaults to inflation_rate when None.
    #[serde(default)]
    pub healthcare_inflation_rate: Option<f64>,
    /// Glide-path settings for bond allocation shift during retirement.
    #[serde(default)]
    pub glide_path: Option<GlidepathSettings>,
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
    /// Age when portfolio first reached the FIRE target. None if target was never reached.
    pub fire_age: Option<u32>,
    pub fire_year: Option<u32>,
    pub portfolio_at_fire: f64,
    /// True when retirement withdrawal phase started with portfolio >= FIRE target.
    /// False means retirement was triggered by target_fire_age, not by financial independence.
    pub funded_at_retirement: bool,
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
    /// Median age at which FI target was reached across simulations. None if fewer than 50% of
    /// simulations reached the target before the planning horizon.
    pub median_fire_age: Option<u32>,
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

// ─── Retirement Overview ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetirementOverview {
    pub analysis_mode: String,
    pub status: String, // "on_track", "at_risk", "off_track", "achieved"
    pub desired_fire_age: u32,
    pub fi_age: Option<u32>,
    pub funded_at_goal_age: bool,
    pub portfolio_now: f64,
    pub net_fire_target: f64,
    pub gross_fire_target: f64,
    pub portfolio_at_goal_age: f64,
    pub required_capital_at_goal_age: f64,
    pub shortfall_at_goal_age: f64,
    pub surplus_at_goal_age: f64,
    pub required_additional_monthly_contribution: f64,
    pub suggested_goal_age_if_unchanged: Option<u32>,
    pub coast_amount_today: f64,
    pub coast_reached: bool,
    pub progress: f64, // 0.0 to 1.0
    pub budget_breakdown: BudgetBreakdown,
    pub trajectory: Vec<RetirementTrajectoryPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetirementTrajectoryPoint {
    pub age: u32,
    pub year: u32,
    pub phase: String,
    pub portfolio_start: f64,
    pub annual_contribution: f64,
    pub annual_income: f64,
    pub annual_expenses: f64,
    pub net_withdrawal_from_portfolio: f64,
    pub portfolio_end: f64,
    pub required_capital: f64,
    pub pension_assets: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetBreakdown {
    pub total_monthly_budget: f64,
    pub monthly_living_expenses: f64,
    pub monthly_healthcare: f64,
    pub monthly_portfolio_withdrawal: f64,
    pub income_streams: Vec<BudgetStreamItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetStreamItem {
    pub label: String,
    pub monthly_amount: f64,
    pub percentage_of_budget: f64,
}
