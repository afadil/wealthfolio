use std::collections::HashMap;

use rayon::prelude::*;

use super::dto::*;
use super::engine::*;
use super::model::*;
use super::withdrawal::{
    add_contribution, apply_growth, apply_withdrawal_policy, initial_withdrawal_buckets,
};

// ─── Monte Carlo ─────────────────────────────────────────────────────────────

pub fn run_monte_carlo(
    plan: &RetirementPlan,
    current_portfolio: f64,
    n_sims: u32,
) -> MonteCarloResult {
    run_monte_carlo_with_mode(plan, current_portfolio, n_sims, RetirementTimingMode::Fire)
}

pub fn run_monte_carlo_with_mode(
    plan: &RetirementPlan,
    current_portfolio: f64,
    n_sims: u32,
    mode: RetirementTimingMode,
) -> MonteCarloResult {
    let current_age = plan.personal.current_age;
    let target_fire_age = plan.personal.target_retirement_age;
    let planning_horizon_age = plan.personal.planning_horizon_age;
    let horizon_years = (planning_horizon_age as i32 - current_age as i32).max(1) as u32;
    let inflation_rate = plan.investment.inflation_rate;
    let monthly_contribution = plan.investment.monthly_contribution;
    let contrib_growth = plan
        .personal
        .salary_growth_rate
        .unwrap_or(plan.investment.contribution_growth_rate);
    let swr = plan.withdrawal.safe_withdrawal_rate;
    let use_constant_pct = matches!(
        plan.withdrawal.strategy,
        WithdrawalPolicy::ConstantPercentage
    );
    let mean = plan.investment.expected_annual_return;
    let std_dev = plan.investment.expected_return_std_dev;

    // Clone fields needed inside the parallel closure
    let expenses_clone = plan.expenses.clone();
    let streams_clone = plan.income_streams.clone();
    let withdrawal_clone = plan.withdrawal.clone();
    let tax_clone = plan.tax.clone();
    let glide_path = plan.investment.glide_path.clone();

    // Precompute per-age required capital and DC payouts for all possible retirement ages.
    // These are deterministic and shared across all simulations.
    let age_range = horizon_years as usize + 1;
    let per_age_capitals: Vec<f64> = (0..age_range)
        .map(|i| compute_required_capital(plan, current_age + i as u32))
        .collect();
    let per_age_payouts: Vec<HashMap<String, f64>> = (0..age_range)
        .map(|i| {
            resolve_plan_dc_payouts(
                &plan.income_streams,
                current_age,
                current_age + i as u32,
                swr,
            )
        })
        .collect();

    // paths[sim] = (year_values, survived, fi_age)
    let sim_results: Vec<(Vec<f64>, bool, Option<u32>)> = (0..n_sims)
        .into_par_iter()
        .map(|_| {
            let mut rng = rand::thread_rng();
            let mut buckets = initial_withdrawal_buckets(&tax_clone, current_portfolio);
            let mut in_fire = false;
            let mut sim_fi_age: Option<u32> = None;
            let mut portfolio_at_retirement_start = current_portfolio;
            let mut essential_funded_every_year = true;
            let mut path = Vec::with_capacity(horizon_years as usize + 1);
            let mut cumulative_inflation = 1.0_f64;
            let mut sim_resolved_payouts: Option<&HashMap<String, f64>> = None;
            let mut sim_retirement_age = target_fire_age;

            for i in 0..=horizon_years {
                let age = current_age + i;
                let portfolio = buckets.total();
                path.push(portfolio.max(0.0));

                if !in_fire {
                    let required = per_age_capitals[i as usize];
                    if let Some(start_reason) =
                        retirement_start_decision(mode, age, target_fire_age, portfolio, required)
                    {
                        in_fire = true;
                        sim_retirement_age = age;
                        portfolio_at_retirement_start = portfolio;
                        sim_resolved_payouts = Some(&per_age_payouts[i as usize]);
                        if start_reason == RetirementStartReason::Funded {
                            sim_fi_age = Some(age);
                        }
                    }
                }

                // Glide-path-blended return distribution for this year
                let (eff_mean, eff_std) = blended_return_params_mc(
                    mean,
                    std_dev,
                    current_age,
                    sim_retirement_age,
                    planning_horizon_age,
                    glide_path.as_ref(),
                    i,
                    in_fire,
                );
                let annual_return = sample_return(&mut rng, eff_mean, eff_std);

                if in_fire {
                    let payouts = sim_resolved_payouts.unwrap();
                    let grown_buckets = apply_growth(buckets, annual_return);
                    let (total_expenses, essential_expenses) = annual_expenses_at_year_stochastic(
                        &expenses_clone,
                        age,
                        i,
                        inflation_rate,
                        cumulative_inflation,
                    );
                    let income = plan_income_at_age_stochastic(
                        &streams_clone,
                        payouts,
                        age,
                        i,
                        inflation_rate,
                        Some(cumulative_inflation),
                    );
                    let outcome = apply_withdrawal_policy(
                        &withdrawal_clone,
                        &grown_buckets,
                        total_expenses,
                        essential_expenses,
                        income,
                        &tax_clone,
                        age,
                    );

                    // Track essential spending funding
                    let essential_gap = (essential_expenses - income).max(0.0);
                    if outcome.spending_funded < essential_gap * 0.99 {
                        essential_funded_every_year = false;
                    }

                    buckets = outcome.remaining_buckets;
                } else {
                    let annual_contribution =
                        monthly_contribution * 12.0 * (1.0 + contrib_growth).powi(i as i32);
                    let grown_buckets = apply_growth(buckets, annual_return);
                    buckets = add_contribution(grown_buckets, annual_contribution, &tax_clone);
                }

                cumulative_inflation *= 1.0 + sample_inflation(&mut rng, inflation_rate);
            }

            // Success: essential spending funded every year AND portfolio survives.
            // For constant-percentage, portfolio never hits 0, so use 5% floor.
            let ending_portfolio = buckets.total();
            let portfolio_survived = if use_constant_pct {
                ending_portfolio > portfolio_at_retirement_start * 0.05
            } else {
                ending_portfolio > 0.0
            };
            let survived = essential_funded_every_year
                && portfolio_survived
                && (matches!(mode, RetirementTimingMode::Traditional) || sim_fi_age.is_some());
            (path, survived, sim_fi_age)
        })
        .collect();

    let year_count = horizon_years as usize + 1;
    let survived_count = sim_results.iter().filter(|(_, s, _)| *s).count();
    // Only collect ages where FI target was genuinely reached (fi_age is Some)
    let mut fire_ages: Vec<u32> = sim_results.iter().filter_map(|(_, _, fa)| *fa).collect();
    fire_ages.sort_unstable();

    let mut p10 = Vec::with_capacity(year_count);
    let mut p25 = Vec::with_capacity(year_count);
    let mut p50 = Vec::with_capacity(year_count);
    let mut p75 = Vec::with_capacity(year_count);
    let mut p90 = Vec::with_capacity(year_count);
    let mut age_axis = Vec::with_capacity(year_count);

    for i in 0..year_count {
        let mut vals: Vec<f64> = sim_results.iter().map(|(path, _, _)| path[i]).collect();
        vals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        p10.push(percentile(&vals, 0.1));
        p25.push(percentile(&vals, 0.25));
        p50.push(percentile(&vals, 0.5));
        p75.push(percentile(&vals, 0.75));
        p90.push(percentile(&vals, 0.9));
        age_axis.push(current_age + i as u32);
    }

    let mut final_vals: Vec<f64> = sim_results
        .iter()
        .map(|(path, _, _)| *path.last().unwrap_or(&0.0))
        .collect();
    final_vals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    // None when fewer than 50% of simulations reached FI (underfunded plan)
    let median_fire_age = if fire_ages.len() > n_sims as usize / 2 {
        Some(fire_ages[fire_ages.len() / 2])
    } else {
        None
    };

    MonteCarloResult {
        success_rate: survived_count as f64 / n_sims as f64,
        median_fire_age,
        percentiles: PercentilePaths {
            p10,
            p25,
            p50,
            p75,
            p90,
        },
        age_axis,
        final_portfolio_at_horizon: FinalPortfolioPercentiles {
            p10: percentile(&final_vals, 0.1),
            p25: percentile(&final_vals, 0.25),
            p50: percentile(&final_vals, 0.5),
            p75: percentile(&final_vals, 0.75),
            p90: percentile(&final_vals, 0.9),
        },
        n_simulations: n_sims,
    }
}

