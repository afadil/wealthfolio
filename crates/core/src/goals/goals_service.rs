use crate::errors::Result;
use crate::goals::goals_model::{
    AccountValuationMap, Goal, GoalCachedUpdate, GoalFundingRule, GoalFundingRuleInput, GoalPlan,
    NewGoal, SaveGoalPlan,
};
use crate::goals::goals_traits::{GoalRepositoryTrait, GoalServiceTrait};
use crate::portfolio::fire::{calculate_net_fire_target, FireSettings};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;

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
            // Retirement: residual funding
            let all_rules = self.goal_repo.load_all_active_funding_rules()?;
            let mut account_reservations: HashMap<String, f64> = HashMap::new();
            for r in &all_rules {
                if r.funding_role == "explicit_reservation" {
                    if let Some(pct) = r.reservation_percent {
                        *account_reservations
                            .entry(r.account_id.clone())
                            .or_default() += pct;
                    }
                }
            }

            if rules.is_empty() {
                // No funding rules configured yet — fall back to all accounts
                // (residual of each after explicit reservations by other goals)
                let mut total = 0.0;
                for (account_id, &v) in valuations {
                    let reserved = account_reservations.get(account_id).copied().unwrap_or(0.0);
                    let residual = (1.0 - reserved / 100.0).max(0.0);
                    total += v * residual;
                }
                total
            } else {
                let mut total = 0.0;
                for rule in &rules {
                    if rule.funding_role == "residual_eligible" {
                        if let Some(&v) = valuations.get(&rule.account_id) {
                            let reserved = account_reservations
                                .get(&rule.account_id)
                                .copied()
                                .unwrap_or(0.0);
                            let residual = (1.0 - reserved / 100.0).max(0.0);
                            total += v * residual;
                        }
                    }
                }
                total
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
}
