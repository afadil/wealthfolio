use crate::errors::Result;
use crate::goals::goals_model::{
    AccountValuationMap, Goal, GoalCachedUpdate, GoalFundingRule, GoalFundingRuleInput, GoalPlan,
    NewGoal, PreparedRetirementSimulationInput, SaveGoalPlan,
};
use crate::goals::goals_traits::{GoalRepositoryTrait, GoalServiceTrait};
use crate::planning::retirement::{
    RetirementPlan, RetirementTimingMode, TaxBucketBalances, TaxProfile,
};
use crate::planning::{SaveUpInput, SaveUpOverview};
use crate::portfolio::fire::{
    compute_required_capital, compute_retirement_overview_with_mode, RetirementOverview,
};
use async_trait::async_trait;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

// ─── Shared helpers ──────────────────────────────────────────────────────────

/// Extract DC-linked account IDs from a `RetirementPlan`.
fn extract_plan_dc_linked_account_ids(
    plan: &crate::planning::retirement::RetirementPlan,
) -> HashSet<String> {
    plan.income_streams
        .iter()
        .filter(|s| s.stream_type == crate::planning::retirement::StreamKind::DefinedContribution)
        .filter_map(|s| s.linked_account_id.clone())
        .collect()
}

/// Compute the residual portfolio value for a retirement goal.
///
/// For each eligible account, subtracts explicit reservations from other goals,
/// and excludes accounts linked to DC income streams (tracked separately by FIRE engine).
fn build_account_reservations(all_active_rules: &[GoalFundingRule]) -> HashMap<&str, f64> {
    let mut account_reservations: HashMap<&str, f64> = HashMap::new();
    for r in all_active_rules {
        if r.funding_role == "explicit_reservation" {
            if let Some(pct) = r.reservation_percent {
                *account_reservations.entry(&r.account_id).or_default() += pct;
            }
        }
    }
    account_reservations
}

fn residual_value_for(
    account_id: &str,
    value: f64,
    account_reservations: &HashMap<&str, f64>,
    dc_linked_accounts: &HashSet<String>,
) -> f64 {
    if dc_linked_accounts.contains(account_id) {
        return 0.0;
    }
    let reserved = account_reservations.get(account_id).copied().unwrap_or(0.0);
    value * (1.0 - reserved / 100.0).max(0.0)
}

fn compute_residual_portfolio_value(
    funding_rules: &[GoalFundingRule],
    all_active_rules: &[GoalFundingRule],
    valuations: &AccountValuationMap,
    dc_linked_accounts: &HashSet<String>,
) -> f64 {
    let account_reservations = build_account_reservations(all_active_rules);

    if funding_rules.is_empty() {
        // No funding rules — fall back to all accounts (residual of each)
        valuations
            .iter()
            .map(|(id, &v)| residual_value_for(id, v, &account_reservations, dc_linked_accounts))
            .sum()
    } else {
        funding_rules
            .iter()
            .filter(|r| r.funding_role == "residual_eligible")
            .filter_map(|r| {
                valuations.get(&r.account_id).map(|&v| {
                    let countable = r.countable_percent.unwrap_or(100.0) / 100.0;
                    residual_value_for(&r.account_id, v, &account_reservations, dc_linked_accounts)
                        * countable
                })
            })
            .sum()
    }
}

