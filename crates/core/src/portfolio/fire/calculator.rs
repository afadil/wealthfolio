use std::collections::HashMap;

use chrono::Datelike;
use rand::Rng;
use rayon::prelude::*;

use super::model::*;

// ─── Helpers ───────────────────────────────────────────────────────────────────

fn gaussian_random<R: Rng>(rng: &mut R, mean: f64, std: f64) -> f64 {
    let u: f64 = loop {
        let v = rng.gen::<f64>();
        if v > 0.0 {
            break v;
        }
    };
    let v: f64 = loop {
        let v = rng.gen::<f64>();
        if v > 0.0 {
            break v;
        }
    };
    mean + std * (-2.0 * u.ln()).sqrt() * (2.0 * std::f64::consts::PI * v).cos()
}

/// Two-regime fat-tailed return distribution.
/// 85% normal years: μ+1.5%, σ×0.8 — 15% stress years: μ−8.5%, σ×1.8
/// Long-run mean preserved: 0.85×(μ+0.015) + 0.15×(μ−0.085) = μ
fn sample_return<R: Rng>(rng: &mut R, mean: f64, std: f64) -> f64 {
    if rng.gen::<f64>() < 0.15 {
        gaussian_random(rng, mean - 0.085, std * 1.8)
    } else {
        gaussian_random(rng, mean + 0.015, std * 0.8)
    }
}

fn additional_income_at_age(
    streams: &[IncomeStream],
    age: u32,
    years_from_now: u32,
    inflation_rate: f64,
) -> f64 {
    streams
        .iter()
        .filter(|s| age >= s.start_age)
        .map(|s| {
            let annual = s.monthly_amount * 12.0;
            let rate = if let Some(r) = s.annual_growth_rate {
                r
            } else if s.adjust_for_inflation {
                inflation_rate
            } else {
                0.0
            };
            annual * (1.0 + rate).powi(years_from_now as i32)
        })
        .sum()
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    let idx = (sorted.len() as f64 * p).floor() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

// ─── Core FIRE Calculations ────────────────────────────────────────────────────

pub fn calculate_fire_target(settings: &FireSettings) -> f64 {
    (settings.monthly_expenses_at_fire * 12.0) / settings.safe_withdrawal_rate
}

pub fn calculate_net_fire_target(settings: &FireSettings) -> f64 {
    let income_at_fire_age: f64 = settings
        .additional_income_streams
        .iter()
        .filter(|s| s.start_age <= settings.target_fire_age)
        .map(|s| s.monthly_amount)
        .sum();
    let net_monthly = (settings.monthly_expenses_at_fire - income_at_fire_age).max(0.0);
    (net_monthly * 12.0) / settings.safe_withdrawal_rate
}

pub fn calculate_coast_fire_amount(settings: &FireSettings) -> f64 {
    let fire_target = calculate_net_fire_target(settings);
    let years_to_grow = settings.target_fire_age as i32 - settings.current_age as i32;
    if years_to_grow <= 0 {
        return fire_target;
    }
    (fire_target * (1.0 + settings.inflation_rate).powi(years_to_grow))
        / (1.0 + settings.expected_annual_return).powi(years_to_grow)
}

// ─── Pension Fund Stepping ─────────────────────────────────────────────────────

fn step_pension_funds(
    streams: &[IncomeStream],
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
        let current = *balances.get(&s.id).unwrap_or(&s.current_value.unwrap_or(0.0));
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
            // Payout age reached: fund converted to annuity — zero out.
            // The snapshot for this year already captured the peak balance (read before this step).
            balances.insert(s.id.clone(), 0.0);
        }
    }
}

// ─── Deterministic Projection ──────────────────────────────────────────────────

