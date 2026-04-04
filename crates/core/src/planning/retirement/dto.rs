use serde::{Deserialize, Serialize};

use super::engine::{
    compute_required_capital, project_retirement, project_retirement_with_mode,
    resolve_plan_dc_payouts,
};
use super::model::{RetirementPlan, RetirementStartReason, RetirementTimingMode};
use super::withdrawal::compute_gross_withdrawal;

// ─── Output types ────────────────────────────────────────────────────────────

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annual_taxes: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gross_withdrawal: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FireProjection {
    /// Age when portfolio first reached the FIRE target. None if target was never reached.
    pub fire_age: Option<u32>,
    pub fire_year: Option<u32>,
    /// Age when retirement withdrawals actually begin under the selected timing mode.
    pub retirement_start_age: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retirement_start_reason: Option<RetirementStartReason>,
    pub portfolio_at_fire: f64,
    /// True when retirement withdrawal phase started with portfolio >= required capital.
    pub funded_at_retirement: bool,
    pub coast_fire_amount: f64,
    pub coast_fire_reached: bool,
    pub year_by_year: Vec<YearlySnapshot>,
}

/// Type alias for clarity; `FireProjection` is the canonical name for backward compatibility.
pub type RetirementProjection = FireProjection;

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
    pub funded_at_goal_age: bool,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_age: Option<u32>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_age: Option<u32>,
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
    pub guardrails: MonteCarloResult,
}

// ─── Retirement Overview ────────────────────────────────────────────────────

/// Retirement overview computed from the unified retirement ledger.
///
/// # Semantic definitions
///
/// - `funded_at_goal_age`: The plan reaches financial independence at or before
///   `desired_fire_age`. FI = portfolio >= inflation-adjusted net target at that age.
///
/// - `eventually_reaches_fi`: The plan reaches FI at some age before the planning
///   horizon, even if after the desired age.
///
/// - `portfolio_at_retirement_start`: Portfolio value at the year retirement actually
///   begins. In `fire` mode this matches `fi_age`; in `traditional` mode it can be the
///   target retirement age even when `fi_age` is null.
///
/// - Success (Monte Carlo): Essential spending is funded every year AND portfolio
///   stays above zero at horizon. For `ConstantPercentage` (exploratory): portfolio
///   stays above 5% of retirement-start value.
///
/// - Failure: Any year where essential spending cannot be fully funded, or portfolio
///   hits zero before the horizon.
///
/// - SORR rule: SORR analysis runs only when retirement actually starts. In `fire` mode
///   that requires FI. In `traditional` mode it runs from target retirement age.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetirementOverview {
    pub analysis_mode: String,
    pub status: String, // "on_track", "at_risk", "off_track", "achieved"
    pub desired_fire_age: u32,
    pub fi_age: Option<u32>,
    pub retirement_start_age: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retirement_start_reason: Option<RetirementStartReason>,
    pub funded_at_goal_age: bool,
    pub eventually_reaches_fi: bool,
    pub funded_at_retirement_start: bool,
    pub portfolio_now: f64,
    pub portfolio_at_retirement_start: f64,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub withdrawal_policy: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monthly_housing: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monthly_discretionary: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effective_tax_rate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetStreamItem {
    pub label: String,
    pub monthly_amount: f64,
    pub percentage_of_budget: f64,
}

// ─── Overview builders ──────────────────────────────────────────────────────