/// Compute blended effective tax rate from the same residual/countable balances
/// that feed the retirement engine.
fn compute_effective_tax_rate(
    funding_rules: &[GoalFundingRule],
    all_active_rules: &[GoalFundingRule],
    valuations: &AccountValuationMap,
    dc_linked_accounts: &HashSet<String>,
    tax: &Option<TaxProfile>,
) -> Option<f64> {
    let profile = match tax {
        Some(p) => p,
        None => return None,
    };
    let account_reservations = build_account_reservations(all_active_rules);
    let mut total_value = 0.0;
    let mut weighted_rate = 0.0;
    for rule in funding_rules
        .iter()
        .filter(|r| r.funding_role == "residual_eligible")
    {
        if let Some(&val) = valuations.get(&rule.account_id) {
            let countable = rule.countable_percent.unwrap_or(100.0) / 100.0;
            let v = residual_value_for(
                &rule.account_id,
                val,
                &account_reservations,
                dc_linked_accounts,
            ) * countable;
            if v <= 0.0 {
                continue;
            }
            let rate = match rule.tax_bucket.as_deref() {
                Some("tax_deferred") | Some("tax-deferred") => profile.tax_deferred_withdrawal_rate,
                Some("tax_free") | Some("tax-free") => profile.tax_free_withdrawal_rate,
                Some("taxable") | Some("unknown") | None => profile.taxable_withdrawal_rate,
                _ => profile.taxable_withdrawal_rate,
            };
            weighted_rate += v * rate;
            total_value += v;
        }
    }
    if total_value > 0.0 {
        Some(weighted_rate / total_value)
    } else {
        None
    }
}

fn compute_tax_bucket_balances(
    funding_rules: &[GoalFundingRule],
    all_active_rules: &[GoalFundingRule],
    valuations: &AccountValuationMap,
    dc_linked_accounts: &HashSet<String>,
) -> TaxBucketBalances {
    let account_reservations = build_account_reservations(all_active_rules);

    if funding_rules.is_empty() {
        let taxable = valuations
            .iter()
            .map(|(id, &v)| residual_value_for(id, v, &account_reservations, dc_linked_accounts))
            .sum();
        return TaxBucketBalances {
            taxable,
            tax_deferred: 0.0,
            tax_free: 0.0,
        };
    }

    let mut balances = TaxBucketBalances::default();
    for rule in funding_rules
        .iter()
        .filter(|r| r.funding_role == "residual_eligible")
    {
        if let Some(&value) = valuations.get(&rule.account_id) {
            let countable = rule.countable_percent.unwrap_or(100.0) / 100.0;
            let usable = residual_value_for(
                &rule.account_id,
                value,
                &account_reservations,
                dc_linked_accounts,
            ) * countable;
            if usable <= 0.0 {
                continue;
            }
            match rule.tax_bucket.as_deref() {
                Some("tax_deferred") | Some("tax-deferred") => balances.tax_deferred += usable,
                Some("tax_free") | Some("tax-free") => balances.tax_free += usable,
                _ => balances.taxable += usable,
            }
        }
    }
    balances
}

pub fn validate_retirement_plan(plan: &RetirementPlan) -> Result<()> {
    let p = &plan.personal;
    if p.current_age >= p.planning_horizon_age {
        return Err(crate::errors::ValidationError::InvalidInput(
            "Current age must be less than planning horizon".into(),
        )
        .into());
    }
    if p.target_retirement_age <= p.current_age {
        return Err(crate::errors::ValidationError::InvalidInput(
            "Target retirement age must be after current age".into(),
        )
        .into());
    }
    if p.target_retirement_age > p.planning_horizon_age {
        return Err(crate::errors::ValidationError::InvalidInput(
            "Target retirement age must be before planning horizon".into(),
        )
        .into());
    }
    let w = &plan.withdrawal;
    if w.safe_withdrawal_rate <= 0.0 || w.safe_withdrawal_rate > 0.20 {
        return Err(crate::errors::ValidationError::InvalidInput(
            "SWR must be between 0% and 20%".into(),
        )
        .into());
    }
    if plan.expenses.living.monthly_amount < 0.0 {
        return Err(crate::errors::ValidationError::InvalidInput(
            "Living expenses cannot be negative".into(),
        )
        .into());
    }
    if let Some(ref g) = w.guardrails {
        if g.floor_rate >= g.ceiling_rate {
            return Err(crate::errors::ValidationError::InvalidInput(
                "Guardrails floor must be below ceiling".into(),
            )
            .into());
        }
    }
    if let Some(ref tax) = plan.tax {
        let valid_rate = |r: f64| (0.0..=1.0).contains(&r);
        if !valid_rate(tax.taxable_withdrawal_rate)
            || !valid_rate(tax.tax_deferred_withdrawal_rate)
            || !valid_rate(tax.tax_free_withdrawal_rate)
        {
            return Err(crate::errors::ValidationError::InvalidInput(
                "Tax rates must be between 0% and 100%".into(),
            )
            .into());
        }
    }
    Ok(())
}

