use std::collections::HashMap;

use chrono::Datelike;
use rand::Rng;
use rand_distr::{Distribution, Normal};
use rayon::prelude::*;

use super::model::*;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/// Two-regime fat-tailed return distribution using the ziggurat algorithm (rand_distr).
/// 85% normal years: μ+1.5%, σ×0.8 — 15% stress years: μ−8.5%, σ×1.8
/// Long-run mean preserved: 0.85×(μ+0.015) + 0.15×(μ−0.085) = μ
/// NOTE: the mixture variance is higher than σ² by design — this is the fat-tail effect.
/// A user-entered σ=12% will produce a wider fan than a single-normal model with σ=12%.
fn sample_return<R: Rng>(rng: &mut R, mean: f64, std: f64) -> f64 {
    if rng.gen::<f64>() < 0.15 {
        Normal::new(mean - 0.085, std * 1.8).unwrap().sample(rng)
    } else {
        Normal::new(mean + 0.015, std * 0.8).unwrap().sample(rng)
    }
}

fn sample_inflation<R: Rng>(rng: &mut R, mean: f64) -> f64 {
    Normal::new(mean, 0.01).unwrap().sample(rng)
}

/// For DC streams, precompute the monthly payout from the accumulated balance at start_age.
/// Uses a deterministic FV formula (pension accumulation is not stochastic).
/// DB streams (stream_type = None / DefinedBenefit) are not present in the returned map.
fn resolve_dc_payouts(
    streams: &[IncomeStream],
    current_age: u32,
    target_fire_age: u32,
    swr: f64,
) -> HashMap<String, f64> {
    streams
        .iter()
        .filter(|s| s.stream_type == Some(StreamType::DefinedContribution))
        .map(|s| {
            let total_years = (s.start_age as i32 - current_age as i32).max(0) as u32;
            let contrib_years =
                (s.start_age.min(target_fire_age) as i32 - current_age as i32).max(0) as u32;
            let growth_only_years = total_years - contrib_years;
            let r = s.accumulation_return.unwrap_or(0.04);
            let initial = s.current_value.unwrap_or(0.0);
            let monthly_contrib = s.monthly_contribution.unwrap_or(0.0);
            // Initial balance grows for entire period
            let fv_lump = initial * (1.0 + r).powi(total_years as i32);
            // Contributions only until FIRE (or startAge if earlier), then grow without contributions
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

/// Compute total annual income from all active streams at a given age.
/// `resolved_payouts`: DC stream payouts precomputed by `resolve_dc_payouts` (use `monthly_amount`
///   for DB streams or any stream not present in the map).
/// `cumulative_inflation`: if Some, inflation-indexed streams use this stochastic factor
/// instead of the deterministic `(1+rate)^years` formula. Pass Some only from Monte Carlo.
fn additional_income_at_age(
    streams: &[IncomeStream],
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
                .unwrap_or(s.monthly_amount);
            let annual = base_monthly * 12.0;
            if let Some(r) = s.annual_growth_rate {
                // Custom growth rate: always deterministic
                annual * (1.0 + r).powi(years_from_now as i32)
            } else if s.adjust_for_inflation {
                // Inflation-indexed: use stochastic factor when available (MC path)
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

/// Annual healthcare cost at simulation year i (years from current age).
fn healthcare_cost_at_year(settings: &FireSettings, i: u32) -> f64 {
    let monthly = settings.healthcare_monthly_at_fire.unwrap_or(0.0);
    if monthly <= 0.0 {
        return 0.0;
    }
    let rate = settings
        .healthcare_inflation_rate
        .unwrap_or(settings.inflation_rate);
    monthly * 12.0 * (1.0 + rate).powi(i as i32)
}

/// Returns (effective_mean_return, effective_std_dev) for a given simulation year.
/// `i` = years from current age; `in_fire` = withdrawal phase.
/// During accumulation the base equity parameters are returned unchanged.
/// During withdrawal the parameters are blended with the bond allocation from the glide path.
fn blended_return_params(settings: &FireSettings, i: u32, in_fire: bool) -> (f64, f64) {
    let gp = match settings.glide_path.as_ref() {
        Some(gp) if gp.enabled => gp,
        _ => {
            return (
                settings.expected_annual_return,
                settings.expected_return_std_dev,
            )
        }
    };
    if !in_fire {
        return (
            settings.expected_annual_return,
            settings.expected_return_std_dev,
        );
    }
    let years_to_fire =
        (settings.target_fire_age as i32 - settings.current_age as i32).max(0) as f64;
    let years_in_retirement =
        (settings.planning_horizon_age as i32 - settings.target_fire_age as i32).max(1) as f64;
    let years_from_fire = (i as f64 - years_to_fire).max(0.0);
    let t = (years_from_fire / years_in_retirement).clamp(0.0, 1.0);
    let bond_pct = (gp.bond_allocation_at_fire
        + t * (gp.bond_allocation_at_horizon - gp.bond_allocation_at_fire))
        .clamp(0.0, 1.0);
    let stock_pct = 1.0 - bond_pct;
    let mean = stock_pct * settings.expected_annual_return + bond_pct * gp.bond_return_rate;
    let std = stock_pct * settings.expected_return_std_dev; // bonds ≈ low vol
    (mean, std)
}

/// MC-closure–safe version of `blended_return_params` that works with owned primitives.
fn blended_return_params_mc(
    base_mean: f64,
    base_std: f64,
    current_age: u32,
    target_fire_age: u32,
    planning_horizon_age: u32,
    gp: Option<&GlidepathSettings>,
    i: u32,
    in_fire: bool,
) -> (f64, f64) {
    let gp = match gp {
        Some(gp) if gp.enabled => gp,
        _ => return (base_mean, base_std),
    };
    if !in_fire {
        return (base_mean, base_std);
    }
    let years_to_fire = (target_fire_age as i32 - current_age as i32).max(0) as f64;
    let years_in_retirement = (planning_horizon_age as i32 - target_fire_age as i32).max(1) as f64;
    let years_from_fire = (i as f64 - years_to_fire).max(0.0);
    let t = (years_from_fire / years_in_retirement).clamp(0.0, 1.0);
    let bond_pct = (gp.bond_allocation_at_fire
        + t * (gp.bond_allocation_at_horizon - gp.bond_allocation_at_fire))
        .clamp(0.0, 1.0);
    let stock_pct = 1.0 - bond_pct;
    (
        stock_pct * base_mean + bond_pct * gp.bond_return_rate,
        stock_pct * base_std,
    )
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    let idx = (sorted.len() as f64 * p).floor() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

// ─── Core FIRE Calculations ────────────────────────────────────────────────────

pub fn calculate_fire_target(settings: &FireSettings) -> f64 {
    let total_monthly =
        settings.monthly_expenses_at_fire + settings.healthcare_monthly_at_fire.unwrap_or(0.0);
    (total_monthly * 12.0) / settings.safe_withdrawal_rate
}

pub fn calculate_net_fire_target(settings: &FireSettings) -> f64 {
    let resolved = resolve_dc_payouts(
        &settings.additional_income_streams,
        settings.current_age,
        settings.target_fire_age,
        settings.safe_withdrawal_rate,
    );
    let income_at_fire_age: f64 = settings
        .additional_income_streams
        .iter()
        .filter(|s| s.start_age <= settings.target_fire_age)
        .map(|s| resolved.get(&s.id).copied().unwrap_or(s.monthly_amount))
        .sum();
    let total_monthly =
        settings.monthly_expenses_at_fire + settings.healthcare_monthly_at_fire.unwrap_or(0.0);
    let net_monthly = (total_monthly - income_at_fire_age).max(0.0);
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
            // Payout age reached: fund converted to annuity — zero out.
            // The snapshot for this year already captured the peak balance (read before this step).
            balances.insert(s.id.clone(), 0.0);
        }
    }
}

// ─── Deterministic Projection ──────────────────────────────────────────────────

pub fn project_fire_date(settings: &FireSettings, current_portfolio: f64) -> FireProjection {
    let resolved_payouts = resolve_dc_payouts(
        &settings.additional_income_streams,
        settings.current_age,
        settings.target_fire_age,
        settings.safe_withdrawal_rate,
    );
    let real_fire_target = calculate_net_fire_target(settings);
    let coast_amount = calculate_coast_fire_amount(settings);
    let start_year = chrono::Local::now().year() as u32;
    let horizon_years =
        (settings.planning_horizon_age as i32 - settings.current_age as i32).max(1) as u32;
    let contrib_growth = settings
        .salary_growth_rate
        .unwrap_or(settings.contribution_growth_rate);

    let mut portfolio = current_portfolio;
    let mut fire_age: Option<u32> = None;
    let mut fire_year: Option<u32> = None;
    let mut portfolio_at_fire = 0.0;
    let mut funded_at_retirement = false;
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

        // Trigger retirement when FI target reached OR forced by target_fire_age.
        // fire_age is only set when FI is actually reached (portfolio >= target).
        let nominal_fire_target = real_fire_target * (1.0 + settings.inflation_rate).powi(i as i32);
        if !in_fire {
            let fi_reached = portfolio >= nominal_fire_target;
            let age_forced = age >= settings.target_fire_age;
            if fi_reached || age_forced {
                in_fire = true;
                if fi_reached {
                    fire_age = Some(age);
                    fire_year = Some(year);
                }
                funded_at_retirement = fi_reached;
                portfolio_at_fire = portfolio;
            }
        }

        // Year-specific return accounting for glide path
        let (r, _) = blended_return_params(settings, i, in_fire);

        if in_fire {
            let annual_living = settings.monthly_expenses_at_fire
                * 12.0
                * (1.0 + settings.inflation_rate).powi(i as i32);
            let annual_healthcare = healthcare_cost_at_year(settings, i);
            let annual_expenses = annual_living + annual_healthcare;
            let annual_income = additional_income_at_age(
                &settings.additional_income_streams,
                &resolved_payouts,
                age,
                i,
                settings.inflation_rate,
                None,
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
        funded_at_retirement,
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
    let planning_horizon_age = settings.planning_horizon_age;
    let inflation_rate = settings.inflation_rate;
    let monthly_expenses = settings.monthly_expenses_at_fire;
    let monthly_contribution = settings.monthly_contribution;
    let swr = settings.safe_withdrawal_rate;
    let healthcare_monthly = settings.healthcare_monthly_at_fire.unwrap_or(0.0);
    let healthcare_rate = settings
        .healthcare_inflation_rate
        .unwrap_or(settings.inflation_rate);
    let glide_path = settings.glide_path.clone();
    // Pension accumulation is deterministic — resolve DC payouts once, share across all sims.
    let resolved_payouts = resolve_dc_payouts(
        &settings.additional_income_streams,
        current_age,
        target_fire_age,
        swr,
    );

    // paths[sim] = (year_values, survived, fi_age)
    // fi_age: age when portfolio first reached the FIRE target (None if never reached)
    let sim_results: Vec<(Vec<f64>, bool, Option<u32>)> = (0..n_sims)
        .into_par_iter()
        .map(|_| {
            let mut rng = rand::thread_rng();
            let mut portfolio = current_portfolio;
            let mut in_fire = false;
            let mut sim_fi_age: Option<u32> = None;
            let mut portfolio_at_retirement_start = current_portfolio;
            let mut path = Vec::with_capacity(horizon_years as usize + 1);
            let mut cumulative_inflation = 1.0_f64;

            for i in 0..=horizon_years {
                let age = current_age + i;
                path.push(portfolio.max(0.0));

                let nominal_fire_target = real_fire_target * (1.0 + inflation_rate).powi(i as i32);
                if !in_fire {
                    let fi_reached = portfolio >= nominal_fire_target;
                    let age_forced = age >= target_fire_age;
                    if fi_reached || age_forced {
                        in_fire = true;
                        portfolio_at_retirement_start = portfolio;
                        if fi_reached {
                            sim_fi_age = Some(age);
                        }
                    }
                }

                // Glide-path-blended return distribution for this year
                let (eff_mean, eff_std) = blended_return_params_mc(
                    mean,
                    std_dev,
                    current_age,
                    target_fire_age,
                    planning_horizon_age,
                    glide_path.as_ref(),
                    i,
                    in_fire,
                );
                let annual_return = sample_return(&mut rng, eff_mean, eff_std);

                if in_fire {
                    let annual_living = monthly_expenses * 12.0 * cumulative_inflation;
                    let annual_healthcare =
                        healthcare_monthly * 12.0 * (1.0 + healthcare_rate).powi(i as i32);
                    let annual_expenses = annual_living + annual_healthcare;
                    // Pass cumulative_inflation so inflation-indexed income tracks the same
                    // stochastic path as expenses (fixes systematic inflation asymmetry).
                    let annual_income = additional_income_at_age(
                        &streams,
                        &resolved_payouts,
                        age,
                        i,
                        inflation_rate,
                        Some(cumulative_inflation),
                    );
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

                cumulative_inflation *= 1.0 + sample_inflation(&mut rng, inflation_rate);
            }

            // For constant-percentage, the portfolio never mathematically hits 0,
            // so define failure as dropping below 5% of the starting retirement value.
            let survived = if use_constant_pct {
                portfolio > portfolio_at_retirement_start * 0.05
            } else {
                portfolio > 0.0
            };
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
    let resolved_payouts = resolve_dc_payouts(
        &settings.additional_income_streams,
        settings.current_age,
        settings.target_fire_age,
        settings.safe_withdrawal_rate,
    );
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
                let annual_living = settings.monthly_expenses_at_fire
                    * 12.0
                    * (1.0 + settings.inflation_rate).powi(years_from_now as i32);
                let annual_healthcare = healthcare_cost_at_year(settings, years_from_now);
                let annual_expenses = annual_living + annual_healthcare;
                let annual_income = additional_income_at_age(
                    &settings.additional_income_streams,
                    &resolved_payouts,
                    age,
                    years_from_now,
                    settings.inflation_rate,
                    None,
                );
                let net_withdrawal = if use_constant_pct {
                    settings.safe_withdrawal_rate * portfolio
                } else {
                    (annual_expenses - annual_income).max(0.0)
                };
                // Use scenario returns[i] but blend with glide path for the base-return component.
                // For non-base scenarios the shock return overrides the actual return for that year;
                // in subsequent years the scenario return already embeds the recovery premium.
                let (glide_mean, _) = blended_return_params(settings, years_from_now, true);
                let effective_return = if (returns[i] - r).abs() < 1e-9 {
                    // "normal" year: use glide-path-adjusted mean
                    glide_mean
                } else {
                    // shock or recovery year: keep scenario return as-is
                    returns[i]
                };
                portfolio = (portfolio * (1.0 + effective_return) - net_withdrawal).max(0.0);
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
            linked_goal_id: None,
            healthcare_monthly_at_fire: None,
            healthcare_inflation_rate: None,
            glide_path: None,
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
            stream_type: None,
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
            stream_type: None,
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
        assert_eq!(result.age_axis.last(), Some(&s.planning_horizon_age));
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