// ─── Scenario Analysis ───────────────────────────────────────────────────────

pub fn run_scenario_analysis(plan: &RetirementPlan, current_portfolio: f64) -> Vec<ScenarioResult> {
    run_scenario_analysis_with_mode(plan, current_portfolio, RetirementTimingMode::Fire)
}

pub fn run_scenario_analysis_with_mode(
    plan: &RetirementPlan,
    current_portfolio: f64,
    mode: RetirementTimingMode,
) -> Vec<ScenarioResult> {
    let scenarios = [
        ("Pessimistic", -0.02_f64),
        ("Base case", 0.0_f64),
        ("Optimistic", 0.015_f64),
    ];

    scenarios
        .iter()
        .map(|(label, delta)| {
            let mut adjusted = plan.clone();
            adjusted.investment.expected_annual_return += delta;
            let proj = project_retirement_with_mode(&adjusted, current_portfolio, mode);
            let portfolio_at_horizon = proj
                .year_by_year
                .last()
                .map(|s| s.portfolio_value)
                .unwrap_or(0.0);
            let funded_at_goal_age = proj
                .fire_age
                .map_or(false, |a| a <= adjusted.personal.target_retirement_age);
            let success = proj.retirement_start_age.is_some() && portfolio_at_horizon > 0.0;
            let failure_age = if !success {
                proj.year_by_year
                    .iter()
                    .find(|s| s.phase == "fire" && s.portfolio_value <= 0.0)
                    .map(|s| s.age)
            } else {
                None
            };
            ScenarioResult {
                label: label.to_string(),
                annual_return: adjusted.investment.expected_annual_return,
                fire_age: proj.fire_age,
                portfolio_at_horizon,
                funded_at_goal_age,
                success,
                failure_age,
                year_by_year: proj.year_by_year,
            }
        })
        .collect()
}