/// Plan-aware budget breakdown at the given retirement age.
/// Filters expense buckets by age bounds so only active buckets contribute.
fn compute_budget_breakdown(plan: &RetirementPlan, retirement_age: u32) -> BudgetBreakdown {
    // Helper: is a bucket active at the given age?
    let active = |b: &super::model::ExpenseBucket| -> bool {
        b.start_age.map_or(true, |s| s <= retirement_age)
            && b.end_age.map_or(true, |e| e > retirement_age)
    };

    let monthly_living = if active(&plan.expenses.living) {
        plan.expenses.living.monthly_amount
    } else {
        0.0
    };
    let monthly_healthcare = if active(&plan.expenses.healthcare) {
        plan.expenses.healthcare.monthly_amount
    } else {
        0.0
    };
    let monthly_housing = plan
        .expenses
        .housing
        .as_ref()
        .filter(|b| active(b))
        .map(|b| b.monthly_amount);
    let monthly_discretionary = plan
        .expenses
        .discretionary
        .as_ref()
        .filter(|b| active(b))
        .map(|b| b.monthly_amount);

    let total_monthly_budget = monthly_living
        + monthly_healthcare
        + monthly_housing.unwrap_or(0.0)
        + monthly_discretionary.unwrap_or(0.0);

    let resolved = resolve_plan_dc_payouts(
        &plan.income_streams,
        plan.personal.current_age,
        retirement_age,
        plan.withdrawal.safe_withdrawal_rate,
    );

    let mut income_streams = Vec::new();
    let mut total_income_monthly = 0.0_f64;
    for s in &plan.income_streams {
        if s.start_age <= retirement_age {
            let monthly = resolved
                .get(&s.id)
                .copied()
                .unwrap_or(s.monthly_amount.unwrap_or(0.0));
            total_income_monthly += monthly;
            income_streams.push(BudgetStreamItem {
                label: s.label.clone(),
                monthly_amount: monthly,
                percentage_of_budget: if total_monthly_budget > 0.0 {
                    monthly / total_monthly_budget
                } else {
                    0.0
                },
            });
        }
    }

    // Portfolio withdrawal is gross (includes tax drag)
    let net_gap_annual = (total_monthly_budget - total_income_monthly).max(0.0) * 12.0;
    let (gross_gap_annual, tax_gap_annual) =
        compute_gross_withdrawal(net_gap_annual, &plan.tax, retirement_age);
    let monthly_portfolio_withdrawal = gross_gap_annual / 12.0;
    let effective_tax_rate = if gross_gap_annual > 0.0 {
        Some((tax_gap_annual / gross_gap_annual).clamp(0.0, 0.99))
    } else if plan.tax.is_some() {
        Some(0.0)
    } else {
        None
    };

    BudgetBreakdown {
        total_monthly_budget,
        monthly_living_expenses: monthly_living,
        monthly_healthcare,
        monthly_portfolio_withdrawal,
        income_streams,
        monthly_housing,
        monthly_discretionary,
        effective_tax_rate,
    }
}

/// Plan-aware trajectory builder.
fn build_trajectory(
    year_by_year: &[YearlySnapshot],
    plan: &RetirementPlan,
    _net_target: f64,
) -> Vec<RetirementTrajectoryPoint> {
    let goal_age = plan.personal.target_retirement_age;
    let r = plan.investment.expected_annual_return;

    // Target at goal age: schedule-based capital needed when retirement starts.
    let target_at_goal = compute_required_capital(plan, goal_age);

    // Pre-retirement: smooth growth curve from today's PV of the goal-age target
    // (what the portfolio needs to be on track at each age).
    // Post-retirement: declining required capital (fewer years left to fund), reaching 0 at horizon.
    let required_capitals: Vec<f64> = year_by_year
        .iter()
        .map(|snap| {
            if snap.age <= goal_age {
                // Accumulation: PV of the goal-age target discounted back from goal_age to snap.age
                let years_to_goal = (goal_age as i32 - snap.age as i32).max(0);
                target_at_goal / (1.0 + r).powi(years_to_goal)
            } else {
                // Retirement: what you still need at this age to fund remaining years
                compute_required_capital(plan, snap.age)
            }
        })
        .collect();

    year_by_year
        .iter()
        .enumerate()
        .map(|(idx, snap)| {
            let portfolio_end = if idx + 1 < year_by_year.len() {
                year_by_year[idx + 1].portfolio_value
            } else {
                snap.portfolio_value
            };

            RetirementTrajectoryPoint {
                age: snap.age,
                year: snap.year,
                phase: snap.phase.clone(),
                portfolio_start: snap.portfolio_value,
                annual_contribution: snap.annual_contribution,
                annual_income: snap.annual_income,
                annual_expenses: snap.annual_withdrawal,
                net_withdrawal_from_portfolio: snap.net_withdrawal_from_portfolio,
                portfolio_end,
                required_capital: required_capitals[idx],
                pension_assets: snap.pension_assets,
            }
        })
        .collect()
}

