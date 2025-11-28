use crate::categories::categories_traits::CategoryRepositoryTrait;
use crate::category_rules::category_rules_model::{
    CategoryMatch, CategoryRule, CategoryRuleWithNames, MatchType, NewCategoryRule, UpdateCategoryRule,
};
use crate::category_rules::category_rules_traits::{CategoryRuleRepositoryTrait, CategoryRuleServiceTrait};
use crate::errors::{Error, Result, ValidationError};
use async_trait::async_trait;
use std::sync::Arc;

pub struct CategoryRuleService<R: CategoryRuleRepositoryTrait, C: CategoryRepositoryTrait> {
    rule_repo: Arc<R>,
    category_repo: Arc<C>,
}

impl<R: CategoryRuleRepositoryTrait, C: CategoryRepositoryTrait> CategoryRuleService<R, C> {
    pub fn new(rule_repo: Arc<R>, category_repo: Arc<C>) -> Self {
        CategoryRuleService {
            rule_repo,
            category_repo,
        }
    }
}

#[async_trait]
impl<R: CategoryRuleRepositoryTrait + Send + Sync, C: CategoryRepositoryTrait + Send + Sync>
    CategoryRuleServiceTrait for CategoryRuleService<R, C>
{
    fn get_all_rules(&self) -> Result<Vec<CategoryRule>> {
        self.rule_repo.get_all_rules()
    }

    fn get_all_rules_with_names(&self) -> Result<Vec<CategoryRuleWithNames>> {
        let rules = self.rule_repo.get_all_rules()?;
        let categories = self.category_repo.get_all_categories()?;

        let rules_with_names = rules
            .into_iter()
            .map(|rule| {
                let category_name = categories
                    .iter()
                    .find(|c| c.id == rule.category_id)
                    .map(|c| c.name.clone())
                    .unwrap_or_else(|| "Unknown".to_string());

                let sub_category_name = rule.sub_category_id.as_ref().and_then(|sub_id| {
                    categories
                        .iter()
                        .find(|c| &c.id == sub_id)
                        .map(|c| c.name.clone())
                });

                CategoryRuleWithNames {
                    rule,
                    category_name,
                    sub_category_name,
                }
            })
            .collect();

        Ok(rules_with_names)
    }

    fn get_rule_by_id(&self, id: &str) -> Result<CategoryRule> {
        self.rule_repo
            .get_rule_by_id(id)?
            .ok_or_else(|| Error::Validation(ValidationError::InvalidInput(format!("Rule not found: {}", id))))
    }

    fn get_rules_for_account(&self, account_id: Option<&str>) -> Result<Vec<CategoryRule>> {
        match account_id {
            Some(id) => self.rule_repo.get_rules_by_account(id),
            None => self.rule_repo.get_global_rules(),
        }
    }

    async fn create_rule(&self, new_rule: NewCategoryRule) -> Result<CategoryRule> {
        if self.category_repo.get_category_by_id(&new_rule.category_id)?.is_none() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Category not found".to_string(),
            )));
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

    async fn update_rule(&self, id: &str, update: UpdateCategoryRule) -> Result<CategoryRule> {
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
    ) -> Result<Option<CategoryMatch>> {
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
    ) -> Result<Vec<Option<CategoryMatch>>> {
        let all_rules = self.rule_repo.get_all_rules()?;

        let results = transactions
            .into_iter()
            .map(|(name, account_id)| {
                let applicable_rules: Vec<&CategoryRule> = all_rules
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
        };

        Ok(result)
    }
}
