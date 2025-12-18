use crate::accounts::AccountRepositoryTrait;
use crate::errors::{Result, ValidationError};
use crate::goals::goals_model::{
    AccountFreeCash, Goal, GoalContribution, GoalContributionWithStatus, GoalWithContributions,
    NewGoal, NewGoalContribution,
};
use crate::goals::goals_traits::{GoalRepositoryTrait, GoalServiceTrait};
use crate::portfolio::valuation::ValuationRepositoryTrait;
use async_trait::async_trait;
use rust_decimal::prelude::ToPrimitive;
use std::collections::HashMap;
use std::sync::Arc;

pub struct GoalService<
    G: GoalRepositoryTrait,
    A: AccountRepositoryTrait,
    V: ValuationRepositoryTrait,
> {
    goal_repo: Arc<G>,
    account_repo: Arc<A>,
    valuation_repo: Arc<V>,
}

impl<G: GoalRepositoryTrait, A: AccountRepositoryTrait, V: ValuationRepositoryTrait>
    GoalService<G, A, V>
{
    pub fn new(goal_repo: Arc<G>, account_repo: Arc<A>, valuation_repo: Arc<V>) -> Self {
        GoalService {
            goal_repo,
            account_repo,
            valuation_repo,
        }
    }

    /// Calculate free cash for given accounts
    fn calculate_free_cash_map(
        &self,
        account_ids: &[String],
    ) -> Result<HashMap<String, AccountFreeCash>> {
        // Get all accounts
        let accounts = self.account_repo.list(None, Some(account_ids))?;

        // Get latest valuations for all accounts
        let valuations = self.valuation_repo.get_latest_valuations(account_ids)?;
        let valuation_map: HashMap<String, f64> = valuations
            .into_iter()
            .map(|v| (v.account_id.clone(), v.cash_balance.to_f64().unwrap_or(0.0)))
            .collect();

        let mut result = HashMap::new();

        for account in accounts {
            let cash_balance = valuation_map.get(&account.id).copied().unwrap_or(0.0);
            let total_contributions = self
                .goal_repo
                .get_total_contributions_for_account(&account.id)?;

            result.insert(
                account.id.clone(),
                AccountFreeCash {
                    account_id: account.id.clone(),
                    account_name: account.name.clone(),
                    account_currency: account.currency.clone(),
                    cash_balance,
                    total_contributions,
                    free_cash: cash_balance - total_contributions,
                },
            );
        }

        Ok(result)
    }

    /// Enrich contributions with at-risk status
    fn enrich_contributions(
        &self,
        contributions: Vec<GoalContribution>,
        free_cash_map: &HashMap<String, AccountFreeCash>,
        accounts_map: &HashMap<String, (String, String)>, // account_id -> (name, currency)
    ) -> Vec<GoalContributionWithStatus> {
        contributions
            .into_iter()
            .map(|c| {
                let (account_name, account_currency) = accounts_map
                    .get(&c.account_id)
                    .cloned()
                    .unwrap_or_else(|| ("Unknown".to_string(), "USD".to_string()));

                let free_cash_info = free_cash_map.get(&c.account_id);
                let is_at_risk = free_cash_info
                    .map(|fc| fc.free_cash < 0.0)
                    .unwrap_or(false);
                let at_risk_amount = free_cash_info
                    .filter(|fc| fc.free_cash < 0.0)
                    .map(|fc| fc.free_cash.abs());

                GoalContributionWithStatus {
                    id: c.id,
                    goal_id: c.goal_id,
                    account_id: c.account_id,
                    account_name,
                    account_currency,
                    amount: c.amount,
                    contributed_at: c.contributed_at,
                    is_at_risk,
                    at_risk_amount,
                }
            })
            .collect()
    }
}

