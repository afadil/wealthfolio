use std::collections::HashMap;

use chrono::Datelike;
use rand::Rng;
use rand_distr::{Distribution, Normal};

use super::model::*;
use super::withdrawal::{
    add_contribution, apply_growth, apply_withdrawal_policy, initial_withdrawal_buckets,
};
use crate::portfolio::fire::GlidepathSettings;

// Re-export output types used by this module's public API
use super::dto::{FireProjection, YearlySnapshot};

// ─── Stochastic helpers ─────────────────────────────────────────────────────

/// Two-regime fat-tailed return distribution using the ziggurat algorithm (rand_distr).
/// 85% normal years: mu+1.5%, sigma*0.8 -- 15% stress years: mu-8.5%, sigma*1.8
/// Long-run mean preserved: 0.85*(mu+0.015) + 0.15*(mu-0.085) = mu
/// NOTE: the mixture variance is higher than sigma^2 by design -- this is the fat-tail effect.
/// A user-entered sigma=12% will produce a wider fan than a single-normal model with sigma=12%.
pub(crate) fn sample_return<R: Rng>(rng: &mut R, mean: f64, std: f64) -> f64 {
    if rng.gen::<f64>() < 0.15 {
        Normal::new(mean - 0.085, std * 1.8).unwrap().sample(rng)
    } else {
        Normal::new(mean + 0.015, std * 0.8).unwrap().sample(rng)
    }
}

pub(crate) fn sample_inflation<R: Rng>(rng: &mut R, mean: f64) -> f64 {
    Normal::new(mean, 0.01).unwrap().sample(rng)
}

/// MC-closure-safe version of blended return params that works with owned primitives.
pub(crate) fn blended_return_params_mc(
    accumulation_mean: f64,
    retirement_mean: f64,
    base_std: f64,
    annual_fee_rate: f64,
    current_age: u32,
    retirement_start_age: u32,
    planning_horizon_age: u32,
    gp: Option<&GlidepathSettings>,
    i: u32,
    in_fire: bool,
) -> (f64, f64) {
    if !in_fire {
        return (accumulation_mean, base_std);
    }

    let gp = match gp {
        Some(gp) if gp.enabled => gp,
        _ => return (retirement_mean, base_std),
    };
    let years_to_fire = (retirement_start_age as i32 - current_age as i32).max(0) as f64;
    let years_in_retirement =
        (planning_horizon_age as i32 - retirement_start_age as i32).max(1) as f64;
    let years_from_fire = (i as f64 - years_to_fire).max(0.0);
    let t = (years_from_fire / years_in_retirement).clamp(0.0, 1.0);
    let bond_pct = (gp.bond_allocation_at_fire
        + t * (gp.bond_allocation_at_horizon - gp.bond_allocation_at_fire))
        .clamp(0.0, 1.0);
    let stock_pct = 1.0 - bond_pct;
    let bond_mean = net_annual_return(gp.bond_return_rate, annual_fee_rate);
    (
        stock_pct * retirement_mean + bond_pct * bond_mean,
        stock_pct * base_std,
    )
}