// ─── Sequence of Returns Risk ────────────────────────────────────────────────

pub fn run_sorr(
    plan: &RetirementPlan,
    portfolio_at_fire: f64,
    retirement_start_age: u32,
) -> Vec<SorrScenario> {
    if portfolio_at_fire <= 0.0 {
        return vec![]; // SORR disabled when not funded
    }

    let use_constant_pct = matches!(
        plan.withdrawal.strategy,
        WithdrawalPolicy::ConstantPercentage
    );

    let resolved_payouts = resolve_plan_dc_payouts(
        &plan.income_streams,
        plan.personal.current_age,
        retirement_start_age,
        plan.withdrawal.safe_withdrawal_rate,
    );
    let r = plan.investment.expected_annual_return;
    let years =
        (plan.personal.planning_horizon_age as i32 - retirement_start_age as i32).max(10) as usize;
    let years_to_fire =
        (retirement_start_age as i32 - plan.personal.current_age as i32).max(0) as u32;
    let inflation = plan.investment.inflation_rate;

    let scenarios: Vec<(&str, Vec<f64>)> = vec![
        ("Base (constant)", vec![r; years]),
        ("Crash Year 1 (-30%)", {
            let mut v = vec![-0.3_f64];
            v.extend(vec![r + 0.01; years - 1]);
            v
        }),
        ("Crash Year 5 (-30%)", {
            let mut v = vec![r; 4];
            v.push(-0.3);
            v.extend(vec![r + 0.01; years - 5]);
            v
        }),
        ("Double Crash", {
            let mut v = vec![-0.25_f64, r, r, r, -0.2];
            v.extend(vec![r; years - 5]);
            v
        }),
        ("Lost Decade", {
            let mut v = vec![0.0_f64; 10];
            v.extend(vec![r + 0.02; years - 10]);
            v
        }),
    ];

    scenarios
        .into_iter()
        .map(|(label, returns)| {
            let mut buckets = initial_withdrawal_buckets(&plan.tax, portfolio_at_fire);
            let mut path = Vec::with_capacity(years + 1);
            let mut essential_funded_every_year = true;
            let mut failure_age = None;

            for i in 0..years {
                path.push(buckets.total().max(0.0));
                let age = retirement_start_age + i as u32;
                let years_from_now = years_to_fire + i as u32;
                let (total_expenses, essential_expenses) =
                    annual_expenses_at_year(&plan.expenses, age, years_from_now, inflation);
                let income = plan_income_at_age(
                    &plan.income_streams,
                    &resolved_payouts,
                    age,
                    years_from_now,
                    inflation,
                );
                // Use scenario returns[i] but blend with glide path for the base-return component.
                // For non-base scenarios the shock return overrides the actual return for that year;
                // in subsequent years the scenario return already embeds the recovery premium.
                let glide_mean =
                    plan_blended_return(plan, years_from_now, true, retirement_start_age);
                let effective_return = if (returns[i] - r).abs() < 1e-9 {
                    // "normal" year: use glide-path-adjusted mean
                    glide_mean
                } else {
                    // shock or recovery year: keep scenario return as-is
                    returns[i]
                };
                let grown_buckets = apply_growth(buckets, effective_return);
                let outcome = apply_withdrawal_policy(
                    &plan.withdrawal,
                    &grown_buckets,
                    total_expenses,
                    essential_expenses,
                    income,
                    &plan.tax,
                    age,
                );
                let essential_gap = (essential_expenses - income).max(0.0);
                if failure_age.is_none() && outcome.spending_funded < essential_gap * 0.99 {
                    essential_funded_every_year = false;
                    failure_age = Some(age);
                }
                buckets = outcome.remaining_buckets;
            }
            let portfolio = buckets.total();
            path.push(portfolio.max(0.0));

            let portfolio_survived = if use_constant_pct {
                portfolio > portfolio_at_fire * 0.05
            } else {
                portfolio > 0.0
            };
            let survived = essential_funded_every_year && portfolio_survived;
            let floor = if use_constant_pct {
                portfolio_at_fire * 0.05
            } else {
                0.0
            };
            let failure_age = if failure_age.is_some() {
                failure_age
            } else if !survived {
                // Find the first year where portfolio hit the floor
                path.iter()
                    .enumerate()
                    .find(|(_, &v)| v <= floor)
                    .map(|(idx, _)| retirement_start_age + idx as u32)
            } else {
                None
            };
            SorrScenario {
                label: label.to_string(),
                returns,
                portfolio_path: path,
                final_value: portfolio,
                survived,
                failure_age,
            }
        })
        .collect()
}