pub struct GoalService<T: GoalRepositoryTrait> {
    goal_repo: Arc<T>,
}

impl<T: GoalRepositoryTrait> GoalService<T> {
    pub fn new(goal_repo: Arc<T>) -> Self {
        GoalService { goal_repo }
    }

    fn prepare_retirement_input(
        &self,
        goal_id: &str,
        valuation_map: &AccountValuationMap,
    ) -> Result<PreparedRetirementSimulationInput> {
        let goal = self.goal_repo.load_goal(goal_id)?;
        if goal.goal_type != "retirement" {
            return Err(crate::errors::ValidationError::InvalidInput(format!(
                "Goal {} is not a retirement goal",
                goal_id
            ))
            .into());
        }

        let stored_plan = self.goal_repo.load_goal_plan(goal_id)?.ok_or_else(|| {
            crate::errors::ValidationError::InvalidInput(format!(
                "No plan found for goal {}",
                goal_id
            ))
        })?;
        let funding_rules = self.goal_repo.load_funding_rules(goal_id)?;
        let all_rules = self.goal_repo.load_all_active_funding_rules()?;
        let planner_mode =
            RetirementTimingMode::from_str(stored_plan.planner_mode.as_deref().unwrap_or("fire"));

        let mut retirement_plan: RetirementPlan = serde_json::from_str(&stored_plan.settings_json)?;
        validate_retirement_plan(&retirement_plan)?;

        let dc_linked = extract_plan_dc_linked_account_ids(&retirement_plan);
        let current_portfolio =
            compute_residual_portfolio_value(&funding_rules, &all_rules, valuation_map, &dc_linked);
        let bucket_balances =
            compute_tax_bucket_balances(&funding_rules, &all_rules, valuation_map, &dc_linked);
        let blended_rate = compute_effective_tax_rate(
            &funding_rules,
            &all_rules,
            valuation_map,
            &dc_linked,
            &retirement_plan.tax,
        );

        let tax = retirement_plan.tax.get_or_insert(TaxProfile {
            taxable_withdrawal_rate: 0.0,
            tax_deferred_withdrawal_rate: 0.0,
            tax_free_withdrawal_rate: 0.0,
            early_withdrawal_penalty_rate: None,
            early_withdrawal_penalty_age: None,
            country_code: None,
            withdrawal_buckets: TaxBucketBalances::default(),
        });
        tax.withdrawal_buckets = bucket_balances;

        if let Some(blended_rate) = blended_rate {
            tax.taxable_withdrawal_rate = blended_rate;
        }

        Ok(PreparedRetirementSimulationInput {
            plan: retirement_plan,
            current_portfolio,
            planner_mode,
        })
    }
}

#[async_trait]
impl<T: GoalRepositoryTrait + Send + Sync> GoalServiceTrait for GoalService<T> {
    fn get_goals(&self) -> Result<Vec<Goal>> {
        self.goal_repo.load_goals()
    }

    fn get_goal(&self, goal_id: &str) -> Result<Goal> {
        self.goal_repo.load_goal(goal_id)
    }

    async fn create_goal(&self, new_goal: NewGoal) -> Result<Goal> {
        // Enforce: only one non-archived retirement goal
        if new_goal.goal_type == "retirement" {
            let goals = self.goal_repo.load_goals()?;
            let existing = goals
                .iter()
                .any(|g| g.goal_type == "retirement" && !g.is_archived);
            if existing {
                return Err(crate::errors::ValidationError::InvalidInput(
                    "Only one active retirement goal is allowed".to_string(),
                )
                .into());
            }
        }
        self.goal_repo.insert_new_goal(new_goal).await
    }

    async fn update_goal(&self, updated_goal_data: Goal) -> Result<Goal> {
        self.goal_repo.update_goal(updated_goal_data).await
    }

    async fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize> {
        self.goal_repo.delete_goal(goal_id_to_delete).await
    }

