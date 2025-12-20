use super::activities_model::{
    Activity, ActivityBulkMutationRequest, ActivityBulkMutationResult, ActivityDetails,
    ActivityImport, ActivitySearchResponse, ActivityUpdate, DailySpendingRow, ImportMapping,
    ImportMappingData, IncomeData, MonthMetricsRequest, MonthMetricsResponse, NewActivity,
    RecurrenceBreakdown, Sort, SpendingTrendsRequest, SpendingTrendsResponse,
};
use crate::portfolio::income::{CapitalGainsData, CashIncomeData, InvestmentAccountDepositData};
use crate::spending::SpendingData;
use crate::Result;
use async_trait::async_trait;
use chrono::DateTime;
use chrono::NaiveDateTime;
use chrono::Utc;
use rust_decimal::Decimal; // Assuming Result is defined in activities_model or activities_errors

/// Trait defining the contract for Activity repository operations.
#[async_trait]
pub trait ActivityRepositoryTrait: Send + Sync {
    fn get_activity(&self, activity_id: &str) -> Result<Activity>;
    fn get_activities(&self) -> Result<Vec<Activity>>;
    fn get_activities_by_account_id(&self, account_id: &str) -> Result<Vec<Activity>>;
    fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>>;
    fn get_trading_activities(&self) -> Result<Vec<Activity>>;
    fn get_income_activities(&self) -> Result<Vec<Activity>>;
    #[allow(clippy::type_complexity)]
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
        category_id_filter: Option<Vec<String>>,
        event_id_filter: Option<Vec<String>>,
        asset_id_keyword: Option<String>,
        account_type_filter: Option<Vec<String>>,
        is_categorized_filter: Option<bool>,
        has_event_filter: Option<bool>,
        amount_min_filter: Option<Decimal>,
        amount_max_filter: Option<Decimal>,
        start_date_filter: Option<String>,
        end_date_filter: Option<String>,
        sort: Option<Sort>,
        recurrence_filter: Option<Vec<String>>,
        has_recurrence_filter: Option<bool>,
    ) -> Result<ActivitySearchResponse>;
    async fn create_activity(&self, new_activity: NewActivity) -> Result<Activity>;
    async fn update_activity(&self, activity_update: ActivityUpdate) -> Result<Activity>;
    async fn delete_activity(&self, activity_id: String) -> Result<Activity>;
    async fn bulk_mutate_activities(
        &self,
        creates: Vec<NewActivity>,
        updates: Vec<ActivityUpdate>,
        delete_ids: Vec<String>,
    ) -> Result<ActivityBulkMutationResult>;
    async fn create_activities(&self, activities: Vec<NewActivity>) -> Result<usize>;
    fn get_first_activity_date(
        &self,
        account_ids: Option<&[String]>,
    ) -> Result<Option<DateTime<Utc>>>;
    fn get_import_mapping(&self, account_id: &str) -> Result<Option<ImportMapping>>;
    async fn save_import_mapping(&self, mapping: &ImportMapping) -> Result<()>;
    // Add other repository methods if necessary, e.g., calculate_average_cost, get_deposit_activities
    fn calculate_average_cost(&self, account_id: &str, asset_id: &str) -> Result<Decimal>;
    fn get_income_activities_data(&self) -> Result<Vec<IncomeData>>;
    fn get_first_activity_date_overall(&self) -> Result<DateTime<Utc>>;
    fn get_spending_activities_data(
        &self,
        include_event_ids: Option<&[String]>,
        include_all_events: bool,
    ) -> Result<Vec<SpendingData>>;
    fn get_cash_income_activities_data(&self) -> Result<Vec<CashIncomeData>>;
    fn get_investment_account_deposits_data(&self) -> Result<Vec<InvestmentAccountDepositData>>;
    fn get_capital_gains_data(&self) -> Result<Vec<CapitalGainsData>>;
    fn get_top_spending_transactions(&self, month: &str, limit: i64) -> Result<Vec<ActivityDetails>>;
    fn get_daily_spending_for_month(
        &self,
        month: &str,
        category_ids: Option<&[String]>,
        subcategory_ids: Option<&[String]>,
        include_event_ids: Option<&[String]>,
        include_all_events: bool,
    ) -> Result<Vec<DailySpendingRow>>;
    fn get_month_transaction_amounts(&self, month: &str) -> Result<Vec<f64>>;
    fn get_month_recurrence_totals(&self, month: &str) -> Result<RecurrenceBreakdown>;
}

/// Trait defining the contract for Activity service operations.
#[async_trait]
pub trait ActivityServiceTrait: Send + Sync {
    fn get_activity(&self, activity_id: &str) -> Result<Activity>;
    fn get_activities(&self) -> Result<Vec<Activity>>;
    fn get_activities_by_account_id(&self, account_id: &str) -> Result<Vec<Activity>>;
    fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>>;
    fn get_trading_activities(&self) -> Result<Vec<Activity>>;
    fn get_income_activities(&self) -> Result<Vec<Activity>>;
    fn search_activities(
        &self,
        page: i64,
        page_size: i64,
        account_id_filter: Option<Vec<String>>,
        activity_type_filter: Option<Vec<String>>,
        category_id_filter: Option<Vec<String>>,
        event_id_filter: Option<Vec<String>>,
        asset_id_keyword: Option<String>,
        account_type_filter: Option<Vec<String>>,
        is_categorized_filter: Option<bool>,
        has_event_filter: Option<bool>,
        amount_min_filter: Option<Decimal>,
        amount_max_filter: Option<Decimal>,
        start_date_filter: Option<String>,
        end_date_filter: Option<String>,
        sort: Option<Sort>,
        recurrence_filter: Option<Vec<String>>,
        has_recurrence_filter: Option<bool>,
    ) -> Result<ActivitySearchResponse>;
    fn get_first_activity_date(
        &self,
        account_ids: Option<&[String]>,
    ) -> Result<Option<DateTime<Utc>>>;
    fn get_import_mapping(&self, account_id: String) -> Result<ImportMappingData>;
    async fn create_activity(&self, activity: NewActivity) -> Result<Activity>;
    async fn update_activity(&self, activity: ActivityUpdate) -> Result<Activity>;
    async fn delete_activity(&self, activity_id: String) -> Result<Activity>;
    async fn bulk_mutate_activities(
        &self,
        request: ActivityBulkMutationRequest,
    ) -> Result<ActivityBulkMutationResult>;
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
    async fn save_import_mapping(
        &self,
        mapping_data: ImportMappingData,
    ) -> Result<ImportMappingData>;
    fn get_top_spending_transactions(&self, month: String, limit: i64) -> Result<Vec<ActivityDetails>>;
    fn get_spending_trends(&self, request: SpendingTrendsRequest) -> Result<SpendingTrendsResponse>;
    fn get_month_metrics(&self, request: MonthMetricsRequest) -> Result<MonthMetricsResponse>;
}
