use crate::accounts::{Account, AccountServiceTrait};
use crate::errors::Result;
use crate::goals::goals_model::{
    AccountValuationMap, Goal, GoalFundingRule, GoalFundingRuleInput, GoalPlan, GoalSummaryUpdate,
    NewGoal, PreparedRetirementSimulationInput, SaveGoalPlan,
};
use crate::goals::goals_traits::{GoalRepositoryTrait, GoalServiceTrait};
use crate::planning::retirement::{
    normalize_retirement_plan_ages, RetirementPlan, RetirementTimingMode, TaxBucketBalances,
    TaxProfile,
};
use crate::planning::{SaveUpInput, SaveUpOverview};
use crate::portfolio::fire::{compute_retirement_overview_with_mode, RetirementOverview};
use async_trait::async_trait;
use chrono::{Local, Months};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

const RETIREMENT_ELIGIBLE_ACCOUNT_TYPES: &[&str] = &["SECURITIES", "CASH", "CRYPTOCURRENCY"];
const GOAL_LIFECYCLE_ACTIVE: &str = "active";
const GOAL_LIFECYCLE_ACHIEVED: &str = "achieved";
const GOAL_LIFECYCLE_ARCHIVED: &str = "archived";

// ─── Shared helpers ──────────────────────────────────────────────────────────

fn extract_plan_dc_linked_account_ids(plan: &RetirementPlan) -> HashSet<String> {
    plan.income_streams
        .iter()
        .filter(|s| s.stream_type == crate::planning::retirement::StreamKind::DefinedContribution)
        .filter_map(|s| s.linked_account_id.clone())
        .collect()
}

fn compute_goal_value_from_shares(
    funding_rules: &[GoalFundingRule],
    valuations: &AccountValuationMap,
) -> f64 {
    funding_rules
        .iter()
        .filter_map(|r| {
            valuations
                .get(&r.account_id)
                .map(|&v| v * r.share_percent / 100.0)
        })
        .sum()
}

fn build_account_share_totals(rules: &[GoalFundingRule]) -> HashMap<String, f64> {
    let mut totals = HashMap::new();
    for rule in rules {
        *totals.entry(rule.account_id.clone()).or_default() += rule.share_percent;
    }
    totals
}

fn build_retirement_seed_rules(
    eligible_accounts: &[Account],
    participating_rules: &[GoalFundingRule],
) -> Vec<GoalFundingRuleInput> {
    let existing_share_totals = build_account_share_totals(participating_rules);

    eligible_accounts
        .iter()
        .filter(|a| RETIREMENT_ELIGIBLE_ACCOUNT_TYPES.contains(&a.account_type.as_str()))
        .filter_map(|a| {
            let remaining_share = (100.0
                - existing_share_totals.get(&a.id).copied().unwrap_or(0.0))
            .clamp(0.0, 100.0);
            (remaining_share > 0.0).then(|| GoalFundingRuleInput {
                account_id: a.id.clone(),
                share_percent: remaining_share,
                tax_bucket: None,
            })
        })
        .collect()
}

fn date_for_plan_age(plan: &RetirementPlan, age: u32) -> Option<String> {
    let years = age.checked_sub(plan.personal.current_age)?;
    let today = Local::now().date_naive();
    today
        .checked_add_months(Months::new(years.saturating_mul(12)))
        .map(|date| date.format("%Y-%m-%d").to_string())
}

fn compute_summary_current_value(
    goal: &Goal,
    funding_rules: &[GoalFundingRule],
    valuations: &AccountValuationMap,
) -> f64 {
    if matches!(
        goal.status_lifecycle.as_str(),
        GOAL_LIFECYCLE_ACHIEVED | GOAL_LIFECYCLE_ARCHIVED
    ) {
        goal.summary_current_value
            .unwrap_or_else(|| compute_goal_value_from_shares(funding_rules, valuations))
    } else {
        compute_goal_value_from_shares(funding_rules, valuations)
    }
}

fn validate_goal_lifecycle(status_lifecycle: &str) -> Result<()> {
    if matches!(
        status_lifecycle,
        GOAL_LIFECYCLE_ACTIVE | GOAL_LIFECYCLE_ACHIEVED | GOAL_LIFECYCLE_ARCHIVED
    ) {
        Ok(())
    } else {
        Err(crate::errors::ValidationError::InvalidInput(format!(
            "Unsupported goal lifecycle '{}'",
            status_lifecycle
        ))
        .into())
    }
}