    fn get_goal_funding(&self, goal_id: &str) -> Result<Vec<GoalFundingRule>> {
        self.goal_repo.load_funding_rules(goal_id)
    }

    async fn save_goal_funding(
        &self,
        goal_id: &str,
        rules: Vec<GoalFundingRuleInput>,
    ) -> Result<Vec<GoalFundingRule>> {
        let goal = self.goal_repo.load_goal(goal_id)?;
        let is_retirement = goal.goal_type == "retirement";

        // Validate funding_role matches goal type
        for rule in &rules {
            if is_retirement && rule.funding_role != "residual_eligible" {
                return Err(crate::errors::ValidationError::InvalidInput(
                    "Retirement goals only accept 'residual_eligible' funding rules".to_string(),
                )
                .into());
            }
            if !is_retirement && rule.funding_role != "explicit_reservation" {
                return Err(crate::errors::ValidationError::InvalidInput(
                    "Non-retirement goals only accept 'explicit_reservation' funding rules"
                        .to_string(),
                )
                .into());
            }
            if rule.funding_role == "residual_eligible" && rule.reservation_percent.is_some() {
                return Err(crate::errors::ValidationError::InvalidInput(
                    "Residual-eligible rules must not have reservation_percent".to_string(),
                )
                .into());
            }
            if rule.funding_role == "explicit_reservation" {
                match rule.reservation_percent {
                    Some(p) if !(0.0..=100.0).contains(&p) => {
                        return Err(crate::errors::ValidationError::InvalidInput(
                            "reservation_percent must be between 0 and 100".to_string(),
                        )
                        .into());
                    }
                    None => {
                        return Err(crate::errors::ValidationError::InvalidInput(
                            "explicit_reservation rules require reservation_percent".to_string(),
                        )
                        .into());
                    }
                    _ => {}
                }
            }
        }

        // Validate DC-linked accounts not in rules
        if is_retirement {
            if let Ok(Some(plan)) = self.goal_repo.load_goal_plan(goal_id) {
                if let Ok(settings) = serde_json::from_str::<serde_json::Value>(&plan.settings_json)
                {
                    if let Some(streams) = settings.get("incomeStreams").and_then(|s| s.as_array())
                    {
                        for stream in streams {
                            if let Some(linked) =
                                stream.get("linkedAccountId").and_then(|v| v.as_str())
                            {
                                if rules.iter().any(|r| r.account_id == linked) {
                                    return Err(crate::errors::ValidationError::InvalidInput(
                                        format!("Account '{}' is linked to a pension fund and cannot be added to funding rules", linked),
                                    ).into());
                                }
                            }
                        }
                    }
                }
            }
        }

        // Validate per-account reservation sum <= 100%
        if !is_retirement {
            let all_rules = self.goal_repo.load_all_active_funding_rules()?;
            // Sum existing reservations by account, excluding this goal's current rules
            let mut account_totals: HashMap<String, f64> = HashMap::new();
            for r in &all_rules {
                if r.goal_id != goal_id && r.funding_role == "explicit_reservation" {
                    if let Some(pct) = r.reservation_percent {
                        *account_totals.entry(r.account_id.clone()).or_default() += pct;
                    }
                }
            }
            // Add new rules
            for rule in &rules {
                if let Some(pct) = rule.reservation_percent {
                    let total = account_totals.entry(rule.account_id.clone()).or_default();
                    *total += pct;
                    if *total > 100.0 {
                        return Err(crate::errors::ValidationError::InvalidInput(format!(
                            "Total reservation for account '{}' would exceed 100%",
                            rule.account_id
                        ))
                        .into());
                    }
                }
            }
        }

        self.goal_repo.save_goal_funding(goal_id, rules).await
    }

    fn get_goal_plan(&self, goal_id: &str) -> Result<Option<GoalPlan>> {
        self.goal_repo.load_goal_plan(goal_id)
    }

