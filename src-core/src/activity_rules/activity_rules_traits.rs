use crate::activity_rules::activity_rules_model::{
    ActivityRule, ActivityRuleMatch, ActivityRuleWithNames, NewActivityRule, UpdateActivityRule,
};
use crate::errors::Result;
use async_trait::async_trait;

#[async_trait]
pub trait ActivityRuleRepositoryTrait: Send + Sync {
    fn get_all_rules(&self) -> Result<Vec<ActivityRule>>;
    fn get_rule_by_id(&self, id: &str) -> Result<Option<ActivityRule>>;
    fn get_global_rules(&self) -> Result<Vec<ActivityRule>>;
    fn get_rules_by_account(&self, account_id: &str) -> Result<Vec<ActivityRule>>;
    fn get_rules_by_category(&self, category_id: &str) -> Result<Vec<ActivityRule>>;
    async fn create_rule(&self, new_rule: NewActivityRule) -> Result<ActivityRule>;
    async fn update_rule(&self, id: &str, update: UpdateActivityRule) -> Result<ActivityRule>;
    async fn delete_rule(&self, id: &str) -> Result<usize>;
    fn get_max_priority(&self) -> Result<i32>;
}

#[async_trait]
pub trait ActivityRuleServiceTrait: Send + Sync {
    fn get_all_rules(&self) -> Result<Vec<ActivityRule>>;
    fn get_all_rules_with_names(&self) -> Result<Vec<ActivityRuleWithNames>>;
    fn get_rule_by_id(&self, id: &str) -> Result<ActivityRule>;
    fn get_rules_for_account(&self, account_id: Option<&str>) -> Result<Vec<ActivityRule>>;
    async fn create_rule(&self, new_rule: NewActivityRule) -> Result<ActivityRule>;
    async fn update_rule(&self, id: &str, update: UpdateActivityRule) -> Result<ActivityRule>;
    async fn delete_rule(&self, id: &str) -> Result<()>;
    fn apply_rules(&self, transaction_name: &str, account_id: Option<&str>) -> Result<Option<ActivityRuleMatch>>;
    fn bulk_apply_rules(&self, transactions: Vec<(String, Option<String>)>) -> Result<Vec<Option<ActivityRuleMatch>>>;
    fn test_pattern(&self, pattern: &str, match_type: &str, test_text: &str) -> Result<bool>;
}
