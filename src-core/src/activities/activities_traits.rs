use super::activities_model::*;
use crate::Result;
use chrono::NaiveDateTime;
use chrono::DateTime;
use chrono::Utc;
use rust_decimal::Decimal; // Assuming Result is defined in activities_model or activities_errors

/// Trait defining the contract for Activity repository operations.
pub trait ActivityRepositoryTrait: Send + Sync {
    fn get_activities(&self) -> Result<Vec<Activity>>;
    fn get_activities_by_account_id(&self, account_id: &String) -> Result<Vec<Activity>>;
    fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>>;
    fn get_trading_activities(&self) -> Result<Vec<Activity>>;
    fn get_income_activities(&self) -> Result<Vec<Activity>>;
    fn get_deposit_activities(
        &self,
        account_ids: &[String],
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
    ) -> Result<Vec<(String, Decimal, Decimal, String, Option<Decimal>)>>;
    fn search_activities(
        &self,
        page: i64,
        page_size: i64,
        account_id_filter: Option<Vec<String>>,
        activity_type_filter: Option<Vec<String>>,
        asset_id_keyword: Option<String>,
        sort: Option<Sort>,
    ) -> Result<ActivitySearchResponse>;
    fn create_activity(&self, new_activity: NewActivity) -> Result<Activity>;
    fn update_activity(&self, activity_update: ActivityUpdate) -> Result<Activity>;
    fn delete_activity(&self, activity_id: String) -> Result<Activity>;
    fn create_activities(&self, activities: Vec<NewActivity>) -> Result<usize>;
    fn get_first_activity_date(&self, account_ids: Option<&[String]>) -> Result<Option<DateTime<Utc>>>;
    fn get_import_mapping(&self, account_id: &str) -> Result<Option<ImportMapping>>;
    fn save_import_mapping(&self, mapping: &ImportMapping) -> Result<()>;
    // Add other repository methods if necessary, e.g., calculate_average_cost, get_deposit_activities
    fn calculate_average_cost(&self, account_id: &str, asset_id: &str) -> Result<Decimal>;
    fn get_income_activities_data(&self) -> Result<Vec<IncomeData>>;
    fn get_first_activity_date_overall(&self) -> Result<DateTime<Utc>>;
}

/// Trait defining the contract for Activity service operations.
#[async_trait::async_trait]
pub trait ActivityServiceTrait: Send + Sync {
    fn get_activities(&self) -> Result<Vec<Activity>>;
    fn get_activities_by_account_id(&self, account_id: &String) -> Result<Vec<Activity>>;
    fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>>;
    fn get_trading_activities(&self) -> Result<Vec<Activity>>;
    fn get_income_activities(&self) -> Result<Vec<Activity>>;
    fn search_activities(
        &self,
        page: i64,
        page_size: i64,
        account_id_filter: Option<Vec<String>>,
        activity_type_filter: Option<Vec<String>>,
        asset_id_keyword: Option<String>,
        sort: Option<Sort>,
    ) -> Result<ActivitySearchResponse>;
    async fn create_activity(&self, activity: NewActivity) -> Result<Activity>;
    async fn update_activity(&self, activity: ActivityUpdate) -> Result<Activity>;
    fn delete_activity(&self, activity_id: String) -> Result<Activity>;
    async fn check_activities_import(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>>;
    async fn import_activities(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>>;
    fn get_first_activity_date(&self, account_ids: Option<&[String]>) -> Result<Option<DateTime<Utc>>>;
    fn get_import_mapping(&self, account_id: String) -> Result<ImportMappingData>;
    fn save_import_mapping(&self, mapping_data: ImportMappingData) -> Result<ImportMappingData>;

}