// ─── Sensitivity Analysis ────────────────────────────────────────────────────

pub fn run_sensitivity_analysis(
    plan: &RetirementPlan,
    current_portfolio: f64,
) -> SensitivityResult {
    run_sensitivity_analysis_with_mode(plan, current_portfolio, RetirementTimingMode::Fire)
}

pub fn run_sensitivity_analysis_with_mode(
    plan: &RetirementPlan,
    current_portfolio: f64,
    mode: RetirementTimingMode,
) -> SensitivityResult {
    let contribution_multipliers = [0.5_f64, 0.75, 1.0, 1.25, 1.5];
    let return_values = [0.04_f64, 0.05, 0.06, 0.07, 0.08, 0.09];
    let swr_values = [0.03_f64, 0.035, 0.04, 0.045, 0.05];

    let contribution_base = plan.investment.monthly_contribution;
    let contribution_rows: Vec<f64> = contribution_multipliers
        .iter()
        .map(|m| contribution_base * m)
        .collect();

    let fire_ages: Vec<Vec<Option<u32>>> = contribution_rows
        .iter()
        .map(|&contribution| {
            return_values
                .iter()
                .map(|&ret| {
                    let mut adjusted = plan.clone();
                    adjusted.investment.monthly_contribution = contribution;
                    adjusted.investment.expected_annual_return = ret;
                    project_retirement_with_mode(&adjusted, current_portfolio, mode).fire_age
                })
                .collect()
        })
        .collect();

    let fire_ages_by_swr: Vec<Vec<Option<u32>>> = swr_values
        .iter()
        .map(|&swr| {
            return_values
                .iter()
                .map(|&ret| {
                    let mut adjusted = plan.clone();
                    adjusted.withdrawal.safe_withdrawal_rate = swr;
                    adjusted.investment.expected_annual_return = ret;
                    project_retirement_with_mode(&adjusted, current_portfolio, mode).fire_age
                })
                .collect()
        })
        .collect();

    SensitivityResult {
        contribution: SensitivityMatrix {
            contribution_rows,
            return_columns: return_values.to_vec(),
            fire_ages,
        },
        swr: SensitivitySwrMatrix {
            swr_rows: swr_values.to_vec(),
            return_columns: return_values.to_vec(),
            fire_ages: fire_ages_by_swr,
        },
    }
}