    async fn save_goal_plan(&self, plan: SaveGoalPlan) -> Result<GoalPlan> {
        let goal = self.goal_repo.load_goal(&plan.goal_id)?;
        let valid = match goal.goal_type.as_str() {
            "retirement" => plan.plan_kind == "retirement",
            _ => plan.plan_kind == "save_up",
        };
        if !valid {
            return Err(crate::errors::ValidationError::InvalidInput(format!(
                "Plan kind '{}' is not valid for goal type '{}'",
                plan.plan_kind, goal.goal_type
            ))
            .into());
        }
        if plan.planner_mode.is_some() && plan.plan_kind != "retirement" {
            return Err(crate::errors::ValidationError::InvalidInput(
                "planner_mode is only valid for retirement plans".to_string(),
            )
            .into());
        }
        // Parse and validate retirement plan JSON before persisting
        if plan.plan_kind == "retirement" {
            let retirement_plan: RetirementPlan = serde_json::from_str(&plan.settings_json)
                .map_err(|e| {
                    crate::errors::ValidationError::InvalidInput(format!(
                        "Invalid retirement plan JSON: {}",
                        e
                    ))
                })?;
            validate_retirement_plan(&retirement_plan)?;
        }
        self.goal_repo.save_goal_plan(plan).await
    }

    async fn delete_goal_plan(&self, goal_id: &str) -> Result<usize> {
        self.goal_repo.delete_goal_plan(goal_id).await
    }

    async fn refresh_goal_summary(
        &self,
        goal_id: &str,
        valuations: &AccountValuationMap,
    ) -> Result<Goal> {
        let goal = self.goal_repo.load_goal(goal_id)?;
        let rules = self.goal_repo.load_funding_rules(goal_id)?;
        let is_retirement = goal.goal_type == "retirement";

        let current_value = if is_retirement {
            match self.prepare_retirement_input(goal_id, valuations) {
                Ok(prepared) => prepared.current_portfolio,
                Err(_) => {
                    let all_rules = self.goal_repo.load_all_active_funding_rules()?;
                    let dc_linked = self
                        .goal_repo
                        .load_goal_plan(goal_id)?
                        .and_then(|p| serde_json::from_str::<RetirementPlan>(&p.settings_json).ok())
                        .map(|rp| extract_plan_dc_linked_account_ids(&rp))
                        .unwrap_or_default();
                    compute_residual_portfolio_value(&rules, &all_rules, valuations, &dc_linked)
                }
            }
        } else {
            // Save-up: explicit reservation
            let mut total = 0.0;
            for rule in &rules {
                if let Some(pct) = rule.reservation_percent {
                    if let Some(&v) = valuations.get(&rule.account_id) {
                        total += v * pct / 100.0;
                    }
                }
            }
            total
        };

        // Determine target
        let target = if is_retirement {
            self.prepare_retirement_input(goal_id, valuations)
                .ok()
                .map(|prepared| {
                    compute_required_capital(&prepared.plan, prepared.plan.personal.current_age)
                })
                .or(goal.target_amount_cached)
        } else {
            goal.target_amount.or(goal.target_amount_cached)
        };

        let progress = match target {
            Some(t) if t > 0.0 => Some((current_value / t).min(1.0_f64)),
            _ => None,
        };

        let health = if goal.status_lifecycle == "achieved" {
            "on_track".to_string()
        } else {
            match (goal.projected_value_at_target_date, target) {
                (Some(proj), Some(t)) if t > 0.0 => {
                    let ratio = proj / t;
                    if ratio >= 1.0 {
                        "on_track"
                    } else if ratio >= 0.9 {
                        "at_risk"
                    } else {
                        "off_track"
                    }
                    .to_string()
                }
                _ => "not_applicable".to_string(),
            }
        };

        let update = GoalCachedUpdate {
            target_amount_cached: target,
            current_value_cached: Some(current_value),
            progress_cached: progress,
            projected_completion_date: goal.projected_completion_date.clone(),
            projected_value_at_target_date: goal.projected_value_at_target_date,
            status_health: health,
        };

        self.goal_repo
            .update_goal_cached_fields(goal_id, update)
            .await?;
        self.goal_repo.load_goal(goal_id)
    }