#[async_trait]
impl<
        G: GoalRepositoryTrait + Send + Sync,
        A: AccountRepositoryTrait + Send + Sync,
        V: ValuationRepositoryTrait + Send + Sync,
    > GoalServiceTrait for GoalService<G, A, V>
{
    fn get_goals(&self) -> Result<Vec<Goal>> {
        self.goal_repo.load_goals()
    }

    async fn create_goal(&self, new_goal: NewGoal) -> Result<Goal> {
        self.goal_repo.insert_new_goal(new_goal).await
    }

    async fn update_goal(&self, updated_goal_data: Goal) -> Result<Goal> {
        self.goal_repo.update_goal(updated_goal_data).await
    }

    async fn delete_goal(&self, goal_id_to_delete: String) -> Result<usize> {
        self.goal_repo.delete_goal(goal_id_to_delete).await
    }

    fn get_goals_with_contributions(&self) -> Result<Vec<GoalWithContributions>> {
        let goals = self.goal_repo.load_goals()?;
        let all_contributions = self.goal_repo.load_contributions_for_non_achieved_goals()?;

        // Get all accounts for name/currency lookup
        let accounts = self.account_repo.list(None, None)?;
        let accounts_map: HashMap<String, (String, String)> = accounts
            .iter()
            .map(|a| (a.id.clone(), (a.name.clone(), a.currency.clone())))
            .collect();

        // Get all unique account IDs from contributions
        let account_ids: Vec<String> = all_contributions
            .iter()
            .map(|c| c.account_id.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        // Calculate free cash for all accounts with contributions
        let free_cash_map = if account_ids.is_empty() {
            HashMap::new()
        } else {
            self.calculate_free_cash_map(&account_ids)?
        };

        // Group contributions by goal
        let mut contributions_by_goal: HashMap<String, Vec<GoalContribution>> = HashMap::new();
        for contribution in all_contributions {
            contributions_by_goal
                .entry(contribution.goal_id.clone())
                .or_default()
                .push(contribution);
        }

        // Build result for non-achieved goals
        let result: Vec<GoalWithContributions> = goals
            .into_iter()
            .filter(|g| !g.is_achieved)
            .map(|goal| {
                let goal_contributions = contributions_by_goal
                    .remove(&goal.id)
                    .unwrap_or_default();

                let total_contributed: f64 = goal_contributions.iter().map(|c| c.amount).sum();
                let progress = if goal.target_amount > 0.0 {
                    total_contributed / goal.target_amount
                } else {
                    0.0
                };

                let enriched_contributions =
                    self.enrich_contributions(goal_contributions, &free_cash_map, &accounts_map);

                let has_at_risk = enriched_contributions.iter().any(|c| c.is_at_risk);

                GoalWithContributions {
                    goal,
                    contributions: enriched_contributions,
                    total_contributed,
                    progress,
                    has_at_risk_contributions: has_at_risk,
                }
            })
            .collect();

        Ok(result)
    }

    fn get_account_free_cash(&self, account_ids: &[String]) -> Result<Vec<AccountFreeCash>> {
        let map = self.calculate_free_cash_map(account_ids)?;
        Ok(map.into_values().collect())
    }

    async fn add_contribution(
        &self,
        contribution: NewGoalContribution,
    ) -> Result<GoalContributionWithStatus> {
        // Validate contribution doesn't exceed free cash
        let free_cash_map = self.calculate_free_cash_map(&[contribution.account_id.clone()])?;

        if let Some(fc) = free_cash_map.get(&contribution.account_id) {
            if contribution.amount > fc.free_cash {
                return Err(ValidationError::InvalidInput(format!(
                    "Contribution amount ({:.2}) exceeds available free cash ({:.2})",
                    contribution.amount, fc.free_cash
                ))
                .into());
            }
        } else {
            return Err(
                ValidationError::InvalidInput("Account not found or has no valuation data".to_string())
                    .into(),
            );
        }

        let inserted = self.goal_repo.insert_contribution(contribution).await?;

        // Get account info for response
        let accounts = self.account_repo.list(None, Some(&[inserted.account_id.clone()]))?;
        let account = accounts.first();
        let (account_name, account_currency) = account
            .map(|a| (a.name.clone(), a.currency.clone()))
            .unwrap_or_else(|| ("Unknown".to_string(), "USD".to_string()));

        Ok(GoalContributionWithStatus {
            id: inserted.id,
            goal_id: inserted.goal_id,
            account_id: inserted.account_id,
            account_name,
            account_currency,
            amount: inserted.amount,
            contributed_at: inserted.contributed_at,
            is_at_risk: false,
            at_risk_amount: None,
        })
    }

    async fn remove_contribution(&self, contribution_id: &str) -> Result<usize> {
        self.goal_repo.delete_contribution(contribution_id).await
    }
}