// ─── Strategy Comparison ─────────────────────────────────────────────────────

pub fn run_strategy_comparison(
    plan: &RetirementPlan,
    current_portfolio: f64,
    n_sims: u32,
) -> StrategyComparisonResult {
    run_strategy_comparison_with_mode(plan, current_portfolio, n_sims, RetirementTimingMode::Fire)
}

pub fn run_strategy_comparison_with_mode(
    plan: &RetirementPlan,
    current_portfolio: f64,
    n_sims: u32,
    mode: RetirementTimingMode,
) -> StrategyComparisonResult {
    let mut plan_cd = plan.clone();
    plan_cd.withdrawal.strategy = WithdrawalPolicy::ConstantDollar;
    let mut plan_cp = plan.clone();
    plan_cp.withdrawal.strategy = WithdrawalPolicy::ConstantPercentage;
    let mut plan_gr = plan.clone();
    plan_gr.withdrawal.strategy = WithdrawalPolicy::Guardrails;
    StrategyComparisonResult {
        constant_dollar: run_monte_carlo_with_mode(&plan_cd, current_portfolio, n_sims, mode),
        constant_percentage: run_monte_carlo_with_mode(&plan_cp, current_portfolio, n_sims, mode),
        guardrails: run_monte_carlo_with_mode(&plan_gr, current_portfolio, n_sims, mode),
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
    fn monte_carlo_success_rate_in_range() {
        let p = base_plan();
        let result = run_monte_carlo(&p, 100_000.0, 500);
        assert!(result.success_rate >= 0.0 && result.success_rate <= 1.0);
        assert_eq!(result.n_simulations, 500);
        assert_eq!(result.age_axis.first(), Some(&p.personal.current_age));
        assert_eq!(
            result.age_axis.last(),
            Some(&p.personal.planning_horizon_age)
        );
    }

    #[test]
    fn sorr_produces_five_scenarios() {
        let p = base_plan();
        let scenarios = run_sorr(&p, 900_000.0, p.personal.target_retirement_age);
        assert_eq!(scenarios.len(), 5);
        // Base scenario should survive with a healthy portfolio
        assert!(scenarios[0].survived);
    }

    #[test]
    fn sensitivity_dimensions() {
        let p = base_plan();
        let result = run_sensitivity_analysis(&p, 100_000.0);
        assert_eq!(result.contribution.contribution_rows.len(), 5);
        assert_eq!(result.contribution.return_columns.len(), 6);
        assert_eq!(result.contribution.fire_ages.len(), 5);
        assert_eq!(result.swr.swr_rows.len(), 5);
    }

    #[test]
    fn sorr_uses_retirement_start_age() {
        let p = base_plan();
        // SORR at age 50 (early retirement) vs 55 (target age)
        let sorr_50 = run_sorr(&p, 900_000.0, 50);
        let sorr_55 = run_sorr(&p, 900_000.0, 55);
        // Earlier retirement -> longer withdrawal period -> more data points
        assert!(
            sorr_50[0].portfolio_path.len() > sorr_55[0].portfolio_path.len(),
            "SORR at 50 should have longer path ({}) than at 55 ({})",
            sorr_50[0].portfolio_path.len(),
            sorr_55[0].portfolio_path.len(),
        );
    }

    #[test]
    fn mc_underfunded_plan_has_no_median_fire_age() {
        let mut plan = base_plan();
        plan.expenses.living.monthly_amount = 50_000.0; // Very high expenses
        plan.investment.monthly_contribution = 100.0; // Tiny contributions
        let result = run_monte_carlo(&plan, 1_000.0, 100);
        // FI target = 50000*12/0.04 = 15M — unreachable with tiny contributions.
        // Fewer than 50% of sims should reach FI, so median_fire_age is None.
        assert!(
            result.median_fire_age.is_none(),
            "underfunded plan should have no median fire age, got {:?}",
            result.median_fire_age,
        );
    }

    #[test]
    fn sorr_returns_empty_when_not_funded() {
        let plan = base_plan();
        let scenarios = run_sorr(&plan, 0.0, 55);
        assert!(
            scenarios.is_empty(),
            "SORR should be empty for zero portfolio",
        );
    }
}