pub fn project_fire_date(settings: &FireSettings, current_portfolio: f64) -> FireProjection {
    let real_fire_target = calculate_net_fire_target(settings);
    let coast_amount = calculate_coast_fire_amount(settings);
    let start_year = chrono::Local::now().year() as u32;
    let horizon_years =
        (settings.planning_horizon_age as i32 - settings.current_age as i32).max(1) as u32;
    let r = settings.expected_annual_return;
    let contrib_growth = settings
        .salary_growth_rate
        .unwrap_or(settings.contribution_growth_rate);

    let mut portfolio = current_portfolio;
    let mut fire_age: Option<u32> = None;
    let mut fire_year: Option<u32> = None;
    let mut portfolio_at_fire = 0.0;
    let mut in_fire = false;
    let mut year_by_year = Vec::new();

    let mut pension_balances: HashMap<String, f64> = settings
        .additional_income_streams
        .iter()
        .map(|s| (s.id.clone(), s.current_value.unwrap_or(0.0)))
        .collect();

    for i in 0..=horizon_years {
        let age = settings.current_age + i;
        let year = start_year + i;

        // Snapshot uses start-of-year pension value (before stepping for this year)
        let pension_assets: f64 = pension_balances.values().sum();

        // Trigger FIRE when nominal portfolio ≥ nominal target
        let nominal_fire_target =
            real_fire_target * (1.0 + settings.inflation_rate).powi(i as i32);
        if !in_fire && (portfolio >= nominal_fire_target || age >= settings.target_fire_age) {
            in_fire = true;
            fire_age = Some(age);
            fire_year = Some(year);
            portfolio_at_fire = portfolio;
        }

        if in_fire {
            let annual_expenses = settings.monthly_expenses_at_fire
                * 12.0
                * (1.0 + settings.inflation_rate).powi(i as i32);
            let annual_income = additional_income_at_age(
                &settings.additional_income_streams,
                age,
                i,
                settings.inflation_rate,
            );
            let net_withdrawal = match settings.withdrawal_strategy {
                WithdrawalStrategy::ConstantPercentage => settings.safe_withdrawal_rate * portfolio,
                WithdrawalStrategy::ConstantDollar => (annual_expenses - annual_income).max(0.0),
            };

            year_by_year.push(YearlySnapshot {
                age,
                year,
                phase: "fire".to_string(),
                portfolio_value: portfolio.max(0.0),
                annual_contribution: 0.0,
                annual_withdrawal: annual_expenses,
                annual_income,
                net_withdrawal_from_portfolio: net_withdrawal,
                pension_assets,
            });

            portfolio = (portfolio * (1.0 + r) - net_withdrawal).max(0.0);
        } else {
            let annual_contribution =
                settings.monthly_contribution * 12.0 * (1.0 + contrib_growth).powi(i as i32);

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
            });

            portfolio = portfolio * (1.0 + r) + annual_contribution;
        }

        // Advance pension balances for the next iteration
        step_pension_funds(
            &settings.additional_income_streams,
            &mut pension_balances,
            age,
            in_fire,
        );
    }

    FireProjection {
        fire_age,
        fire_year,
        portfolio_at_fire,
        coast_fire_amount: coast_amount,
        coast_fire_reached: current_portfolio >= coast_amount,
        year_by_year,
    }
}

// ─── Monte Carlo ───────────────────────────────────────────────────────────────