pub(crate) fn percentile(sorted: &[f64], p: f64) -> f64 {
    let idx = (sorted.len() as f64 * p).floor() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

pub(crate) fn net_annual_return(gross_return: f64, annual_fee_rate: f64) -> f64 {
    (gross_return - annual_fee_rate).max(-0.99)
}

pub(crate) fn plan_accumulation_return(plan: &RetirementPlan) -> f64 {
    net_annual_return(
        plan.investment.pre_retirement_annual_return,
        plan.investment.annual_investment_fee_rate,
    )
}

pub(crate) fn plan_retirement_return(plan: &RetirementPlan) -> f64 {
    net_annual_return(
        plan.investment.retirement_annual_return,
        plan.investment.annual_investment_fee_rate,
    )
}

// ─── Expense & income helpers ────────────────────────────────────────────────

/// Compute total annual expenses from expense buckets at a given simulation year.
/// Returns `(total_expenses, essential_expenses)`.
pub(crate) fn annual_expenses_at_year(
    budget: &ExpenseBudget,
    age: u32,
    years_from_now: u32,
    general_inflation: f64,
) -> (f64, f64) {
    let mut total = 0.0;
    let mut essential = 0.0;
    for (bucket, is_essential) in budget.all_buckets() {
        // Check age bounds
        if let Some(start) = bucket.start_age {
            if age < start {
                continue;
            }
        }
        if let Some(end) = bucket.end_age {
            if age >= end {
                continue;
            }
        }
        let rate = bucket.inflation_rate.unwrap_or(general_inflation);
        let annual = bucket.monthly_amount * 12.0 * (1.0 + rate).powi(years_from_now as i32);
        total += annual;
        if is_essential {
            essential += annual;
        }
    }
    (total, essential)
}

/// Like `annual_expenses_at_year` but uses a stochastic cumulative inflation factor
/// for buckets that have no custom `inflation_rate`, and deterministic `(1+rate)^years`
/// for buckets with an explicit rate (e.g. healthcare). This matches the old MC behaviour
/// where living expenses tracked the stochastic path and healthcare used its own rate.
pub(crate) fn annual_expenses_at_year_stochastic(
    budget: &ExpenseBudget,
    age: u32,
    years_from_now: u32,
    _general_inflation: f64,
    cumulative_inflation: f64,
) -> (f64, f64) {
    let mut total = 0.0;
    let mut essential = 0.0;
    for (bucket, is_essential) in budget.all_buckets() {
        if let Some(start) = bucket.start_age {
            if age < start {
                continue;
            }
        }
        if let Some(end) = bucket.end_age {
            if age >= end {
                continue;
            }
        }
        let annual = match bucket.inflation_rate {
            Some(rate) => {
                // Custom inflation rate: deterministic
                bucket.monthly_amount * 12.0 * (1.0 + rate).powi(years_from_now as i32)
            }
            None => {
                // General inflation: use stochastic cumulative factor
                bucket.monthly_amount * 12.0 * cumulative_inflation
            }
        };
        total += annual;
        if is_essential {
            essential += annual;
        }
    }
    (total, essential)
}

/// Like `plan_income_at_age` but accepts an optional stochastic `cumulative_inflation`
/// factor for inflation-indexed streams. When `cumulative_inflation` is `Some`, those
/// streams use the stochastic factor instead of `(1+rate)^years`.
pub(crate) fn plan_income_at_age_stochastic(
    streams: &[RetirementIncomeStream],
    resolved_payouts: &HashMap<String, f64>,
    age: u32,
    years_from_now: u32,
    inflation_rate: f64,
    cumulative_inflation: Option<f64>,
) -> f64 {
    streams
        .iter()
        .filter(|s| age >= s.start_age)
        .map(|s| {
            let base_monthly = resolved_payouts
                .get(&s.id)
                .copied()
                .unwrap_or(s.monthly_amount.unwrap_or(0.0));
            let annual = base_monthly * 12.0;
            if let Some(r) = s.annual_growth_rate {
                // Custom growth rate: always deterministic
                annual * (1.0 + r).powi(years_from_now as i32)
            } else if s.adjust_for_inflation {
                match cumulative_inflation {
                    Some(cum) => annual * cum,
                    None => annual * (1.0 + inflation_rate).powi(years_from_now as i32),
                }
            } else {
                annual
            }
        })
        .sum()
}

/// DC payout resolver: precompute the monthly payout from accumulated balance at start_age.
pub(crate) fn resolve_plan_dc_payouts(
    streams: &[RetirementIncomeStream],
    current_age: u32,
    retirement_age: u32,
    swr: f64,
) -> HashMap<String, f64> {
    streams
        .iter()
        .filter(|s| s.stream_type == StreamKind::DefinedContribution)
        .map(|s| {
            let total_years = (s.start_age as i32 - current_age as i32).max(0) as u32;
            let contrib_years =
                (s.start_age.min(retirement_age) as i32 - current_age as i32).max(0) as u32;
            let growth_only_years = total_years - contrib_years;
            let r = s.accumulation_return.unwrap_or(0.04);
            let initial = s.current_value.unwrap_or(0.0);
            let monthly_contrib = s.monthly_contribution.unwrap_or(0.0);
            let fv_lump = initial * (1.0 + r).powi(total_years as i32);
            let fv_annuity_at_stop = if r > 1e-9 {
                monthly_contrib * 12.0 * ((1.0 + r).powi(contrib_years as i32) - 1.0) / r
            } else {
                monthly_contrib * 12.0 * contrib_years as f64
            };
            let fv_annuity = fv_annuity_at_stop * (1.0 + r).powi(growth_only_years as i32);
            let monthly_payout = (fv_lump + fv_annuity) * swr / 12.0;
            (s.id.clone(), monthly_payout)
        })
        .collect()
}

/// Compute total annual income from plan income streams at a given age.
pub(crate) fn plan_income_at_age(
    streams: &[RetirementIncomeStream],
    resolved_payouts: &HashMap<String, f64>,
    age: u32,
    years_from_now: u32,
    inflation_rate: f64,
) -> f64 {
    streams
        .iter()
        .filter(|s| age >= s.start_age)
        .map(|s| {
            let base_monthly = resolved_payouts
                .get(&s.id)
                .copied()
                .unwrap_or(s.monthly_amount.unwrap_or(0.0));
            let annual = base_monthly * 12.0;
            if let Some(r) = s.annual_growth_rate {
                annual * (1.0 + r).powi(years_from_now as i32)
            } else if s.adjust_for_inflation {
                annual * (1.0 + inflation_rate).powi(years_from_now as i32)
            } else {
                annual
            }
        })
        .sum()
}

/// Advance pension fund balances for plan income streams.
pub(crate) fn step_plan_pension_funds(
    streams: &[RetirementIncomeStream],
    balances: &mut HashMap<String, f64>,
    age: u32,
    in_fire: bool,
) {
    for s in streams {
        let has_accumulation =
            s.current_value.unwrap_or(0.0) > 0.0 || s.monthly_contribution.unwrap_or(0.0) > 0.0;
        if !has_accumulation {
            continue;
        }
        let current = *balances
            .get(&s.id)
            .unwrap_or(&s.current_value.unwrap_or(0.0));
        if age < s.start_age {
            let r = s.accumulation_return.unwrap_or(0.04);
            let contributions = if in_fire {
                0.0
            } else {
                s.monthly_contribution.unwrap_or(0.0) * 12.0
            };
            let next = current * (1.0 + r) + contributions;
            balances.insert(s.id.clone(), next);
        } else {
            balances.insert(s.id.clone(), 0.0);
        }
    }
}

/// Plan-aware glide-path blending.
pub(crate) fn plan_blended_return(
    plan: &RetirementPlan,
    i: u32,
    in_fire: bool,
    retirement_start_age: u32,
) -> f64 {
    let accumulation_return = plan_accumulation_return(plan);
    let retirement_return = plan_retirement_return(plan);
    if !in_fire {
        return accumulation_return;
    }

    let gp = match plan.investment.glide_path.as_ref() {
        Some(gp) if gp.enabled => gp,
        _ => return retirement_return,
    };
    let years_to_fire =
        (retirement_start_age as i32 - plan.personal.current_age as i32).max(0) as f64;
    let years_in_retirement =
        (plan.personal.planning_horizon_age as i32 - retirement_start_age as i32).max(1) as f64;
    let years_from_fire = (i as f64 - years_to_fire).max(0.0);
    let t = (years_from_fire / years_in_retirement).clamp(0.0, 1.0);
    let bond_pct = (gp.bond_allocation_at_fire
        + t * (gp.bond_allocation_at_horizon - gp.bond_allocation_at_fire))
        .clamp(0.0, 1.0);
    let stock_pct = 1.0 - bond_pct;
    let bond_return = net_annual_return(
        gp.bond_return_rate,
        plan.investment.annual_investment_fee_rate,
    );
    stock_pct * retirement_return + bond_pct * bond_return
}

/// Net FIRE target from a `RetirementPlan` at a given candidate retirement age.
///
/// Schedule-aware: only expense buckets active at `retirement_age` are included
/// in the perpetual spending target.
pub fn plan_net_fire_target(plan: &RetirementPlan, retirement_age: u32) -> f64 {
    let resolved = resolve_plan_dc_payouts(
        &plan.income_streams,
        plan.personal.current_age,
        retirement_age,
        plan.withdrawal.safe_withdrawal_rate,
    );
    let income_at_fire_age: f64 = plan
        .income_streams
        .iter()
        .filter(|s| s.start_age <= retirement_age)
        .map(|s| {
            resolved
                .get(&s.id)
                .copied()
                .unwrap_or(s.monthly_amount.unwrap_or(0.0))
        })
        .sum();

    let total_monthly: f64 = plan
        .expenses
        .all_buckets()
        .iter()
        .filter(|(b, _)| {
            b.start_age.map_or(true, |s| s <= retirement_age)
                && b.end_age.map_or(true, |e| e > retirement_age)
        })
        .map(|(b, _)| b.monthly_amount)
        .sum();
    let net_monthly = (total_monthly - income_at_fire_age).max(0.0);
    (net_monthly * 12.0) / plan.withdrawal.safe_withdrawal_rate
}

fn retirement_feasible_from_capital(
    plan: &RetirementPlan,
    retirement_age: u32,
    starting_capital: f64,
) -> bool {
    let current_age = plan.personal.current_age;
    let horizon = plan.personal.planning_horizon_age;
    let inflation = plan.investment.inflation_rate;
    let years_to_retirement = (retirement_age as i32 - current_age as i32).max(0) as u32;
    let resolved_payouts = resolve_plan_dc_payouts(
        &plan.income_streams,
        current_age,
        retirement_age,
        plan.withdrawal.safe_withdrawal_rate,
    );
    let use_constant_pct = matches!(
        plan.withdrawal.strategy,
        WithdrawalPolicy::ConstantPercentage
    );

    let mut buckets = initial_withdrawal_buckets(&plan.tax, starting_capital.max(0.0));
    for y in 0..=(horizon as i32 - retirement_age as i32).max(0) as u32 {
        let age = retirement_age + y;
        let years_from_now = years_to_retirement + y;
        let annual_return = plan_blended_return(plan, years_from_now, true, retirement_age);
        let grown_buckets = apply_growth(buckets, annual_return);
        let (expenses, essential_expenses) =
            annual_expenses_at_year(&plan.expenses, age, years_from_now, inflation);
        let income = plan_income_at_age(
            &plan.income_streams,
            &resolved_payouts,
            age,
            years_from_now,
            inflation,
        );
        let outcome = apply_withdrawal_policy(
            &plan.withdrawal,
            &grown_buckets,
            expenses,
            essential_expenses,
            income,
            &plan.tax,
            age,
        );
        let spending_gap = (expenses - income).max(0.0);
        if outcome.spending_funded < spending_gap * 0.999 {
            return false;
        }
        buckets = outcome.remaining_buckets;
    }

    let ending_portfolio = buckets.total();
    if use_constant_pct {
        ending_portfolio > starting_capital * 0.05
    } else {
        ending_portfolio > 0.0
    }
}

/// Schedule-feasibility FI trigger computed by reusing the retirement ledger
/// with a binary search over starting capital at `retirement_age`.
pub fn compute_required_capital(plan: &RetirementPlan, retirement_age: u32) -> f64 {
    let horizon = plan.personal.planning_horizon_age;
    if retirement_age > horizon {
        return 0.0;
    }
    if retirement_feasible_from_capital(plan, retirement_age, 0.0) {
        return 0.0;
    }

    let mut hi = plan_net_fire_target(plan, retirement_age).max(1.0);
    while !retirement_feasible_from_capital(plan, retirement_age, hi) && hi < 1_000_000_000_000.0 {
        hi *= 2.0;
    }
    let mut lo = 0.0;
    for _ in 0..50 {
        let mid = (lo + hi) / 2.0;
        if retirement_feasible_from_capital(plan, retirement_age, mid) {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    hi
}

// ─── Plan-aware Deterministic Projection ────────────────────────────────────

pub fn project_retirement(plan: &RetirementPlan, current_portfolio: f64) -> FireProjection {
    project_retirement_with_mode(plan, current_portfolio, RetirementTimingMode::Fire)
}

pub(crate) fn retirement_start_decision(
    mode: RetirementTimingMode,
    age: u32,
    target_age: u32,
    portfolio: f64,
    required_capital: f64,
) -> Option<RetirementStartReason> {
    match mode {
        RetirementTimingMode::Fire if age >= target_age && portfolio >= required_capital => {
            Some(RetirementStartReason::Funded)
        }
        RetirementTimingMode::Fire => None,
        RetirementTimingMode::Traditional if age >= target_age && portfolio >= required_capital => {
            Some(RetirementStartReason::Funded)
        }
        RetirementTimingMode::Traditional if age >= target_age => {
            Some(RetirementStartReason::TargetAgeForced)
        }
        RetirementTimingMode::Traditional => None,
    }
}

pub fn project_retirement_with_mode(
    plan: &RetirementPlan,
    current_portfolio: f64,
    mode: RetirementTimingMode,
) -> FireProjection {
    let target_at_goal = compute_required_capital(plan, plan.personal.target_retirement_age);
    let coast_amount = {
        let years = plan.personal.target_retirement_age as i32 - plan.personal.current_age as i32;
        if years <= 0 {
            target_at_goal
        } else {
            target_at_goal / (1.0 + plan_accumulation_return(plan)).powi(years)
        }
    };

    let start_year = chrono::Local::now().year() as u32;
    let current_age = plan.personal.current_age;
    let horizon_years =
        (plan.personal.planning_horizon_age as i32 - current_age as i32).max(1) as u32;
    let contrib_growth = plan
        .personal
        .salary_growth_rate
        .unwrap_or(plan.investment.contribution_growth_rate);
    let inflation = plan.investment.inflation_rate;

    let mut buckets = initial_withdrawal_buckets(&plan.tax, current_portfolio);
    let mut fire_age: Option<u32> = None;
    let mut fire_year: Option<u32> = None;
    let mut retirement_start_age: Option<u32> = None;
    let mut retirement_start_reason: Option<RetirementStartReason> = None;
    let mut portfolio_at_fire = 0.0;
    let mut funded_at_retirement = false;
    let mut in_fire = false;
    let mut actual_retirement_age = plan.personal.target_retirement_age;
    let mut resolved_payouts: Option<HashMap<String, f64>> = None;
    let mut year_by_year = Vec::new();

    let mut pension_balances: HashMap<String, f64> = plan
        .income_streams
        .iter()
        .map(|s| (s.id.clone(), s.current_value.unwrap_or(0.0)))
        .collect();

    for i in 0..=horizon_years {
        let age = current_age + i;
        let year = start_year + i;
        let portfolio = buckets.total();

        let pension_assets: f64 = pension_balances.values().sum();

        if !in_fire {
            let required = compute_required_capital(plan, age);
            if fire_age.is_none() && portfolio >= required {
                fire_age = Some(age);
                fire_year = Some(year);
                portfolio_at_fire = portfolio;
            }
            if let Some(start_reason) = retirement_start_decision(
                mode,
                age,
                plan.personal.target_retirement_age,
                portfolio,
                required,
            ) {
                in_fire = true;
                actual_retirement_age = age;
                retirement_start_age = Some(age);
                retirement_start_reason = Some(start_reason);
                if start_reason == RetirementStartReason::Funded {
                    funded_at_retirement = true;
                }
                resolved_payouts = Some(resolve_plan_dc_payouts(
                    &plan.income_streams,
                    current_age,
                    age,
                    plan.withdrawal.safe_withdrawal_rate,
                ));
            }
        }

        let r = plan_blended_return(plan, i, in_fire, actual_retirement_age);

        if in_fire {
            let payouts = resolved_payouts.as_ref().unwrap();
            let (total_expenses, essential_expenses) =
                annual_expenses_at_year(&plan.expenses, age, i, inflation);
            let income = plan_income_at_age(&plan.income_streams, payouts, age, i, inflation);

            let grown_buckets = apply_growth(buckets, r);
            let outcome = apply_withdrawal_policy(
                &plan.withdrawal,
                &grown_buckets,
                total_expenses,
                essential_expenses,
                income,
                &plan.tax,
                age,
            );

            let shortfall = (total_expenses - outcome.spending_funded - income).max(0.0);
            year_by_year.push(YearlySnapshot {
                age,
                year,
                phase: "fire".to_string(),
                portfolio_value: portfolio.max(0.0),
                annual_contribution: 0.0,
                annual_withdrawal: outcome.spending_funded + income,
                annual_income: income,
                net_withdrawal_from_portfolio: outcome.spending_funded,
                pension_assets,
                annual_taxes: Some(outcome.tax_amount),
                gross_withdrawal: Some(outcome.gross_withdrawal),
                planned_expenses: Some(total_expenses),
                funded_expenses: Some(outcome.spending_funded + income),
                annual_shortfall: Some(shortfall),
            });

            buckets = outcome.remaining_buckets;
        } else {
            let annual_contribution =
                plan.investment.monthly_contribution * 12.0 * (1.0 + contrib_growth).powi(i as i32);

            year_by_year.push(YearlySnapshot {
                age,
                year,
                phase: "accumulation".to_string(),
                portfolio_value: portfolio,
                annual_contribution,
                annual_withdrawal: 0.0,
                annual_income: 0.0,
                net_withdrawal_from_portfolio: 0.0,
                pension_assets,
                annual_taxes: None,
                gross_withdrawal: None,
                planned_expenses: None,
                funded_expenses: None,
                annual_shortfall: None,
            });

            let grown_buckets = apply_growth(buckets, r);
            buckets = add_contribution(grown_buckets, annual_contribution, &plan.tax);
        }

        step_plan_pension_funds(&plan.income_streams, &mut pension_balances, age, in_fire);
    }

    FireProjection {
        fire_age,
        fire_year,
        retirement_start_age,
        retirement_start_reason,
        portfolio_at_fire,
        funded_at_retirement,
        coast_fire_amount: coast_amount,
        coast_fire_reached: current_portfolio >= coast_amount,
        year_by_year,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
                pre_retirement_annual_return: 0.07,
                retirement_annual_return: 0.07,
                annual_investment_fee_rate: 0.0,
                annual_volatility: 0.12,
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
    fn net_fire_target_no_streams() {
        let p = base_plan();
        // 3000 * 12 / 0.04 = 900_000
        assert_eq!(
            plan_net_fire_target(&p, p.personal.target_retirement_age),
            900_000.0
        );
    }

    #[test]
    fn net_fire_target_with_early_stream() {
        let mut p = base_plan();
        // 1,200/mo pension starting at 55 (= FIRE age)
        p.income_streams.push(RetirementIncomeStream {
            id: "pension".into(),
            label: "Pension".into(),
            stream_type: StreamKind::DefinedBenefit,
            start_age: 55,
            adjust_for_inflation: false,
            annual_growth_rate: None,
            monthly_amount: Some(1_200.0),
            linked_account_id: None,
            current_value: None,
            monthly_contribution: None,
            accumulation_return: None,
        });
        // net monthly = 3000 - 1200 = 1800; target = 1800 * 12 / 0.04 = 540_000
        assert_eq!(
            plan_net_fire_target(&p, p.personal.target_retirement_age),
            540_000.0
        );
    }

    #[test]
    fn net_fire_target_deferred_stream_not_subtracted() {
        let mut p = base_plan();
        // Pension starts at 67, FIRE at 55 -> should NOT reduce net target
        p.income_streams.push(RetirementIncomeStream {
            id: "inps".into(),
            label: "INPS".into(),
            stream_type: StreamKind::DefinedBenefit,
            start_age: 67,
            adjust_for_inflation: true,
            annual_growth_rate: None,
            monthly_amount: Some(1_000.0),
            linked_account_id: None,
            current_value: None,
            monthly_contribution: None,
            accumulation_return: None,
        });
        assert_eq!(
            plan_net_fire_target(&p, p.personal.target_retirement_age),
            900_000.0
        );
    }

    #[test]
    fn phase_returns_subtract_fee() {
        let mut p = base_plan();
        p.investment.pre_retirement_annual_return = 0.0577;
        p.investment.retirement_annual_return = 0.0337;
        p.investment.annual_investment_fee_rate = 0.006;

        assert!((plan_accumulation_return(&p) - 0.0517).abs() < 0.000001);
        assert!((plan_retirement_return(&p) - 0.0277).abs() < 0.000001);
        assert!((plan_blended_return(&p, 0, false, 55) - 0.0517).abs() < 0.000001);
        assert!((plan_blended_return(&p, 20, true, 55) - 0.0277).abs() < 0.000001);
    }

    #[test]
    fn required_capital_uses_retirement_return() {
        let mut high_return = base_plan();
        high_return.investment.retirement_annual_return = 0.07;

        let mut low_return = high_return.clone();
        low_return.investment.retirement_annual_return = 0.03;

        let high_return_target =
            compute_required_capital(&high_return, high_return.personal.target_retirement_age);
        let low_return_target =
            compute_required_capital(&low_return, low_return.personal.target_retirement_age);

        assert!(
            low_return_target > high_return_target,
            "lower retirement return should require more capital: {low_return_target} <= {high_return_target}"
        );
    }

    #[test]
    fn projection_reaches_fire() {
        let p = base_plan();
        let proj = project_retirement(&p, 100_000.0);
        assert!(proj.fire_age.is_some(), "should reach FIRE");
        assert!(proj.fire_age.unwrap() <= p.personal.target_retirement_age);
    }

    #[test]
    fn fire_mode_reports_early_fi_but_starts_withdrawals_at_target_age() {
        let p = base_plan();
        let proj = project_retirement(&p, 100_000.0);

        let fi_age = proj.fire_age.expect("should reach FI");
        assert!(fi_age <= p.personal.target_retirement_age);
        assert_eq!(
            proj.retirement_start_age,
            Some(p.personal.target_retirement_age)
        );
        assert!(
            proj.year_by_year
                .iter()
                .filter(|s| s.age < p.personal.target_retirement_age)
                .all(|s| s.phase == "accumulation"),
            "reaching FI early should not start withdrawals before the desired retirement age"
        );
    }

    #[test]
    fn projection_snapshots_continuous() {
        let p = base_plan();
        let proj = project_retirement(&p, 50_000.0);
        let expected_len = (p.personal.planning_horizon_age - p.personal.current_age + 1) as usize;
        assert_eq!(proj.year_by_year.len(), expected_len);
    }

    #[test]
    fn net_target_higher_when_retiring_before_pension_starts() {
        let mut p = base_plan();
        // Pension starts at 60, target FIRE at 55
        p.personal.target_retirement_age = 55;
        p.income_streams.push(RetirementIncomeStream {
            id: "pension".into(),
            label: "Pension".into(),
            stream_type: StreamKind::DefinedBenefit,
            start_age: 60,
            adjust_for_inflation: false,
            annual_growth_rate: None,
            monthly_amount: Some(1_200.0),
            linked_account_id: None,
            current_value: None,
            monthly_contribution: None,
            accumulation_return: None,
        });
        // At age 50: pension not available -> full target
        let target_at_50 = plan_net_fire_target(&p, 50);
        // At age 60: pension available -> reduced target
        let target_at_60 = plan_net_fire_target(&p, 60);
        assert!(
            target_at_50 > target_at_60,
            "target at 50 ({}) should be larger than at 60 ({}) because pension is not yet available",
            target_at_50, target_at_60,
        );
        // At 50, no income streams -> full gross target
        assert_eq!(target_at_50, 900_000.0);
        // At 60, 1200/mo pension -> net monthly = 3000 - 1200 = 1800 -> 540_000
        assert_eq!(target_at_60, 540_000.0);
    }

    #[test]
    fn dc_payout_varies_with_retirement_age() {
        // DC fund: 10k initial, 200/mo contribution, 4% return, starts paying at 65
        let dc = RetirementIncomeStream {
            id: "dc".into(),
            label: "DC Fund".into(),
            stream_type: StreamKind::DefinedContribution,
            start_age: 65,
            adjust_for_inflation: false,
            annual_growth_rate: None,
            monthly_amount: None,
            linked_account_id: None,
            current_value: Some(10_000.0),
            monthly_contribution: Some(200.0),
            accumulation_return: Some(0.04),
        };
        // Retiring at 50: contributions stop at 50, 15 years of growth-only until 65
        let payouts_at_50 = resolve_plan_dc_payouts(&[dc.clone()], 35, 50, 0.04);
        // Retiring at 55: contributions until 55, 10 years of growth-only until 65
        let payouts_at_55 = resolve_plan_dc_payouts(&[dc], 35, 55, 0.04);
        let payout_50 = payouts_at_50.get("dc").unwrap();
        let payout_55 = payouts_at_55.get("dc").unwrap();
        // Longer contribution period -> higher payout
        assert!(
            payout_55 > payout_50,
            "DC payout with retirement at 55 ({:.0}) should exceed retirement at 50 ({:.0})",
            payout_55,
            payout_50,
        );
    }

    #[test]
    fn early_fi_projection_does_not_subtract_deferred_income() {
        let mut p = base_plan();
        p.personal.target_retirement_age = 60;
        p.investment.monthly_contribution = 0.0;
        // Pension at 60 -- should NOT help an earlier FI check
        p.income_streams.push(RetirementIncomeStream {
            id: "pension".into(),
            label: "Late Pension".into(),
            stream_type: StreamKind::DefinedBenefit,
            start_age: 60,
            adjust_for_inflation: false,
            annual_growth_rate: None,
            monthly_amount: Some(2_000.0),
            linked_account_id: None,
            current_value: None,
            monthly_contribution: None,
            accumulation_return: None,
        });
        // At target age 60, net target = (3000-2000)*12/0.04 = 300_000
        let target_at_60 = plan_net_fire_target(&p, 60);
        assert_eq!(target_at_60, 300_000.0);
        // At age 35 (current), net target = 3000*12/0.04 = 900_000 (no pension yet)
        let target_at_35 = plan_net_fire_target(&p, 35);
        assert_eq!(target_at_35, 900_000.0);
        // With 500k portfolio: should NOT reach FI at 35 (needs 900k), but would at 60 (needs 300k)
        let proj = project_retirement(&p, 500_000.0);
        assert!(proj.fire_age.is_some(), "should eventually reach FIRE");
        assert!(
            proj.fire_age.unwrap() > 35,
            "should not report FI at age 35 with only 500k vs 900k target",
        );
    }

    #[test]
    fn expense_bucket_with_end_age() {
        let mut plan = base_plan();
        // Add housing that ends at age 60
        plan.expenses.housing = Some(ExpenseBucket {
            monthly_amount: 1_000.0,
            inflation_rate: None,
            start_age: None,
            end_age: Some(60),
            essential: None,
        });
        let proj = project_retirement(&plan, 500_000.0);
        // Find fire-phase snapshots
        let fire_snaps: Vec<_> = proj
            .year_by_year
            .iter()
            .filter(|s| s.phase == "fire")
            .collect();
        if fire_snaps.len() >= 2 {
            // Find a snap before 60 and after 60
            let before = fire_snaps.iter().find(|s| s.age == 55);
            let after = fire_snaps.iter().find(|s| s.age == 65);
            if let (Some(b), Some(a)) = (before, after) {
                // Before 60: expenses include housing. After 60: housing drops.
                assert!(
                    b.annual_withdrawal > a.annual_withdrawal,
                    "expenses at 55 ({}) should exceed 65 ({}) due to housing ending",
                    b.annual_withdrawal,
                    a.annual_withdrawal,
                );
            }
        }
    }

    #[test]
    fn healthcare_inflation_isolation() {
        let mut plan = base_plan();
        plan.expenses.healthcare = ExpenseBucket {
            monthly_amount: 500.0,
            inflation_rate: Some(0.08), // 8% healthcare inflation
            start_age: None,
            end_age: None,
            essential: None,
        };
        plan.investment.inflation_rate = 0.02; // 2% general

        let (total_y0, _) = annual_expenses_at_year(&plan.expenses, 55, 0, 0.02);
        let (total_y20, _) = annual_expenses_at_year(&plan.expenses, 75, 20, 0.02);

        // Healthcare at 8% for 20 years: 500*12 * 1.08^20
        // Living at 2% for 20 years: 3000*12 * 1.02^20
        // Total y20 should be much higher than naive 2% on everything
        let naive_total_y20 = total_y0 * (1.02_f64).powi(20);
        assert!(
            total_y20 > naive_total_y20,
            "healthcare at 8% inflation should outpace 2% general: {} vs {}",
            total_y20,
            naive_total_y20,
        );
    }

    #[test]
    fn projection_populates_taxes_and_gross_withdrawal() {
        let mut p = base_plan();
        p.tax = Some(TaxProfile {
            taxable_withdrawal_rate: 0.20,
            tax_deferred_withdrawal_rate: 0.0,
            tax_free_withdrawal_rate: 0.0,
            early_withdrawal_penalty_rate: None,
            early_withdrawal_penalty_age: None,
            country_code: None,
            withdrawal_buckets: TaxBucketBalances::default(),
        });
        let proj = project_retirement(&p, 100_000.0);
        let fire_snaps: Vec<_> = proj
            .year_by_year
            .iter()
            .filter(|s| s.phase == "fire")
            .collect();
        assert!(!fire_snaps.is_empty(), "should have fire-phase snapshots");
        for snap in &fire_snaps {
            assert!(
                snap.annual_taxes.is_some(),
                "annual_taxes should be populated in fire phase (age {})",
                snap.age,
            );
            assert!(
                snap.gross_withdrawal.is_some(),
                "gross_withdrawal should be populated in fire phase (age {})",
                snap.age,
            );
        }
        // Accumulation phase should have None
        let accum_snaps: Vec<_> = proj
            .year_by_year
            .iter()
            .filter(|s| s.phase == "accumulation")
            .collect();
        for snap in &accum_snaps {
            assert!(snap.annual_taxes.is_none());
            assert!(snap.gross_withdrawal.is_none());
        }
    }

    #[test]
    fn schedule_aware_target_excludes_ended_buckets() {
        let mut p = base_plan();
        // Housing ends at 60
        p.expenses.housing = Some(ExpenseBucket {
            monthly_amount: 1_500.0,
            inflation_rate: None,
            start_age: None,
            end_age: Some(60),
            essential: None,
        });
        // At age 55: housing active -> included in target
        let target_55 = plan_net_fire_target(&p, 55);
        // At age 65: housing ended -> excluded from target
        let target_65 = plan_net_fire_target(&p, 65);
        // Target at 55 should be higher because housing is active
        assert!(
            target_55 > target_65,
            "target at 55 ({}) should exceed target at 65 ({}) because housing ends at 60",
            target_55,
            target_65,
        );
        // At 55: (3000 + 1500) * 12 / 0.04 = 1_350_000
        assert_eq!(target_55, 1_350_000.0);
        // At 65: 3000 * 12 / 0.04 = 900_000
        assert_eq!(target_65, 900_000.0);
    }

    #[test]
    fn deferred_pension_reduces_spending_gap_after_start_age() {
        let mut plan = base_plan();
        plan.income_streams.push(RetirementIncomeStream {
            id: "pension".into(),
            label: "State pension".into(),
            stream_type: StreamKind::DefinedBenefit,
            monthly_amount: Some(1500.0),
            start_age: 67,
            adjust_for_inflation: true,
            annual_growth_rate: None,
            linked_account_id: None,
            current_value: None,
            monthly_contribution: None,
            accumulation_return: None,
        });
        let proj = project_retirement(&plan, 800_000.0);
        let at_60 = proj
            .year_by_year
            .iter()
            .find(|s| s.age == 60 && s.phase == "fire");
        let at_70 = proj
            .year_by_year
            .iter()
            .find(|s| s.age == 70 && s.phase == "fire");
        if let (Some(before), Some(after)) = (at_60, at_70) {
            assert!(
                after.net_withdrawal_from_portfolio < before.net_withdrawal_from_portfolio,
                "pension at 67 should reduce portfolio withdrawal: {} vs {}",
                after.net_withdrawal_from_portfolio,
                before.net_withdrawal_from_portfolio,
            );
        }
    }

    #[test]
    fn housing_bucket_ends_at_specified_age() {
        let mut plan = base_plan();
        plan.expenses.housing = Some(ExpenseBucket {
            monthly_amount: 1500.0,
            inflation_rate: None,
            start_age: None,
            end_age: Some(65),
            essential: None,
        });
        let proj = project_retirement(&plan, 800_000.0);
        let at_60 = proj
            .year_by_year
            .iter()
            .find(|s| s.age == 60 && s.phase == "fire");
        let at_70 = proj
            .year_by_year
            .iter()
            .find(|s| s.age == 70 && s.phase == "fire");
        if let (Some(before), Some(after)) = (at_60, at_70) {
            assert!(
                after.annual_withdrawal < before.annual_withdrawal,
                "expenses should drop after housing ends: {} vs {}",
                after.annual_withdrawal,
                before.annual_withdrawal,
            );
        }
    }

    #[test]
    fn early_withdrawal_penalty_stops_at_cutoff_age() {
        let mut plan = base_plan();
        plan.personal.target_retirement_age = 50;
        plan.tax = Some(TaxProfile {
            taxable_withdrawal_rate: 0.20,
            tax_deferred_withdrawal_rate: 0.0,
            tax_free_withdrawal_rate: 0.0,
            early_withdrawal_penalty_rate: Some(0.10),
            early_withdrawal_penalty_age: Some(59),
            country_code: None,
            withdrawal_buckets: TaxBucketBalances::default(),
        });
        let proj = project_retirement(&plan, 1_500_000.0);
        let at_55 = proj
            .year_by_year
            .iter()
            .find(|s| s.age == 55 && s.phase == "fire");
        let at_62 = proj
            .year_by_year
            .iter()
            .find(|s| s.age == 62 && s.phase == "fire");
        if let (Some(early), Some(late)) = (at_55, at_62) {
            let early_gross = early.gross_withdrawal.unwrap_or(0.0);
            let late_gross = late.gross_withdrawal.unwrap_or(0.0);
            if early_gross > 0.0 && late_gross > 0.0 {
                let early_ratio = early.annual_taxes.unwrap_or(0.0) / early_gross;
                let late_ratio = late.annual_taxes.unwrap_or(0.0) / late_gross;
                assert!(
                    early_ratio > late_ratio,
                    "early tax ratio ({:.3}) should exceed late ({:.3})",
                    early_ratio,
                    late_ratio,
                );
            }
        }
    }

    #[test]
    fn fire_mode_does_not_force_retirement_when_underfunded() {
        let mut plan = base_plan();
        plan.expenses.living.monthly_amount = 20_000.0;
        plan.investment.monthly_contribution = 0.0;

        let projection = project_retirement_with_mode(&plan, 10_000.0, RetirementTimingMode::Fire);

        assert!(projection.fire_age.is_none());
        assert!(projection.retirement_start_age.is_none());
        assert!(projection.retirement_start_reason.is_none());
        assert!(!projection.funded_at_retirement);
        assert!(
            projection
                .year_by_year
                .iter()
                .all(|y| y.phase == "accumulation"),
            "fire mode should stay in accumulation when FI is never reached"
        );
    }

    #[test]
    fn traditional_mode_forces_retirement_at_target_age() {
        let mut plan = base_plan();
        plan.expenses.living.monthly_amount = 20_000.0;
        plan.investment.monthly_contribution = 0.0;

        let projection =
            project_retirement_with_mode(&plan, 10_000.0, RetirementTimingMode::Traditional);

        assert!(projection.fire_age.is_none());
        assert_eq!(
            projection.retirement_start_age,
            Some(plan.personal.target_retirement_age)
        );
        assert_eq!(
            projection.retirement_start_reason,
            Some(RetirementStartReason::TargetAgeForced)
        );
        assert!(!projection.funded_at_retirement);
        assert!(
            projection.year_by_year.iter().any(|y| y.phase == "fire"),
            "traditional mode should enter retirement at target age"
        );
    }
}
