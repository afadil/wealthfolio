use crate::errors::Result;
use crate::goals::goals_model::{
    AccountValuationMap, Goal, GoalCachedUpdate, GoalFundingRule, GoalFundingRuleInput, GoalPlan,
    NewGoal, SaveGoalPlan,
};
use crate::goals::goals_traits::{GoalRepositoryTrait, GoalServiceTrait};
use crate::planning::{SaveUpInput, SaveUpOverview};
use crate::portfolio::fire::{
    calculate_net_fire_target, FireSettings, RetirementOverview, StreamType,
};
use async_trait::async_trait;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

// ─── Shared helpers ──────────────────────────────────────────────────────────

/// Extract account IDs linked to defined-contribution income streams from FIRE settings.
fn extract_dc_linked_account_ids(settings: &FireSettings) -> HashSet<String> {
    settings
        .additional_income_streams
        .iter()
        .filter(|s| s.stream_type == Some(StreamType::DefinedContribution))
        .filter_map(|s| s.linked_account_id.clone())
        .collect()
}

/// Compute the residual portfolio value for a retirement goal.
///
/// For each eligible account, subtracts explicit reservations from other goals,
/// and excludes accounts linked to DC income streams (tracked separately by FIRE engine).
fn compute_residual_portfolio_value(
    funding_rules: &[GoalFundingRule],
    all_active_rules: &[GoalFundingRule],
    valuations: &AccountValuationMap,
    dc_linked_accounts: &HashSet<String>,
) -> f64 {
    // Sum explicit_reservation percentages per account across all goals
    let mut account_reservations: HashMap<&str, f64> = HashMap::new();
    for r in all_active_rules {
        if r.funding_role == "explicit_reservation" {
            if let Some(pct) = r.reservation_percent {
                *account_reservations.entry(&r.account_id).or_default() += pct;
            }
        }
    }

    let residual_for = |account_id: &str, value: f64| -> f64 {
        if dc_linked_accounts.contains(account_id) {
            return 0.0;
        }
        let reserved = account_reservations.get(account_id).copied().unwrap_or(0.0);
        value * (1.0 - reserved / 100.0).max(0.0)
    };

    if funding_rules.is_empty() {
        // No funding rules — fall back to all accounts (residual of each)
        valuations.iter().map(|(id, &v)| residual_for(id, v)).sum()
    } else {
        funding_rules
            .iter()
            .filter(|r| r.funding_role == "residual_eligible")
            .filter_map(|r| {
                valuations
                    .get(&r.account_id)
                    .map(|&v| residual_for(&r.account_id, v))
            })
            .sum()
    }
}

pub struct GoalService<T: GoalRepositoryTrait> {
    goal_repo: Arc<T>,
}

impl<T: GoalRepositoryTrait> GoalService<T> {
    pub fn new(goal_repo: Arc<T>) -> Self {
        GoalService { goal_repo }
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
                    if let Some(streams) = settings
                        .get("additionalIncomeStreams")
                        .and_then(|s| s.as_array())
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
            // Retirement: residual funding (excludes DC-linked accounts)
            let all_rules = self.goal_repo.load_all_active_funding_rules()?;
            let dc_linked = self
                .goal_repo
                .load_goal_plan(goal_id)?
                .and_then(|p| serde_json::from_str::<FireSettings>(&p.settings_json).ok())
                .map(|s| extract_dc_linked_account_ids(&s))
                .unwrap_or_default();
            compute_residual_portfolio_value(&rules, &all_rules, valuations, &dc_linked)
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
            // Compute net FIRE target using the full engine (accounts for income stream offsets)
            let plan = self.goal_repo.load_goal_plan(goal_id)?;
            if let Some(p) = plan {
                serde_json::from_str::<FireSettings>(&p.settings_json)
                    .ok()
                    .map(|s| calculate_net_fire_target(&s, s.target_fire_age))
            } else {
                goal.target_amount_cached
            }
        } else {
            goal.target_amount.or(goal.target_amount_cached)
        };

        let progress = match target {
            Some(t) if t > 0.0 => Some((current_value / t).min(1.0)),
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
        let goal = self.goal_repo.load_goal(goal_id)?;
        let plan = self.goal_repo.load_goal_plan(goal_id)?.ok_or_else(|| {
            crate::errors::ValidationError::InvalidInput(format!(
                "No plan found for goal {}",
                goal_id
            ))
        })?;
        let funding_rules = self.goal_repo.load_funding_rules(goal_id)?;
        let all_rules = self.goal_repo.load_all_active_funding_rules()?;

        let settings: FireSettings = serde_json::from_str(&plan.settings_json)?;

        // Compute funded portfolio value using shared residual logic (excludes DC-linked accounts)
        let dc_linked = extract_dc_linked_account_ids(&settings);
        let current_portfolio =
            compute_residual_portfolio_value(&funding_rules, &all_rules, valuation_map, &dc_linked);

        let _ = goal; // goal loaded for validation; not needed further
        let mode = plan.planner_mode.as_deref().unwrap_or("fire");
        Ok(crate::portfolio::fire::compute_retirement_overview(
            &settings,
            current_portfolio,
            mode,
        ))
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