    async fn compute_retirement_overview(
        &self,
        goal_id: &str,
        valuation_map: &AccountValuationMap,
    ) -> Result<RetirementOverview> {
        let prepared = self.prepare_retirement_input(goal_id, valuation_map)?;
        let overview = compute_retirement_overview_with_mode(
            &prepared.plan,
            prepared.current_portfolio,
            prepared.planner_mode,
        );

        Ok(overview)
    }

    async fn prepare_retirement_simulation_input(
        &self,
        goal_id: &str,
        valuation_map: &AccountValuationMap,
    ) -> Result<PreparedRetirementSimulationInput> {
        self.prepare_retirement_input(goal_id, valuation_map)
    }

    async fn compute_save_up_overview(
        &self,
        goal_id: &str,
        valuation_map: &AccountValuationMap,
    ) -> Result<SaveUpOverview> {
        let goal = self.goal_repo.load_goal(goal_id)?;
        let plan = self.goal_repo.load_goal_plan(goal_id)?;
        let funding_rules = self.goal_repo.load_funding_rules(goal_id)?;

        // Compute current value from explicit reservations (same as refresh_goal_summary)
        let mut current_value = 0.0;
        for rule in &funding_rules {
            if let Some(pct) = rule.reservation_percent {
                if let Some(&v) = valuation_map.get(&rule.account_id) {
                    current_value += v * pct / 100.0;
                }
            }
        }

        // Parse settings from plan if it exists
        let (monthly_contribution, expected_return) = if let Some(p) = &plan {
            let settings: serde_json::Value = serde_json::from_str(&p.settings_json)?;
            (
                settings
                    .get("monthlyContribution")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0),
                settings
                    .get("expectedAnnualReturn")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.07),
            )
        } else {
            (0.0, 0.07)
        };

        let input = SaveUpInput {
            current_value,
            target_amount: goal.target_amount.unwrap_or(0.0),
            target_date: goal.target_date.clone(),
            monthly_contribution,
            expected_annual_return: expected_return,
        };

        Ok(crate::planning::compute_save_up_overview(&input))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::goals::goals_model::GoalFundingRule;

    fn rule(account_id: &str, countable: Option<f64>) -> GoalFundingRule {
        GoalFundingRule {
            id: format!("r-{}", account_id),
            goal_id: "goal-1".into(),
            account_id: account_id.into(),
            funding_role: "residual_eligible".into(),
            reservation_percent: None,
            countable_percent: countable,
            tax_bucket: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn reservation_rule(goal_id: &str, account_id: &str, pct: f64) -> GoalFundingRule {
        GoalFundingRule {
            id: format!("r-{}-{}", goal_id, account_id),
            goal_id: goal_id.into(),
            account_id: account_id.into(),
            funding_role: "explicit_reservation".into(),
            reservation_percent: Some(pct),
            countable_percent: None,
            tax_bucket: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn residual_excludes_dc_linked() {
        let rules = vec![rule("acct-1", None), rule("acct-2", None)];
        let all_rules = rules.clone();
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        vals.insert("acct-2".into(), 50_000.0);
        let dc_linked: HashSet<String> = ["acct-2".into()].into();

        let residual = compute_residual_portfolio_value(&rules, &all_rules, &vals, &dc_linked);
        assert!(
            (residual - 100_000.0).abs() < 0.01,
            "DC-linked acct-2 excluded: {}",
            residual
        );
    }

    #[test]
    fn residual_applies_reservations() {
        let rules = vec![rule("acct-1", None)];
        // Another goal reserves 30% of acct-1
        let all_rules = vec![
            rule("acct-1", None),
            reservation_rule("goal-2", "acct-1", 30.0),
        ];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        let dc_linked = HashSet::new();

        let residual = compute_residual_portfolio_value(&rules, &all_rules, &vals, &dc_linked);
        // 100k * (1 - 0.30) * 1.0 countable = 70k
        assert!(
            (residual - 70_000.0).abs() < 0.01,
            "30% reserved: {}",
            residual
        );
    }

    #[test]
    fn residual_empty_rules_falls_back_to_all() {
        let rules: Vec<GoalFundingRule> = vec![];
        let all_rules = vec![reservation_rule("goal-2", "acct-1", 20.0)];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        vals.insert("acct-2".into(), 50_000.0);
        let dc_linked = HashSet::new();

        let residual = compute_residual_portfolio_value(&rules, &all_rules, &vals, &dc_linked);
        // acct-1: 100k * 0.80 = 80k, acct-2: 50k * 1.0 = 50k → 130k
        assert!(
            (residual - 130_000.0).abs() < 0.01,
            "fallback all accounts: {}",
            residual
        );
    }

    #[test]
    fn residual_applies_countable_percent() {
        let rules = vec![rule("acct-1", Some(50.0))];
        let all_rules = rules.clone();
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        let dc_linked = HashSet::new();

        let residual = compute_residual_portfolio_value(&rules, &all_rules, &vals, &dc_linked);
        // 100k * 1.0 (no reservation) * 0.50 countable = 50k
        assert!(
            (residual - 50_000.0).abs() < 0.01,
            "50% countable: {}",
            residual
        );
    }

    #[test]
    fn residual_countable_and_reservation_combined() {
        let rules = vec![rule("acct-1", Some(80.0))];
        let all_rules = vec![
            rule("acct-1", Some(80.0)),
            reservation_rule("goal-2", "acct-1", 25.0),
        ];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        let dc_linked = HashSet::new();

        let residual = compute_residual_portfolio_value(&rules, &all_rules, &vals, &dc_linked);
        // 100k * (1 - 0.25) * 0.80 = 100k * 0.75 * 0.80 = 60k
        assert!(
            (residual - 60_000.0).abs() < 0.01,
            "reservation + countable: {}",
            residual
        );
    }

    #[test]
    fn blended_tax_rate_uses_residual_countable_values() {
        let rules = vec![
            GoalFundingRule {
                tax_bucket: Some("tax_deferred".into()),
                ..rule("acct-1", Some(50.0))
            },
            GoalFundingRule {
                tax_bucket: Some("tax_free".into()),
                ..rule("acct-2", None)
            },
        ];
        let all_rules = vec![
            rules[0].clone(),
            rules[1].clone(),
            reservation_rule("goal-2", "acct-2", 50.0),
        ];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        vals.insert("acct-2".into(), 100_000.0);
        let tax = Some(TaxProfile {
            taxable_withdrawal_rate: 0.10,
            tax_deferred_withdrawal_rate: 0.30,
            tax_free_withdrawal_rate: 0.0,
            early_withdrawal_penalty_rate: None,
            early_withdrawal_penalty_age: None,
            country_code: None,
            withdrawal_buckets: TaxBucketBalances::default(),
        });

        let blended =
            compute_effective_tax_rate(&rules, &all_rules, &vals, &HashSet::new(), &tax).unwrap();

        // acct-1 contributes 100k * 50% = 50k at 30%
        // acct-2 contributes 100k * 50% reserved = 50k at 0%
        // blended = (50k*0.30 + 50k*0.0) / 100k = 0.15
        assert!((blended - 0.15).abs() < 0.0001, "blended = {}", blended);
    }

    #[test]
    fn blended_tax_rate_excludes_dc_linked_accounts() {
        let rules = vec![
            GoalFundingRule {
                tax_bucket: Some("tax_deferred".into()),
                ..rule("acct-1", None)
            },
            GoalFundingRule {
                tax_bucket: Some("taxable".into()),
                ..rule("acct-2", None)
            },
        ];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        vals.insert("acct-2".into(), 100_000.0);
        let dc_linked: HashSet<String> = ["acct-2".into()].into();
        let tax = Some(TaxProfile {
            taxable_withdrawal_rate: 0.05,
            tax_deferred_withdrawal_rate: 0.25,
            tax_free_withdrawal_rate: 0.0,
            early_withdrawal_penalty_rate: None,
            early_withdrawal_penalty_age: None,
            country_code: None,
            withdrawal_buckets: TaxBucketBalances::default(),
        });

        let blended = compute_effective_tax_rate(&rules, &rules, &vals, &dc_linked, &tax).unwrap();

        assert!((blended - 0.25).abs() < 0.0001, "blended = {}", blended);
    }
}
