use super::model::{
    GuardrailsConfig, TaxBucketBalances, TaxProfile, WithdrawalConfig, WithdrawalPolicy,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TaxBucketKind {
    Taxable,
    TaxDeferred,
    TaxFree,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct WithdrawalOutcome {
    pub remaining_buckets: TaxBucketBalances,
    pub gross_withdrawal: f64,
    pub spending_funded: f64,
    pub tax_amount: f64,
}

/// Build the retirement tax buckets used by the engine.
///
/// Prepared goal-based plans populate explicit bucket balances. Older/manual plans
/// fall back to "all taxable" so existing requests continue to run.
pub(crate) fn initial_withdrawal_buckets(
    tax: &Option<TaxProfile>,
    total_portfolio: f64,
) -> TaxBucketBalances {
    match tax {
        Some(profile) => profile.withdrawal_buckets.scale_to_total(total_portfolio),
        None => TaxBucketBalances {
            taxable: total_portfolio.max(0.0),
            tax_deferred: 0.0,
            tax_free: 0.0,
        },
    }
}

pub(crate) fn apply_growth(buckets: TaxBucketBalances, annual_return: f64) -> TaxBucketBalances {
    let growth = (1.0 + annual_return).max(0.0);
    TaxBucketBalances {
        taxable: buckets.taxable * growth,
        tax_deferred: buckets.tax_deferred * growth,
        tax_free: buckets.tax_free * growth,
    }
}

pub(crate) fn add_contribution(
    buckets: TaxBucketBalances,
    contribution: f64,
    tax: &Option<TaxProfile>,
) -> TaxBucketBalances {
    if contribution <= 0.0 {
        return buckets;
    }
    let allocation = match tax {
        Some(profile) => profile.withdrawal_buckets.scale_to_total(contribution),
        None => TaxBucketBalances {
            taxable: contribution,
            tax_deferred: 0.0,
            tax_free: 0.0,
        },
    };
    TaxBucketBalances {
        taxable: buckets.taxable + allocation.taxable,
        tax_deferred: buckets.tax_deferred + allocation.tax_deferred,
        tax_free: buckets.tax_free + allocation.tax_free,
    }
}

/// Gross up a net spending gap for taxes. Returns `(gross_withdrawal, tax_amount)`.
///
/// For bucket-aware plans this uses the configured withdrawal buckets in
/// taxable -> tax-deferred -> tax-free order.
pub(crate) fn compute_gross_withdrawal(
    spending_gap: f64,
    tax: &Option<TaxProfile>,
    age: u32,
) -> (f64, f64) {
    if spending_gap <= 0.0 {
        return (0.0, 0.0);
    }
    let available = match tax {
        Some(profile) if profile.withdrawal_buckets.total() > 0.0 => profile.withdrawal_buckets,
        Some(profile) => {
            let rate = effective_tax_rate(profile, TaxBucketKind::Taxable, age);
            let gross = spending_gap / (1.0 - rate);
            return (gross, gross - spending_gap);
        }
        None => return (spending_gap, 0.0),
    };
    let outcome = withdraw_for_net_target(spending_gap, available, tax, age);
    (outcome.gross_withdrawal, outcome.tax_amount)
}

/// Apply the withdrawal policy for one year.
pub(crate) fn apply_withdrawal_policy(
    config: &WithdrawalConfig,
    available_buckets: &TaxBucketBalances,
    total_expenses: f64,
    essential_expenses: f64,
    income: f64,
    tax: &Option<TaxProfile>,
    age: u32,
) -> WithdrawalOutcome {
    let available_total = available_buckets.total();
    match config.strategy {
        WithdrawalPolicy::ConstantPercentage => {
            let gross_target = config.safe_withdrawal_rate * available_total;
            withdraw_for_gross_target(gross_target, *available_buckets, tax, age)
        }
        WithdrawalPolicy::ConstantDollar => {
            let spending_gap = (total_expenses - income).max(0.0);
            withdraw_for_net_target(spending_gap, *available_buckets, tax, age)
        }
        WithdrawalPolicy::Guardrails => {
            let default_guardrails = GuardrailsConfig {
                ceiling_rate: config.safe_withdrawal_rate * 1.5,
                floor_rate: config.safe_withdrawal_rate * 0.8,
            };
            let guardrails = config.guardrails.as_ref().unwrap_or(&default_guardrails);

            let spending_gap = (total_expenses - income).max(0.0);
            let target = withdraw_for_net_target(spending_gap, *available_buckets, tax, age);
            if available_total <= 0.0 {
                return target;
            }

            let ratio = target.gross_withdrawal / available_total;
            if ratio > guardrails.ceiling_rate {
                let essential_gap = (essential_expenses - income).max(0.0);
                let essential =
                    withdraw_for_net_target(essential_gap, *available_buckets, tax, age);
                let ceiling = withdraw_for_gross_target(
                    available_total * guardrails.ceiling_rate,
                    *available_buckets,
                    tax,
                    age,
                );
                if ceiling.spending_funded < essential_gap * 0.999 {
                    essential
                } else {
                    ceiling
                }
            } else if ratio < guardrails.floor_rate {
                withdraw_for_gross_target(
                    available_total * guardrails.floor_rate,
                    *available_buckets,
                    tax,
                    age,
                )
            } else {
                target
            }
        }
    }
}

fn withdraw_for_net_target(
    net_target: f64,
    buckets: TaxBucketBalances,
    tax: &Option<TaxProfile>,
    age: u32,
) -> WithdrawalOutcome {
    if net_target <= 0.0 || buckets.total() <= 0.0 {
        return WithdrawalOutcome {
            remaining_buckets: buckets,
            gross_withdrawal: 0.0,
            spending_funded: 0.0,
            tax_amount: 0.0,
        };
    }

    let mut remaining = buckets;
    let mut remaining_net = net_target;
    let mut gross_withdrawal = 0.0;
    let mut spending_funded = 0.0;
    let mut tax_amount = 0.0;

    for kind in [
        TaxBucketKind::Taxable,
        TaxBucketKind::TaxDeferred,
        TaxBucketKind::TaxFree,
    ] {
        if remaining_net <= 0.0 {
            break;
        }
        let available_gross = bucket_balance(remaining, kind);
        if available_gross <= 0.0 {
            continue;
        }
        let rate = effective_tax_rate_for_kind(tax, kind, age);
        let net_per_gross = (1.0 - rate).max(0.01);
        let needed_gross = remaining_net / net_per_gross;
        let gross_from_bucket = available_gross.min(needed_gross);
        let net_from_bucket = gross_from_bucket * net_per_gross;

        set_bucket_balance(&mut remaining, kind, available_gross - gross_from_bucket);
        gross_withdrawal += gross_from_bucket;
        spending_funded += net_from_bucket;
        tax_amount += gross_from_bucket - net_from_bucket;
        remaining_net -= net_from_bucket;
    }

    WithdrawalOutcome {
        remaining_buckets: remaining,
        gross_withdrawal,
        spending_funded,
        tax_amount,
    }
}

fn withdraw_for_gross_target(
    gross_target: f64,
    buckets: TaxBucketBalances,
    tax: &Option<TaxProfile>,
    age: u32,
) -> WithdrawalOutcome {
    if gross_target <= 0.0 || buckets.total() <= 0.0 {
        return WithdrawalOutcome {
            remaining_buckets: buckets,
            gross_withdrawal: 0.0,
            spending_funded: 0.0,
            tax_amount: 0.0,
        };
    }

    let mut remaining = buckets;
    let mut remaining_gross = gross_target;
    let mut gross_withdrawal = 0.0;
    let mut spending_funded = 0.0;
    let mut tax_amount = 0.0;

    for kind in [
        TaxBucketKind::Taxable,
        TaxBucketKind::TaxDeferred,
        TaxBucketKind::TaxFree,
    ] {
        if remaining_gross <= 0.0 {
            break;
        }
        let available_gross = bucket_balance(remaining, kind);
        if available_gross <= 0.0 {
            continue;
        }
        let gross_from_bucket = available_gross.min(remaining_gross);
        let rate = effective_tax_rate_for_kind(tax, kind, age);
        let tax_from_bucket = gross_from_bucket * rate;
        let net_from_bucket = gross_from_bucket - tax_from_bucket;

        set_bucket_balance(&mut remaining, kind, available_gross - gross_from_bucket);
        gross_withdrawal += gross_from_bucket;
        spending_funded += net_from_bucket;
        tax_amount += tax_from_bucket;
        remaining_gross -= gross_from_bucket;
    }

    WithdrawalOutcome {
        remaining_buckets: remaining,
        gross_withdrawal,
        spending_funded,
        tax_amount,
    }
}

fn effective_tax_rate_for_kind(tax: &Option<TaxProfile>, kind: TaxBucketKind, age: u32) -> f64 {
    tax.as_ref()
        .map(|profile| effective_tax_rate(profile, kind, age))
        .unwrap_or(0.0)
}

fn effective_tax_rate(profile: &TaxProfile, kind: TaxBucketKind, age: u32) -> f64 {
    let mut rate = match kind {
        TaxBucketKind::Taxable => profile.taxable_withdrawal_rate,
        TaxBucketKind::TaxDeferred => profile.tax_deferred_withdrawal_rate,
        TaxBucketKind::TaxFree => profile.tax_free_withdrawal_rate,
    };
    if kind == TaxBucketKind::TaxDeferred {
        if let (Some(penalty), Some(penalty_age)) = (
            profile.early_withdrawal_penalty_rate,
            profile.early_withdrawal_penalty_age,
        ) {
            if age < penalty_age {
                rate += penalty;
            }
        }
    }
    rate.clamp(0.0, 0.99)
}

fn bucket_balance(buckets: TaxBucketBalances, kind: TaxBucketKind) -> f64 {
    match kind {
        TaxBucketKind::Taxable => buckets.taxable,
        TaxBucketKind::TaxDeferred => buckets.tax_deferred,
        TaxBucketKind::TaxFree => buckets.tax_free,
    }
}

fn set_bucket_balance(buckets: &mut TaxBucketBalances, kind: TaxBucketKind, value: f64) {
    match kind {
        TaxBucketKind::Taxable => buckets.taxable = value.max(0.0),
        TaxBucketKind::TaxDeferred => buckets.tax_deferred = value.max(0.0),
        TaxBucketKind::TaxFree => buckets.tax_free = value.max(0.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::planning::retirement::*;

    fn tax_with_buckets() -> Option<TaxProfile> {
        Some(TaxProfile {
            taxable_withdrawal_rate: 0.20,
            tax_deferred_withdrawal_rate: 0.30,
            tax_free_withdrawal_rate: 0.0,
            early_withdrawal_penalty_rate: None,
            early_withdrawal_penalty_age: None,
            country_code: None,
            withdrawal_buckets: TaxBucketBalances {
                taxable: 50_000.0,
                tax_deferred: 50_000.0,
                tax_free: 0.0,
            },
        })
    }

    #[test]
    fn initial_buckets_fall_back_to_taxable() {
        let buckets = initial_withdrawal_buckets(&None, 100_000.0);
        assert_eq!(
            buckets,
            TaxBucketBalances {
                taxable: 100_000.0,
                tax_deferred: 0.0,
                tax_free: 0.0,
            }
        );
    }

    #[test]
    fn compute_gross_withdrawal_uses_bucket_order() {
        let (gross, tax_amt) = compute_gross_withdrawal(60_000.0, &tax_with_buckets(), 60);
        // 50k taxable at 20% funds 40k net, remaining 20k net from tax-deferred at 30% => 28,571 gross.
        assert!((gross - 78_571.43).abs() < 0.1, "gross = {}", gross);
        assert!((tax_amt - 18_571.43).abs() < 0.1, "tax = {}", tax_amt);
    }

    #[test]
    fn tax_early_withdrawal_penalty_hits_tax_deferred_only() {
        let tax = Some(TaxProfile {
            taxable_withdrawal_rate: 0.20,
            tax_deferred_withdrawal_rate: 0.20,
            tax_free_withdrawal_rate: 0.0,
            early_withdrawal_penalty_rate: Some(0.10),
            early_withdrawal_penalty_age: Some(59),
            country_code: None,
            withdrawal_buckets: TaxBucketBalances {
                taxable: 0.0,
                tax_deferred: 100_000.0,
                tax_free: 0.0,
            },
        });
        let (gross_early, _) = compute_gross_withdrawal(40_000.0, &tax, 50);
        let (gross_late, _) = compute_gross_withdrawal(40_000.0, &tax, 60);
        assert!(
            (gross_early - 57_142.86).abs() < 0.1,
            "early = {}",
            gross_early
        );
        assert!((gross_late - 50_000.0).abs() < 0.1, "late = {}", gross_late);
    }

    #[test]
    fn constant_dollar_returns_correct_tuple() {
        let config = WithdrawalConfig {
            safe_withdrawal_rate: 0.04,
            strategy: WithdrawalPolicy::ConstantDollar,
            guardrails: None,
        };
        let outcome = apply_withdrawal_policy(
            &config,
            &TaxBucketBalances {
                taxable: 50_000.0,
                tax_deferred: 50_000.0,
                tax_free: 0.0,
            },
            70_000.0,
            40_000.0,
            10_000.0,
            &tax_with_buckets(),
            65,
        );
        assert!(
            (outcome.gross_withdrawal - 78_571.43).abs() < 0.1,
            "gross = {}",
            outcome.gross_withdrawal
        );
        assert!(
            (outcome.spending_funded - 60_000.0).abs() < 0.1,
            "spending = {}",
            outcome.spending_funded
        );
        assert!((outcome.tax_amount - 18_571.43).abs() < 0.1);
    }

    #[test]
    fn constant_percentage_uses_gross_target() {
        let config = WithdrawalConfig {
            safe_withdrawal_rate: 0.04,
            strategy: WithdrawalPolicy::ConstantPercentage,
            guardrails: None,
        };
        let outcome = apply_withdrawal_policy(
            &config,
            &TaxBucketBalances {
                taxable: 1_000_000.0,
                tax_deferred: 0.0,
                tax_free: 0.0,
            },
            50_000.0,
            40_000.0,
            0.0,
            &Some(TaxProfile {
                taxable_withdrawal_rate: 0.20,
                tax_deferred_withdrawal_rate: 0.0,
                tax_free_withdrawal_rate: 0.0,
                early_withdrawal_penalty_rate: None,
                early_withdrawal_penalty_age: None,
                country_code: None,
                withdrawal_buckets: TaxBucketBalances {
                    taxable: 1_000_000.0,
                    tax_deferred: 0.0,
                    tax_free: 0.0,
                },
            }),
            65,
        );
        assert!((outcome.gross_withdrawal - 40_000.0).abs() < 0.01);
        assert!((outcome.spending_funded - 32_000.0).abs() < 0.01);
        assert!((outcome.tax_amount - 8_000.0).abs() < 0.01);
    }

    #[test]
    fn guardrails_ceiling_cuts_spending() {
        let config = WithdrawalConfig {
            safe_withdrawal_rate: 0.04,
            strategy: WithdrawalPolicy::Guardrails,
            guardrails: Some(GuardrailsConfig {
                ceiling_rate: 0.06,
                floor_rate: 0.03,
            }),
        };
        let outcome = apply_withdrawal_policy(
            &config,
            &TaxBucketBalances {
                taxable: 500_000.0,
                tax_deferred: 0.0,
                tax_free: 0.0,
            },
            50_000.0,
            30_000.0,
            0.0,
            &None,
            65,
        );
        assert!((outcome.gross_withdrawal - 30_000.0).abs() < 0.01);
    }

    #[test]
    fn guardrails_floor_raises_spending() {
        let config = WithdrawalConfig {
            safe_withdrawal_rate: 0.04,
            strategy: WithdrawalPolicy::Guardrails,
            guardrails: Some(GuardrailsConfig {
                ceiling_rate: 0.06,
                floor_rate: 0.03,
            }),
        };
        let outcome = apply_withdrawal_policy(
            &config,
            &TaxBucketBalances {
                taxable: 1_000_000.0,
                tax_deferred: 0.0,
                tax_free: 0.0,
            },
            10_000.0,
            10_000.0,
            0.0,
            &None,
            65,
        );
        assert!((outcome.gross_withdrawal - 30_000.0).abs() < 0.01);
    }

    #[test]
    fn guardrails_essential_floor_protects_basics() {
        let config = WithdrawalConfig {
            safe_withdrawal_rate: 0.04,
            strategy: WithdrawalPolicy::Guardrails,
            guardrails: Some(GuardrailsConfig {
                ceiling_rate: 0.02,
                floor_rate: 0.01,
            }),
        };
        let outcome = apply_withdrawal_policy(
            &config,
            &TaxBucketBalances {
                taxable: 500_000.0,
                tax_deferred: 0.0,
                tax_free: 0.0,
            },
            50_000.0,
            40_000.0,
            0.0,
            &None,
            65,
        );
        assert!(outcome.gross_withdrawal >= 39_999.0);
    }

    #[test]
    fn guardrails_tax_consistent_with_bucket_withdrawal() {
        let config = WithdrawalConfig {
            safe_withdrawal_rate: 0.04,
            strategy: WithdrawalPolicy::Guardrails,
            guardrails: Some(GuardrailsConfig {
                ceiling_rate: 0.06,
                floor_rate: 0.03,
            }),
        };
        let outcome = apply_withdrawal_policy(
            &config,
            &TaxBucketBalances {
                taxable: 1_000_000.0,
                tax_deferred: 0.0,
                tax_free: 0.0,
            },
            50_000.0,
            40_000.0,
            10_000.0,
            &Some(TaxProfile {
                taxable_withdrawal_rate: 0.20,
                tax_deferred_withdrawal_rate: 0.0,
                tax_free_withdrawal_rate: 0.0,
                early_withdrawal_penalty_rate: None,
                early_withdrawal_penalty_age: None,
                country_code: None,
                withdrawal_buckets: TaxBucketBalances {
                    taxable: 1_000_000.0,
                    tax_deferred: 0.0,
                    tax_free: 0.0,
                },
            }),
            65,
        );
        assert!(
            (outcome.tax_amount - outcome.gross_withdrawal * 0.20).abs() < 0.01,
            "tax = {}",
            outcome.tax_amount
        );
        assert!(
            (outcome.spending_funded - (outcome.gross_withdrawal - outcome.tax_amount)).abs()
                < 0.01
        );
    }

    #[test]
    fn no_tax_profile_passthrough() {
        let (gross, tax) = compute_gross_withdrawal(40_000.0, &None, 60);
        assert!((gross - 40_000.0).abs() < 0.01);
        assert!((tax - 0.0).abs() < 0.01);
    }

    #[test]
    fn contribution_allocation_uses_bucket_mix() {
        let buckets = add_contribution(TaxBucketBalances::default(), 100.0, &tax_with_buckets());
        assert!((buckets.taxable - 50.0).abs() < 0.01);
        assert!((buckets.tax_deferred - 50.0).abs() < 0.01);
        assert!((buckets.tax_free - 0.0).abs() < 0.01);
    }
}
