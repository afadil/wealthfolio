use crate::categories::categories_traits::CategoryRepositoryTrait;
use crate::activity_rules::activity_rules_model::{
    ActivityRule, ActivityRuleMatch, ActivityRuleWithNames, MatchType, NewActivityRule, UpdateActivityRule,
};
use crate::activity_rules::activity_rules_traits::{ActivityRuleRepositoryTrait, ActivityRuleServiceTrait};
use crate::errors::{Error, Result, ValidationError};
use async_trait::async_trait;
use regex::Regex;
use std::sync::Arc;

pub struct ActivityRuleService<R: ActivityRuleRepositoryTrait, C: CategoryRepositoryTrait> {
    rule_repo: Arc<R>,
    category_repo: Arc<C>,
}

impl<R: ActivityRuleRepositoryTrait, C: CategoryRepositoryTrait> ActivityRuleService<R, C> {
    pub fn new(rule_repo: Arc<R>, category_repo: Arc<C>) -> Self {
        ActivityRuleService {
            rule_repo,
            category_repo,
        }
    }
}

#[async_trait]
impl<R: ActivityRuleRepositoryTrait + Send + Sync, C: CategoryRepositoryTrait + Send + Sync>
    ActivityRuleServiceTrait for ActivityRuleService<R, C>
{
    fn get_all_rules(&self) -> Result<Vec<ActivityRule>> {
        self.rule_repo.get_all_rules()
    }

    fn get_all_rules_with_names(&self) -> Result<Vec<ActivityRuleWithNames>> {
        let rules = self.rule_repo.get_all_rules()?;
        let categories = self.category_repo.get_all_categories()?;

        let rules_with_names = rules
            .into_iter()
            .map(|rule| {
                let category_name = rule.category_id.as_ref().and_then(|cat_id| {
                    categories
                        .iter()
                        .find(|c| &c.id == cat_id)
                        .map(|c| c.name.clone())
                });

                let sub_category_name = rule.sub_category_id.as_ref().and_then(|sub_id| {
                    categories
                        .iter()
                        .find(|c| &c.id == sub_id)
                        .map(|c| c.name.clone())
                });

                ActivityRuleWithNames {
                    rule,
                    category_name,
                    sub_category_name,
                }
            })
            .collect();

        Ok(rules_with_names)
    }

    fn get_rule_by_id(&self, id: &str) -> Result<ActivityRule> {
        self.rule_repo
            .get_rule_by_id(id)?
            .ok_or_else(|| Error::Validation(ValidationError::InvalidInput(format!("Rule not found: {}", id))))
    }

    fn get_rules_for_account(&self, account_id: Option<&str>) -> Result<Vec<ActivityRule>> {
        match account_id {
            Some(id) => self.rule_repo.get_rules_by_account(id),
            None => self.rule_repo.get_global_rules(),
        }
    }

    async fn create_rule(&self, new_rule: NewActivityRule) -> Result<ActivityRule> {
        if let Some(ref category_id) = new_rule.category_id {
            if self.category_repo.get_category_by_id(category_id)?.is_none() {
                return Err(Error::Validation(ValidationError::InvalidInput(
                    "Category not found".to_string(),
                )));
            }
        }

        if let Some(ref sub_id) = new_rule.sub_category_id {
            if self.category_repo.get_category_by_id(sub_id)?.is_none() {
                return Err(Error::Validation(ValidationError::InvalidInput(
                    "Subcategory not found".to_string(),
                )));
            }
        }

        self.rule_repo.create_rule(new_rule).await
    }

    async fn update_rule(&self, id: &str, update: UpdateActivityRule) -> Result<ActivityRule> {
        if let Some(ref category_id) = update.category_id {
            if self.category_repo.get_category_by_id(category_id)?.is_none() {
                return Err(Error::Validation(ValidationError::InvalidInput(
                    "Category not found".to_string(),
                )));
            }
        }

        self.rule_repo.update_rule(id, update).await
    }

    async fn delete_rule(&self, id: &str) -> Result<()> {
        self.rule_repo.delete_rule(id).await?;
        Ok(())
    }

    fn apply_rules(
        &self,
        transaction_name: &str,
        account_id: Option<&str>,
    ) -> Result<Option<ActivityRuleMatch>> {
        let rules = match account_id {
            Some(id) => self.rule_repo.get_rules_by_account(id)?,
            None => self.rule_repo.get_global_rules()?,
        };

        for rule in rules {
            if rule.applies_to_account(account_id) && rule.matches(transaction_name) {
                return Ok(Some(rule.to_match()));
            }
        }

        Ok(None)
    }

    fn bulk_apply_rules(
        &self,
        transactions: Vec<(String, Option<String>)>,
    ) -> Result<Vec<Option<ActivityRuleMatch>>> {
        let all_rules = self.rule_repo.get_all_rules()?;

        let results = transactions
            .into_iter()
            .map(|(name, account_id)| {
                let applicable_rules: Vec<&ActivityRule> = all_rules
                    .iter()
                    .filter(|r| r.applies_to_account(account_id.as_deref()))
                    .collect();

                for rule in applicable_rules {
                    if rule.matches(&name) {
                        return Some(rule.to_match());
                    }
                }
                None
            })
            .collect();

        Ok(results)
    }

    fn test_pattern(&self, pattern: &str, match_type: &str, test_text: &str) -> Result<bool> {
        let match_type_enum = MatchType::from_str(match_type);
        let normalized_text = test_text.to_lowercase().trim().to_string();
        let normalized_pattern = pattern.to_lowercase().trim().to_string();

        let result = match match_type_enum {
            MatchType::Contains => normalized_text.contains(&normalized_pattern),
            MatchType::StartsWith => normalized_text.starts_with(&normalized_pattern),
            MatchType::Exact => normalized_text == normalized_pattern,
            MatchType::Regex => {
                let pattern_with_flags = format!("(?i){}", pattern.trim());
                Regex::new(&pattern_with_flags)
                    .map(|re| re.is_match(test_text.trim()))
                    .unwrap_or(false)
            }
        };

        Ok(result)
    }
}