pub fn run_monte_carlo(
    settings: &FireSettings,
    current_portfolio: f64,
    n_sims: u32,
) -> MonteCarloResult {
    let real_fire_target = calculate_net_fire_target(settings);
    let horizon_years =
        (settings.planning_horizon_age as i32 - settings.current_age as i32).max(1) as u32;
    let contrib_growth = settings
        .salary_growth_rate
        .unwrap_or(settings.contribution_growth_rate);
    let use_constant_pct = matches!(
        settings.withdrawal_strategy,
        WithdrawalStrategy::ConstantPercentage
    );

    // Clone what we need for parallel closure (avoids borrowing settings across threads)
    let streams = settings.additional_income_streams.clone();
    let mean = settings.expected_annual_return;
    let std_dev = settings.expected_return_std_dev;
    let current_age = settings.current_age;
    let target_fire_age = settings.target_fire_age;
    let inflation_rate = settings.inflation_rate;
    let monthly_expenses = settings.monthly_expenses_at_fire;
    let monthly_contribution = settings.monthly_contribution;
    let swr = settings.safe_withdrawal_rate;

    // paths[sim] = (year_values, survived, fire_age)
    let sim_results: Vec<(Vec<f64>, bool, Option<u32>)> = (0..n_sims)
        .into_par_iter()
        .map(|_| {
            let mut rng = rand::thread_rng();
            let mut portfolio = current_portfolio;
            let mut in_fire = false;
            let mut sim_fire_age: Option<u32> = None;
            let mut path = Vec::with_capacity(horizon_years as usize + 1);
            let mut cumulative_inflation = 1.0_f64;

            for i in 0..=horizon_years {
                let age = current_age + i;
                path.push(portfolio.max(0.0));

                let nominal_fire_target =
                    real_fire_target * (1.0 + inflation_rate).powi(i as i32);
                if !in_fire && (portfolio >= nominal_fire_target || age >= target_fire_age) {
                    in_fire = true;
                    sim_fire_age = Some(age);
                }

                let annual_return = sample_return(&mut rng, mean, std_dev);

                if in_fire {
                    let annual_expenses =
                        monthly_expenses * 12.0 * cumulative_inflation;
                    let annual_income =
                        additional_income_at_age(&streams, age, i, inflation_rate);
                    let net_withdrawal = if use_constant_pct {
                        swr * portfolio
                    } else {
                        (annual_expenses - annual_income).max(0.0)
                    };
                    portfolio = (portfolio * (1.0 + annual_return) - net_withdrawal).max(0.0);
                } else {
                    let annual_contribution =
                        monthly_contribution * 12.0 * (1.0 + contrib_growth).powi(i as i32);
                    portfolio = portfolio * (1.0 + annual_return) + annual_contribution;
                }

                // Stochastic inflation
                let inf_sample = gaussian_random(&mut rng, inflation_rate, 0.01);
                cumulative_inflation *= 1.0 + inf_sample;
            }

            let survived = portfolio > 0.0;
            (path, survived, sim_fire_age)
        })
        .collect();

    let year_count = horizon_years as usize + 1;
    let survived_count = sim_results.iter().filter(|(_, s, _)| *s).count();
    let mut fire_ages: Vec<u32> = sim_results
        .iter()
        .filter_map(|(_, _, fa)| *fa)
        .collect();
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

    let median_fire_age = if fire_ages.is_empty() {
        target_fire_age
    } else {
        fire_ages[fire_ages.len() / 2]
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

// ─── Scenario Analysis ─────────────────────────────────────────────────────────

pub fn run_scenario_analysis(
    settings: &FireSettings,
    current_portfolio: f64,
) -> Vec<ScenarioResult> {
    let scenarios = [
        ("Pessimistic", -0.02_f64),
        ("Base case", 0.0_f64),
        ("Optimistic", 0.015_f64),
    ];

    scenarios
        .iter()
        .map(|(label, delta)| {
            let adjusted = FireSettings {
                expected_annual_return: settings.expected_annual_return + delta,
                ..settings.clone()
            };
            let proj = project_fire_date(&adjusted, current_portfolio);
            let portfolio_at_horizon = proj
                .year_by_year
                .last()
                .map(|s| s.portfolio_value)
                .unwrap_or(0.0);
            ScenarioResult {
                label: label.to_string(),
                annual_return: adjusted.expected_annual_return,
                fire_age: proj.fire_age,
                portfolio_at_horizon,
                year_by_year: proj.year_by_year,
            }
        })
        .collect()
}

// ─── Sequence of Returns Risk ──────────────────────────────────────────────────

pub fn run_sequence_of_returns_risk(
    settings: &FireSettings,
    portfolio_at_fire: f64,
) -> Vec<SorrScenario> {
    let r = settings.expected_annual_return;
    let years =
        (settings.planning_horizon_age as i32 - settings.target_fire_age as i32).max(10) as usize;
    let years_to_fire =
        (settings.target_fire_age as i32 - settings.current_age as i32).max(0) as u32;
    let use_constant_pct = matches!(
        settings.withdrawal_strategy,
        WithdrawalStrategy::ConstantPercentage
    );

    let scenarios: Vec<(&str, Vec<f64>)> = vec![
        ("Base (constant)", vec![r; years]),
        ("Crash Year 1 (−30%)", {
            let mut v = vec![-0.3_f64];
            v.extend(vec![r + 0.01; years - 1]);
            v
        }),
        ("Crash Year 5 (−30%)", {
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
            let mut portfolio = portfolio_at_fire;
            let mut path = Vec::with_capacity(years + 1);

            for i in 0..years {
                path.push(portfolio.max(0.0));
                let age = settings.target_fire_age + i as u32;
                let years_from_now = years_to_fire + i as u32;
                let annual_expenses = settings.monthly_expenses_at_fire
                    * 12.0
                    * (1.0 + settings.inflation_rate).powi(years_from_now as i32);
                let annual_income = additional_income_at_age(
                    &settings.additional_income_streams,
                    age,
                    years_from_now,
                    settings.inflation_rate,
                );
                let net_withdrawal = if use_constant_pct {
                    settings.safe_withdrawal_rate * portfolio
                } else {
                    (annual_expenses - annual_income).max(0.0)
                };
                portfolio = (portfolio * (1.0 + returns[i]) - net_withdrawal).max(0.0);
            }
            path.push(portfolio.max(0.0));

            SorrScenario {
                label: label.to_string(),
                returns,
                portfolio_path: path,
                final_value: portfolio,
                survived: portfolio > 0.0,
            }
        })
        .collect()
}

// ─── Sensitivity Analysis ──────────────────────────────────────────────────────

pub fn run_sensitivity_analysis(
    settings: &FireSettings,
    current_portfolio: f64,
) -> SensitivityResult {
    let contribution_multipliers = [0.5_f64, 0.75, 1.0, 1.25, 1.5];
    let return_values = [0.04_f64, 0.05, 0.06, 0.07, 0.08, 0.09];
    let swr_values = [0.03_f64, 0.035, 0.04, 0.045, 0.05];

    let contribution_rows: Vec<f64> = contribution_multipliers
        .iter()
        .map(|m| settings.monthly_contribution * m)
        .collect();

    let fire_ages: Vec<Vec<Option<u32>>> = contribution_rows
        .iter()
        .map(|&contribution| {
            return_values
                .iter()
                .map(|&ret| {
                    let s = FireSettings {
                        monthly_contribution: contribution,
                        expected_annual_return: ret,
                        ..settings.clone()
                    };
                    project_fire_date(&s, current_portfolio).fire_age
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
                    let s = FireSettings {
                        safe_withdrawal_rate: swr,
                        expected_annual_return: ret,
                        ..settings.clone()
                    };
                    project_fire_date(&s, current_portfolio).fire_age
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

// ─── Strategy Comparison ───────────────────────────────────────────────────────

pub fn run_strategy_comparison(
    settings: &FireSettings,
    current_portfolio: f64,
    n_sims: u32,
) -> StrategyComparisonResult {
    StrategyComparisonResult {
        constant_dollar: run_monte_carlo(
            &FireSettings {
                withdrawal_strategy: WithdrawalStrategy::ConstantDollar,
                ..settings.clone()
            },
            current_portfolio,
            n_sims,
        ),
        constant_percentage: run_monte_carlo(
            &FireSettings {
                withdrawal_strategy: WithdrawalStrategy::ConstantPercentage,
                ..settings.clone()
            },
            current_portfolio,
            n_sims,
        ),
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn base_settings() -> FireSettings {
        FireSettings {
            monthly_expenses_at_fire: 3_000.0,
            safe_withdrawal_rate: 0.04,
            withdrawal_strategy: WithdrawalStrategy::ConstantDollar,
            expected_annual_return: 0.07,
            expected_return_std_dev: 0.12,
            inflation_rate: 0.02,
            current_age: 35,
            target_fire_age: 55,
            monthly_contribution: 2_000.0,
            contribution_growth_rate: 0.0,
            current_annual_salary: None,
            salary_growth_rate: None,
            additional_income_streams: vec![],
            planning_horizon_age: 90,
            included_account_ids: None,
            target_allocations: HashMap::new(),
            currency: "EUR".to_string(),
        }
    }

    #[test]
    fn gross_fire_target() {
        let s = base_settings();
        // 3000 * 12 / 0.04 = 900_000
        assert_eq!(calculate_fire_target(&s), 900_000.0);
    }

    #[test]
    fn net_fire_target_no_streams() {
        let s = base_settings();
        assert_eq!(calculate_net_fire_target(&s), 900_000.0);
    }

    #[test]
    fn net_fire_target_with_early_stream() {
        let mut s = base_settings();
        // €1,200/mo pension starting at 55 (= FIRE age)
        s.additional_income_streams.push(IncomeStream {
            id: "pension".into(),
            label: "Pension".into(),
            monthly_amount: 1_200.0,
            start_age: 55,
            start_age_is_auto: None,
            adjust_for_inflation: false,
            annual_growth_rate: None,
            linked_account_id: None,
            current_value: None,
            monthly_contribution: None,
            accumulation_return: None,
        });
        // net monthly = 3000 - 1200 = 1800; target = 1800 * 12 / 0.04 = 540_000
        assert_eq!(calculate_net_fire_target(&s), 540_000.0);
    }

    #[test]
    fn net_fire_target_deferred_stream_not_subtracted() {
        let mut s = base_settings();
        // Pension starts at 67, FIRE at 55 → should NOT reduce net target
        s.additional_income_streams.push(IncomeStream {
            id: "inps".into(),
            label: "INPS".into(),
            monthly_amount: 1_000.0,
            start_age: 67,
            start_age_is_auto: None,
            adjust_for_inflation: true,
            annual_growth_rate: None,
            linked_account_id: None,
            current_value: None,
            monthly_contribution: None,
            accumulation_return: None,
        });
        assert_eq!(calculate_net_fire_target(&s), 900_000.0);
    }

    #[test]
    fn projection_reaches_fire() {
        let s = base_settings();
        let proj = project_fire_date(&s, 100_000.0);
        assert!(proj.fire_age.is_some(), "should reach FIRE");
        assert!(proj.fire_age.unwrap() <= s.target_fire_age);
    }

    #[test]
    fn projection_snapshots_continuous() {
        let s = base_settings();
        let proj = project_fire_date(&s, 50_000.0);
        let expected_len = (s.planning_horizon_age - s.current_age + 1) as usize;
        assert_eq!(proj.year_by_year.len(), expected_len);
    }

    #[test]
    fn monte_carlo_success_rate_in_range() {
        let s = base_settings();
        let result = run_monte_carlo(&s, 100_000.0, 500);
        assert!(result.success_rate >= 0.0 && result.success_rate <= 1.0);
        assert_eq!(result.n_simulations, 500);
        assert_eq!(result.age_axis.first(), Some(&s.current_age));
        assert_eq!(
            result.age_axis.last(),
            Some(&s.planning_horizon_age)
        );
    }

    #[test]
    fn sorr_produces_five_scenarios() {
        let s = base_settings();
        let scenarios = run_sequence_of_returns_risk(&s, 900_000.0);
        assert_eq!(scenarios.len(), 5);
        // Base scenario should survive with a healthy portfolio
        assert!(scenarios[0].survived);
    }

    #[test]
    fn sensitivity_dimensions() {
        let s = base_settings();
        let result = run_sensitivity_analysis(&s, 100_000.0);
        assert_eq!(result.contribution.contribution_rows.len(), 5);
        assert_eq!(result.contribution.return_columns.len(), 6);
        assert_eq!(result.contribution.fire_ages.len(), 5);
        assert_eq!(result.swr.swr_rows.len(), 5);
    }
}