fn compute_tax_bucket_balances(
    funding_rules: &[GoalFundingRule],
    valuations: &AccountValuationMap,
) -> TaxBucketBalances {
    let mut balances = TaxBucketBalances::default();
    for rule in funding_rules {
        if let Some(&value) = valuations.get(&rule.account_id) {
            let share_value = value * rule.share_percent / 100.0;
            if share_value <= 0.0 {
                continue;
            }
            match rule.tax_bucket.as_deref() {
                Some("tax_deferred") | Some("tax-deferred") => balances.tax_deferred += share_value,
                Some("tax_free") | Some("tax-free") => balances.tax_free += share_value,
                _ => balances.taxable += share_value,
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
    if plan
        .expenses
        .all_buckets()
        .iter()
        .any(|(bucket, _)| bucket.monthly_amount < 0.0)
    {
        return Err(crate::errors::ValidationError::InvalidInput(
            "Retirement spending cannot be negative".into(),
        )
        .into());
    }
    let i = &plan.investment;
    let valid_return = |r: f64| (-0.20..=0.30).contains(&r);
    if !valid_return(i.pre_retirement_annual_return) || !valid_return(i.retirement_annual_return) {
        return Err(crate::errors::ValidationError::InvalidInput(
            "Return assumptions must be between -20% and 30%".into(),
        )
        .into());
    }
    if !(0.0..=0.05).contains(&i.annual_investment_fee_rate) {
        return Err(crate::errors::ValidationError::InvalidInput(
            "Annual investment fee must be between 0% and 5%".into(),
        )
        .into());
    }
    if !(0.0..=0.50).contains(&i.annual_volatility) {
        return Err(crate::errors::ValidationError::InvalidInput(
            "Annual volatility must be between 0% and 50%".into(),
        )
        .into());
    }
    if i.pre_retirement_annual_return - i.annual_investment_fee_rate <= -0.99
        || i.retirement_annual_return - i.annual_investment_fee_rate <= -0.99
    {
        return Err(crate::errors::ValidationError::InvalidInput(
            "Return after fees must be greater than -99%".into(),
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
    // Reject duplicate linkedAccountId values across DC streams
    let dc_linked_ids: Vec<&str> = plan
        .income_streams
        .iter()
        .filter(|s| s.stream_type == crate::planning::retirement::StreamKind::DefinedContribution)
        .filter_map(|s| s.linked_account_id.as_deref())
        .collect();
    let mut seen = HashSet::new();
    for id in &dc_linked_ids {
        if !seen.insert(*id) {
            return Err(crate::errors::ValidationError::InvalidInput(format!(
                "Duplicate linked account '{}' across DC income streams",
                id
            ))
            .into());
        }
    }
    Ok(())
}

pub struct GoalService<T: GoalRepositoryTrait> {
    goal_repo: Arc<T>,
    account_service: Arc<dyn AccountServiceTrait>,
}

impl<T: GoalRepositoryTrait> GoalService<T> {
    pub fn new(goal_repo: Arc<T>, account_service: Arc<dyn AccountServiceTrait>) -> Self {
        GoalService {
            goal_repo,
            account_service,
        }
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
        let planner_mode =
            RetirementTimingMode::from_str(stored_plan.planner_mode.as_deref().unwrap_or("fire"));

        let mut retirement_plan: RetirementPlan = serde_json::from_str(&stored_plan.settings_json)?;
        normalize_retirement_plan_ages(&mut retirement_plan);
        validate_retirement_plan(&retirement_plan)?;

        let current_portfolio = compute_goal_value_from_shares(&funding_rules, valuation_map);
        let bucket_balances = compute_tax_bucket_balances(&funding_rules, valuation_map);

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
        let is_retirement = new_goal.goal_type == "retirement";
        if let Some(status_lifecycle) = new_goal.status_lifecycle.as_deref() {
            validate_goal_lifecycle(status_lifecycle)?;
        }

        if is_retirement {
            let goals = self.goal_repo.load_goals()?;
            let existing = goals.iter().any(|g| {
                g.goal_type == "retirement" && g.status_lifecycle != GOAL_LIFECYCLE_ARCHIVED
            });
            if existing {
                return Err(crate::errors::ValidationError::InvalidInput(
                    "Only one active retirement goal is allowed".to_string(),
                )
                .into());
            }
        }

        if is_retirement {
            let eligible = self.account_service.get_active_non_archived_accounts()?;
            let participating_rules = self.goal_repo.load_participating_funding_rules()?;
            let seed_rules = build_retirement_seed_rules(&eligible, &participating_rules);
            self.goal_repo
                .insert_goal_with_funding(new_goal, seed_rules)
                .await
        } else {
            self.goal_repo.insert_new_goal(new_goal).await
        }
    }

    async fn update_goal(&self, updated_goal_data: Goal) -> Result<Goal> {
        let existing = self.goal_repo.load_goal(&updated_goal_data.id)?;
        if existing.goal_type != updated_goal_data.goal_type {
            return Err(crate::errors::ValidationError::InvalidInput(
                "Goal type cannot be changed after creation".to_string(),
            )
            .into());
        }
        validate_goal_lifecycle(&updated_goal_data.status_lifecycle)?;
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

        // Reject duplicate accountId entries
        let mut seen_accounts = HashSet::new();
        for rule in &rules {
            if !seen_accounts.insert(&rule.account_id) {
                return Err(crate::errors::ValidationError::InvalidInput(format!(
                    "Duplicate account '{}' in funding rules",
                    rule.account_id
                ))
                .into());
            }
        }

        // Validate share_percent range
        for rule in &rules {
            if !(0.0..=100.0).contains(&rule.share_percent) {
                return Err(crate::errors::ValidationError::InvalidInput(
                    "share_percent must be between 0 and 100".to_string(),
                )
                .into());
            }
        }

        // Clear tax_bucket for non-retirement goals
        let rules: Vec<GoalFundingRuleInput> = if is_retirement {
            rules
        } else {
            rules
                .into_iter()
                .map(|mut r| {
                    r.tax_bucket = None;
                    r
                })
                .collect()
        };

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

        // Validate per-account share sum <= 100% across all participating goals
        let participating_rules = self.goal_repo.load_participating_funding_rules()?;
        let mut account_totals: HashMap<String, f64> = HashMap::new();
        for r in &participating_rules {
            if r.goal_id != goal_id {
                *account_totals.entry(r.account_id.clone()).or_default() += r.share_percent;
            }
        }
        for rule in &rules {
            let total = account_totals.entry(rule.account_id.clone()).or_default();
            let used_elsewhere = *total;
            let combined = used_elsewhere + rule.share_percent;
            if combined > 100.0 {
                let max_available = (100.0 - used_elsewhere).max(0.0);
                return Err(crate::errors::ValidationError::InvalidInput(format!(
                    "Account '{}' is overallocated: requested {:.1}%, used elsewhere {:.1}%, max available {:.1}%",
                    rule.account_id, rule.share_percent, used_elsewhere, max_available
                ))
                .into());
            }
            *total = combined;
        }

        self.goal_repo.save_goal_funding(goal_id, rules).await
    }

    fn get_goal_plan(&self, goal_id: &str) -> Result<Option<GoalPlan>> {
        self.goal_repo.load_goal_plan(goal_id)
    }

    async fn save_goal_plan(&self, mut plan: SaveGoalPlan) -> Result<GoalPlan> {
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
        if plan.plan_kind == "retirement" {
            let mut retirement_plan: RetirementPlan = serde_json::from_str(&plan.settings_json)
                .map_err(|e| {
                    crate::errors::ValidationError::InvalidInput(format!(
                        "Invalid retirement plan JSON: {}",
                        e
                    ))
                })?;
            normalize_retirement_plan_ages(&mut retirement_plan);
            validate_retirement_plan(&retirement_plan)?;

            // Reject linking a DC stream to an account that has participating shares
            let dc_linked = extract_plan_dc_linked_account_ids(&retirement_plan);
            if !dc_linked.is_empty() {
                let participating = self.goal_repo.load_participating_funding_rules()?;
                for account_id in &dc_linked {
                    if participating.iter().any(|r| r.account_id == *account_id) {
                        return Err(crate::errors::ValidationError::InvalidInput(format!(
                            "Account '{}' has participating goal shares and cannot be linked as DC",
                            account_id
                        ))
                        .into());
                    }
                }
            }
            plan.settings_json = serde_json::to_string(&retirement_plan)?;
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

        let current_value = compute_summary_current_value(&goal, &rules, valuations);

        let retirement_summary = if is_retirement {
            self.prepare_retirement_input(goal_id, valuations)
                .ok()
                .map(|prepared| {
                    let overview = compute_retirement_overview_with_mode(
                        &prepared.plan,
                        prepared.current_portfolio,
                        prepared.planner_mode,
                    );
                    let completion_age = match prepared.planner_mode {
                        RetirementTimingMode::Fire => overview
                            .fi_age
                            .or(overview.suggested_goal_age_if_unchanged)
                            .unwrap_or(prepared.plan.personal.target_retirement_age),
                        RetirementTimingMode::Traditional => {
                            prepared.plan.personal.target_retirement_age
                        }
                    };
                    (
                        overview.required_capital_at_goal_age,
                        date_for_plan_age(&prepared.plan, completion_age),
                    )
                })
        } else {
            None
        };

        // Determine target
        let target = if is_retirement {
            retirement_summary
                .as_ref()
                .map(|(target, _)| *target)
                .or(goal.summary_target_amount)
        } else {
            goal.target_amount.or(goal.summary_target_amount)
        };

        let progress = match target {
            Some(t) if t > 0.0 => Some((current_value / t).min(1.0_f64)),
            _ => None,
        };

        let health = if goal.status_lifecycle == GOAL_LIFECYCLE_ACHIEVED {
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

        let update = GoalSummaryUpdate {
            summary_target_amount: target,
            summary_current_value: Some(current_value),
            summary_progress: progress,
            projected_completion_date: retirement_summary
                .and_then(|(_, date)| date)
                .or(goal.projected_completion_date.clone()),
            projected_value_at_target_date: goal.projected_value_at_target_date,
            status_health: health,
        };

        self.goal_repo
            .update_goal_summary_fields(goal_id, update)
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

        let current_value = compute_summary_current_value(&goal, &funding_rules, valuation_map);

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
    use chrono::NaiveDateTime;

    fn test_account(id: &str, account_type: &str) -> Account {
        Account {
            id: id.into(),
            name: format!("Account {id}"),
            account_type: account_type.into(),
            group: None,
            currency: "USD".into(),
            is_default: false,
            is_active: true,
            created_at: NaiveDateTime::default(),
            updated_at: NaiveDateTime::default(),
            platform_id: None,
            account_number: None,
            meta: None,
            provider: None,
            provider_account_id: None,
            is_archived: false,
            tracking_mode: crate::accounts::TrackingMode::NotSet,
        }
    }

    fn test_goal(status_lifecycle: &str, summary_current_value: Option<f64>) -> Goal {
        Goal {
            id: "goal-1".into(),
            goal_type: "custom_save_up".into(),
            title: "Goal".into(),
            description: None,
            target_amount: Some(100_000.0),
            status_lifecycle: status_lifecycle.into(),
            status_health: "not_applicable".into(),
            priority: 0,
            cover_image_key: None,
            currency: Some("USD".into()),
            start_date: None,
            target_date: None,
            summary_current_value,
            summary_progress: None,
            projected_completion_date: None,
            projected_value_at_target_date: None,
            created_at: String::new(),
            updated_at: String::new(),
            summary_target_amount: None,
        }
    }

    fn share_rule(goal_id: &str, account_id: &str, pct: f64) -> GoalFundingRule {
        GoalFundingRule {
            id: format!("r-{}-{}", goal_id, account_id),
            goal_id: goal_id.into(),
            account_id: account_id.into(),
            share_percent: pct,
            tax_bucket: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn share_value_basic() {
        let rules = vec![share_rule("g1", "acct-1", 70.0)];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        let v = compute_goal_value_from_shares(&rules, &vals);
        assert!((v - 70_000.0).abs() < 0.01, "70% of 100k = {}", v);
    }

    #[test]
    fn share_value_multiple_accounts() {
        let rules = vec![
            share_rule("g1", "acct-1", 70.0),
            share_rule("g1", "acct-2", 30.0),
        ];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        vals.insert("acct-2".into(), 200_000.0);
        let v = compute_goal_value_from_shares(&rules, &vals);
        // 100k*0.70 + 200k*0.30 = 70k + 60k = 130k
        assert!((v - 130_000.0).abs() < 0.01, "multi-account: {}", v);
    }

    #[test]
    fn share_value_empty_rules_is_zero() {
        let rules: Vec<GoalFundingRule> = vec![];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        let v = compute_goal_value_from_shares(&rules, &vals);
        assert!((v).abs() < 0.01, "empty rules: {}", v);
    }

    #[test]
    fn share_value_missing_account_ignored() {
        let rules = vec![share_rule("g1", "missing", 100.0)];
        let vals = HashMap::new();
        let v = compute_goal_value_from_shares(&rules, &vals);
        assert!((v).abs() < 0.01, "missing account: {}", v);
    }

    #[test]
    fn tax_bucket_balances_from_shares() {
        let rules = vec![
            GoalFundingRule {
                tax_bucket: Some("tax_deferred".into()),
                ..share_rule("g1", "acct-1", 100.0)
            },
            GoalFundingRule {
                tax_bucket: Some("tax_free".into()),
                ..share_rule("g1", "acct-2", 50.0)
            },
            GoalFundingRule {
                tax_bucket: Some("taxable".into()),
                ..share_rule("g1", "acct-3", 100.0)
            },
        ];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 100_000.0);
        vals.insert("acct-2".into(), 80_000.0);
        vals.insert("acct-3".into(), 60_000.0);

        let b = compute_tax_bucket_balances(&rules, &vals);
        assert!((b.tax_deferred - 100_000.0).abs() < 0.01);
        assert!((b.tax_free - 40_000.0).abs() < 0.01);
        assert!((b.taxable - 60_000.0).abs() < 0.01);
    }

    #[test]
    fn tax_bucket_defaults_to_taxable() {
        let rules = vec![share_rule("g1", "acct-1", 100.0)];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 50_000.0);

        let b = compute_tax_bucket_balances(&rules, &vals);
        assert!((b.taxable - 50_000.0).abs() < 0.01);
        assert!((b.tax_deferred).abs() < 0.01);
        assert!((b.tax_free).abs() < 0.01);
    }

    #[test]
    fn retirement_seed_rules_use_remaining_capacity() {
        let eligible_accounts = vec![
            test_account("acct-1", "SECURITIES"),
            test_account("acct-2", "CASH"),
            test_account("acct-3", "CRYPTOCURRENCY"),
            test_account("acct-4", "OTHER"),
        ];
        let participating_rules = vec![
            share_rule("goal-a", "acct-1", 30.0),
            share_rule("goal-b", "acct-2", 100.0),
            share_rule("goal-c", "acct-3", 80.0),
        ];

        let seed_rules = build_retirement_seed_rules(&eligible_accounts, &participating_rules);
        let shares_by_account: HashMap<String, f64> = seed_rules
            .into_iter()
            .map(|rule| (rule.account_id, rule.share_percent))
            .collect();

        assert_eq!(shares_by_account.get("acct-1"), Some(&70.0));
        assert_eq!(shares_by_account.get("acct-3"), Some(&20.0));
        assert!(!shares_by_account.contains_key("acct-2"));
        assert!(!shares_by_account.contains_key("acct-4"));
    }

    #[test]
    fn achieved_summary_value_uses_persisted_summary_value() {
        let goal = test_goal("achieved", Some(42_000.0));
        let rules = vec![share_rule("goal-1", "acct-1", 100.0)];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 80_000.0);

        let current_value = compute_summary_current_value(&goal, &rules, &vals);
        assert!((current_value - 42_000.0).abs() < 0.01);
    }

    #[test]
    fn active_summary_value_uses_live_share_value() {
        let goal = test_goal("active", Some(42_000.0));
        let rules = vec![share_rule("goal-1", "acct-1", 100.0)];
        let mut vals = HashMap::new();
        vals.insert("acct-1".into(), 80_000.0);

        let current_value = compute_summary_current_value(&goal, &rules, &vals);
        assert!((current_value - 80_000.0).abs() < 0.01);
    }
}
