use std::collections::HashMap;
use std::sync::Arc;

use crate::context::ServiceContext;
use log::debug;
use tauri::State;
use wealthfolio_core::activities::{
    Activity, ActivityBulkMutationRequest, ActivityBulkMutationResult, ActivityImport,
    ActivitySearchResponse, ActivityUpdate, ImportActivitiesResult, ImportMappingData, NewActivity,
    ParseConfig, ParsedCsvResult, Sort,
};

#[tauri::command]
pub async fn search_activities(
    page: i64,                                 // Page number, 1-based
    page_size: i64,                            // Number of items per page
    account_id_filter: Option<Vec<String>>,    // Optional account_id filter
    activity_type_filter: Option<Vec<String>>, // Optional activity_type filter
    asset_id_keyword: Option<String>,          // Optional asset_id keyword for search
    sort: Option<Sort>,
    needs_review_filter: Option<bool>, // Optional needs_review filter for pending review
    date_from: Option<String>,         // Optional start date filter (YYYY-MM-DD, inclusive)
    date_to: Option<String>,           // Optional end date filter (YYYY-MM-DD, inclusive)
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ActivitySearchResponse, String> {
    debug!("Search activities... {}, {}", page, page_size);

    // Parse date strings to NaiveDate
    let date_from_parsed = date_from
        .map(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d"))
        .transpose()
        .map_err(|e| format!("Invalid date_from format: {}", e))?;
    let date_to_parsed = date_to
        .map(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d"))
        .transpose()
        .map_err(|e| format!("Invalid date_to format: {}", e))?;

    Ok(state.activity_service().search_activities(
        page,
        page_size,
        account_id_filter,
        activity_type_filter,
        asset_id_keyword,
        sort,
        needs_review_filter,
        date_from_parsed,
        date_to_parsed,
    )?)
}

#[tauri::command]
pub async fn create_activity(
    activity: NewActivity,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Activity, String> {
    debug!("Creating activity...");
    // Domain events handle recalculation and asset enrichment automatically
    state
        .activity_service()
        .create_activity(activity)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_activity(
    activity: ActivityUpdate,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Activity, String> {
    debug!("Updating activity...");
    // Domain events handle recalculation and asset enrichment automatically
    state
        .activity_service()
        .update_activity(activity)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_activity(
    activity_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Activity, String> {
    debug!("Deleting activity...");
    // Domain events handle recalculation automatically
    state
        .activity_service()
        .delete_activity(activity_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_activities(
    request: ActivityBulkMutationRequest,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ActivityBulkMutationResult, String> {
    let create_count = request.creates.len();
    let update_count = request.updates.len();
    let delete_count = request.delete_ids.len();
    debug!(
        "Bulk activity mutation request: {} creates, {} updates, {} deletes",
        create_count, update_count, delete_count
    );

    // Domain events handle recalculation and asset enrichment automatically
    state
        .activity_service()
        .bulk_mutate_activities(request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_account_import_mapping(
    account_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ImportMappingData, String> {
    debug!("Getting import mapping for account: {}", account_id);
    Ok(state.activity_service().get_import_mapping(account_id)?)
}

#[tauri::command]
pub async fn save_account_import_mapping(
    mapping: ImportMappingData,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ImportMappingData, String> {
    debug!("Saving import mapping for account: {}", mapping.account_id);
    state
        .activity_service()
        .save_import_mapping(mapping)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_activities_import(
    account_id: String,
    activities: Vec<ActivityImport>,
    dry_run: Option<bool>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<ActivityImport>, String> {
    let dry_run = dry_run.unwrap_or(false);
    debug!(
        "Checking activities import for account: {} (dry_run: {})",
        account_id, dry_run
    );
    let result = state
        .activity_service()
        .check_activities_import(account_id, activities, dry_run)
        .await?;
    Ok(result)
}

#[tauri::command]
pub async fn import_activities(
    account_id: String,
    activities: Vec<ActivityImport>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ImportActivitiesResult, String> {
    debug!("Importing activities for account: {}", account_id);
    // Domain events handle recalculation and asset enrichment automatically
    state
        .activity_service()
        .import_activities(account_id, activities)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_existing_duplicates(
    idempotency_keys: Vec<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<HashMap<String, String>, String> {
    debug!(
        "Checking for existing duplicates with {} idempotency keys",
        idempotency_keys.len()
    );
    state
        .activity_service()
        .check_existing_duplicates(idempotency_keys)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn parse_csv(
    content: Vec<u8>,
    config: ParseConfig,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ParsedCsvResult, String> {
    debug!(
        "Parsing CSV with {} bytes, config: {:?}",
        content.len(),
        config
    );
    state
        .activity_service()
        .parse_csv(&content, &config)
        .map_err(|e| {
            debug!("CSV parse error: {}", e);
            e.to_string()
        })
}
