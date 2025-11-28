use crate::category_rules::category_rules_model::{
    CategoryMatch, CategoryRule, CategoryRuleWithNames, NewCategoryRule, UpdateCategoryRule,
};
use crate::errors::Result;
use async_trait::async_trait;

#[async_trait]
pub trait CategoryRuleRepositoryTrait: Send + Sync {
    fn get_all_rules(&self) -> Result<Vec<CategoryRule>>;
    fn get_rule_by_id(&self, id: &str) -> Result<Option<CategoryRule>>;
    fn get_global_rules(&self) -> Result<Vec<CategoryRule>>;
    fn get_rules_by_account(&self, account_id: &str) -> Result<Vec<CategoryRule>>;
    fn get_rules_by_category(&self, category_id: &str) -> Result<Vec<CategoryRule>>;
    async fn create_rule(&self, new_rule: NewCategoryRule) -> Result<CategoryRule>;
    async fn update_rule(&self, id: &str, update: UpdateCategoryRule) -> Result<CategoryRule>;
    async fn delete_rule(&self, id: &str) -> Result<usize>;
    fn get_max_priority(&self) -> Result<i32>;
}

#[async_trait]
pub trait CategoryRuleServiceTrait: Send + Sync {
    fn get_all_rules(&self) -> Result<Vec<CategoryRule>>;
    fn get_all_rules_with_names(&self) -> Result<Vec<CategoryRuleWithNames>>;
    fn get_rule_by_id(&self, id: &str) -> Result<CategoryRule>;
    fn get_rules_for_account(&self, account_id: Option<&str>) -> Result<Vec<CategoryRule>>;
    async fn create_rule(&self, new_rule: NewCategoryRule) -> Result<CategoryRule>;
    async fn update_rule(&self, id: &str, update: UpdateCategoryRule) -> Result<CategoryRule>;
    async fn delete_rule(&self, id: &str) -> Result<()>;
    fn apply_rules(&self, transaction_name: &str, account_id: Option<&str>) -> Result<Option<CategoryMatch>>;
    fn bulk_apply_rules(&self, transactions: Vec<(String, Option<String>)>) -> Result<Vec<Option<CategoryMatch>>>;
    fn test_pattern(&self, pattern: &str, match_type: &str, test_text: &str) -> Result<bool>;
}