/// Plan-aware bisection solver: finds how much additional monthly contribution is needed
/// so the projected portfolio at `target_retirement_age` reaches `required_capital`.
fn solve_required_additional_monthly(
    plan: &RetirementPlan,
    current_portfolio: f64,
    required_capital: f64,
) -> f64 {
    let mut lo = 0.0_f64;
    let mut hi = required_capital / 12.0;
    for _ in 0..50 {
        let mid = (lo + hi) / 2.0;
        let mut adjusted = plan.clone();
        adjusted.investment.monthly_contribution += mid;
        let proj = project_retirement(&adjusted, current_portfolio);
        let portfolio_at_goal = proj
            .year_by_year
            .iter()
            .find(|s| s.age == plan.personal.target_retirement_age)
            .map(|s| s.portfolio_value)
            .unwrap_or(0.0);
        if portfolio_at_goal >= required_capital {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    (lo + hi) / 2.0
}

/// Scan accumulation-only (no forced retirement) to find the earliest age at which
/// FI would be reached if the user delays retirement.
fn find_fi_age_accumulation_only(plan: &RetirementPlan, current_portfolio: f64) -> Option<u32> {
    let current_age = plan.personal.current_age;
    let horizon = plan.personal.planning_horizon_age;
    let contrib_growth = plan
        .personal
        .salary_growth_rate
        .unwrap_or(plan.investment.contribution_growth_rate);
    let r = plan.investment.expected_annual_return;

    let mut portfolio = current_portfolio;
    for i in 0..=(horizon as i32 - current_age as i32).max(0) as u32 {
        let age = current_age + i;
        let required = compute_required_capital(plan, age);
        if portfolio >= required {
            return Some(age);
        }
        let annual_contribution =
            plan.investment.monthly_contribution * 12.0 * (1.0 + contrib_growth).powi(i as i32);
        portfolio = portfolio * (1.0 + r) + annual_contribution;
    }
    None
}

pub fn compute_retirement_overview(
    plan: &RetirementPlan,
    current_portfolio: f64,
    analysis_mode: &str,
) -> RetirementOverview {
    compute_retirement_overview_with_mode(
        plan,
        current_portfolio,
        RetirementTimingMode::from_str(analysis_mode),
    )
}

pub fn compute_retirement_overview_with_mode(
    plan: &RetirementPlan,
    current_portfolio: f64,
    mode: RetirementTimingMode,
) -> RetirementOverview {
    let gross_target: f64 = plan
        .expenses
        .all_buckets()
        .iter()
        .map(|(b, _)| b.monthly_amount)
        .sum::<f64>()
        * 12.0
        / plan.withdrawal.safe_withdrawal_rate;

    // Schedule-based targets
    let net_target_today = compute_required_capital(plan, plan.personal.current_age);
    let required_capital = compute_required_capital(plan, plan.personal.target_retirement_age);
    let coast = {
        let years = plan.personal.target_retirement_age as i32 - plan.personal.current_age as i32;
        if years <= 0 {
            required_capital
        } else {
            required_capital / (1.0 + plan.investment.expected_annual_return).powi(years)
        }
    };
    let projection = project_retirement_with_mode(plan, current_portfolio, mode);

    let fi_age = projection.fire_age;
    let funded_at_goal_age = fi_age.map_or(false, |a| a <= plan.personal.target_retirement_age);

    let retirement_start_age = projection.retirement_start_age;
    let portfolio_at_retirement_start = projection
        .retirement_start_age
        .and_then(|age| {
            projection
                .year_by_year
                .iter()
                .find(|s| s.age == age)
                .map(|s| s.portfolio_value)
        })
        .unwrap_or(0.0);

    let portfolio_at_goal = projection
        .year_by_year
        .iter()
        .find(|s| s.age == plan.personal.target_retirement_age)
        .map(|s| s.portfolio_value)
        .unwrap_or(0.0);

    let shortfall = (required_capital - portfolio_at_goal).max(0.0);
    let surplus = (portfolio_at_goal - required_capital).max(0.0);

    let required_additional = if shortfall > 0.0 {
        solve_required_additional_monthly(plan, current_portfolio, required_capital)
    } else {
        0.0
    };

    // If not funded at goal age, find the earliest age at which FI would be reached
    // by scanning accumulation-only (no forced retirement).
    let suggested_age = if !funded_at_goal_age {
        find_fi_age_accumulation_only(plan, current_portfolio)
    } else {
        None
    };
    let effective_fi_age = fi_age.or(suggested_age);
    let eventually_reaches_fi = effective_fi_age.is_some();

    let status = if current_portfolio >= net_target_today {
        "achieved"
    } else if effective_fi_age.map_or(false, |a| a <= plan.personal.target_retirement_age) {
        "on_track"
    } else if effective_fi_age.map_or(false, |a| a <= plan.personal.target_retirement_age + 3) {
        "at_risk"
    } else {
        "off_track"
    };

    let progress = if net_target_today > 0.0 {
        (current_portfolio / net_target_today).min(1.0)
    } else {
        0.0
    };

    let fire_age_for_budget = retirement_start_age.unwrap_or(plan.personal.target_retirement_age);
    let budget = compute_budget_breakdown(plan, fire_age_for_budget);

    let trajectory = build_trajectory(&projection.year_by_year, plan, net_target_today);

    RetirementOverview {
        analysis_mode: mode.as_str().to_string(),
        status: status.to_string(),
        desired_fire_age: plan.personal.target_retirement_age,
        fi_age,
        retirement_start_age,
        retirement_start_reason: projection.retirement_start_reason,
        funded_at_goal_age,
        eventually_reaches_fi,
        funded_at_retirement_start: projection.funded_at_retirement,
        portfolio_now: current_portfolio,
        portfolio_at_retirement_start,
        net_fire_target: net_target_today,
        gross_fire_target: gross_target,
        portfolio_at_goal_age: portfolio_at_goal,
        required_capital_at_goal_age: required_capital,
        shortfall_at_goal_age: shortfall,
        surplus_at_goal_age: surplus,
        required_additional_monthly_contribution: required_additional,
        suggested_goal_age_if_unchanged: suggested_age,
        coast_amount_today: coast,
        coast_reached: current_portfolio >= coast,
        progress,
        budget_breakdown: budget,
        trajectory,
        withdrawal_policy: Some(match plan.withdrawal.strategy {
            super::model::WithdrawalPolicy::ConstantDollar => "constant-dollar".to_string(),
            super::model::WithdrawalPolicy::Guardrails => "guardrails".to_string(),
            super::model::WithdrawalPolicy::ConstantPercentage => {
                "constant-percentage-exploratory".to_string()
            }
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::planning::retirement::*;
    use std::collections::HashMap;

    fn base_plan() -> RetirementPlan {
        RetirementPlan {
            personal: PersonalProfile {
                current_age: 35,
                target_retirement_age: 55,
                planning_horizon_age: 90,
                current_annual_salary: None,
                salary_growth_rate: None,
            },
            expenses: ExpenseBudget {
                living: ExpenseBucket {
                    monthly_amount: 3_000.0,
                    inflation_rate: None,
                    start_age: None,
                    end_age: None,
                    essential: None,
                },
                healthcare: ExpenseBucket {
                    monthly_amount: 0.0,
                    inflation_rate: None,
                    start_age: None,
                    end_age: None,
                    essential: None,
                },
                housing: None,
                discretionary: None,
            },
            income_streams: vec![],
            investment: InvestmentAssumptions {
                expected_annual_return: 0.07,
                expected_return_std_dev: 0.12,
                inflation_rate: 0.02,
                monthly_contribution: 2_000.0,
                contribution_growth_rate: 0.0,
                glide_path: None,
                target_allocations: HashMap::new(),
            },
            withdrawal: WithdrawalConfig {
                safe_withdrawal_rate: 0.04,
                strategy: WithdrawalPolicy::ConstantDollar,
                guardrails: None,
            },
            tax: None,
            currency: "EUR".to_string(),
        }
    }

    #[test]
    fn overview_underfunded_at_goal_age_suggests_later() {
        // Low contribution -> FI not reached by target age.
        // suggested_goal_age_if_unchanged should indicate a later achievable age.
        let mut p = base_plan();
        p.investment.monthly_contribution = 500.0;
        p.personal.target_retirement_age = 45;
        let overview = compute_retirement_overview(&p, 50_000.0, "fire");

        assert!(
            !overview.funded_at_goal_age,
            "should not be funded at goal age with low contributions",
        );
        // Accumulation-only scan should find a later achievable age before the horizon.
        assert!(overview.eventually_reaches_fi);
        assert!(
            overview.suggested_goal_age_if_unchanged.is_some(),
            "should suggest a later goal age",
        );
        assert!(
            overview.suggested_goal_age_if_unchanged.unwrap() > 45,
            "suggested age {} should be after target 45",
            overview.suggested_goal_age_if_unchanged.unwrap(),
        );
    }

    #[test]
    fn overview_never_reaches_fi() {
        // Very high expenses, tiny contribution -> never FI
        let mut p = base_plan();
        p.expenses.living.monthly_amount = 50_000.0;
        p.investment.monthly_contribution = 100.0;
        let overview = compute_retirement_overview(&p, 1_000.0, "fire");

        assert!(!overview.eventually_reaches_fi);
        assert!(overview.fi_age.is_none());
        assert!(!overview.funded_at_goal_age);
    }

    #[test]
    fn portfolio_at_retirement_start_matches_fi_age() {
        let p = base_plan();
        let overview = compute_retirement_overview(&p, 100_000.0, "fire");

        if let Some(fi_age) = overview.fi_age {
            let projection = project_retirement(&p, 100_000.0);
            let snap_at_fi = projection
                .year_by_year
                .iter()
                .find(|snap| snap.age == fi_age)
                .expect("snapshot at fi_age must exist");
            assert!(
                (overview.portfolio_at_retirement_start - snap_at_fi.portfolio_value).abs() < 0.01,
                "portfolio_at_retirement_start ({}) should match snapshot at fi_age ({}) = {}",
                overview.portfolio_at_retirement_start,
                fi_age,
                snap_at_fi.portfolio_value,
            );
        }
    }

    #[test]
    fn funded_at_goal_age_true_when_fi_on_time() {
        let p = base_plan();
        let overview = compute_retirement_overview(&p, 100_000.0, "fire");

        if let Some(fi_age) = overview.fi_age {
            if fi_age <= p.personal.target_retirement_age {
                assert!(overview.funded_at_goal_age);
            }
        }
    }

    #[test]
    fn constant_percentage_labeled_exploratory() {
        let mut plan = base_plan();
        plan.withdrawal.strategy = WithdrawalPolicy::ConstantPercentage;
        let overview = compute_retirement_overview(&plan, 100_000.0, "fire");
        assert_eq!(
            overview.withdrawal_policy,
            Some("constant-percentage-exploratory".to_string()),
        );
    }

    #[test]
    fn required_capital_declines_over_retirement() {
        let p = base_plan();
        let overview = compute_retirement_overview(&p, 100_000.0, "fire");
        let fire_start = overview.trajectory.iter().position(|pt| pt.phase == "fire");
        if let Some(idx) = fire_start {
            // Required capital should be positive during retirement
            assert!(
                overview.trajectory[idx].required_capital > 0.0,
                "retirement year should have non-zero required capital",
            );
            // Required capital should decline as fewer years remain
            let last = overview.trajectory.last().unwrap();
            assert!(
                last.required_capital < overview.trajectory[idx].required_capital,
                "required capital at horizon ({}) should be less than at retirement ({})",
                last.required_capital,
                overview.trajectory[idx].required_capital,
            );
        }
    }
}
