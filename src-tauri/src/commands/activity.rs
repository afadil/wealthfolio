use crate::AppState;
use log::debug;
use tauri::State;
use wealthfolio_core::activities::{Activity, ActivityImport, ActivitySearchResponse, ActivityUpdate, NewActivity, Sort};
use wealthfolio_core::activities::ActivityService;
use wealthfolio_core::ImportMappingData;


#[tauri::command]
pub async fn get_activities(state: State<'_, AppState>) -> Result<Vec<Activity>, String> {
    debug!("Fetching all activities...");
    let base_currency = state.get_base_currency();
    let service = ActivityService::new(state.pool.clone(), base_currency).await?;
    Ok(service.get_activities()?)
}

#[tauri::command]
pub async fn search_activities(
    page: i64,                                 // Page number, 1-based
    page_size: i64,                            // Number of items per page
    account_id_filter: Option<Vec<String>>,    // Optional account_id filter
    activity_type_filter: Option<Vec<String>>, // Optional activity_type filter
    asset_id_keyword: Option<String>,          // Optional asset_id keyword for search
    sort: Option<Sort>,
    state: State<'_, AppState>,
) -> Result<ActivitySearchResponse, String> {
    debug!("Search activities... {}, {}", page, page_size);
    let base_currency = state.get_base_currency();
    let service = ActivityService::new(state.pool.clone(), base_currency).await?;
    service.search_activities(
        page,
        page_size,
        account_id_filter,
        activity_type_filter,
        asset_id_keyword,
        sort,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_activity(
    activity: NewActivity,
    state: State<'_, AppState>,
) -> Result<Activity, String> {
    debug!("Creating activity...");
    let base_currency = state.get_base_currency();
    let service = ActivityService::new(state.pool.clone(), base_currency).await?;
    let result = service.create_activity(activity).await?;
    Ok(result)
}

#[tauri::command]
pub async fn update_activity(
    activity: ActivityUpdate,
    state: State<'_, AppState>,
) -> Result<Activity, String> {
    debug!("Updating activity...");
    let base_currency = state.get_base_currency();
    let service = ActivityService::new(state.pool.clone(), base_currency).await?;
    let result = service.update_activity(activity).await?;
    Ok(result)
}

#[tauri::command]
pub async fn check_activities_import(
    account_id: String,
    activities: Vec<ActivityImport>,
    state: State<'_, AppState>,
) -> Result<Vec<ActivityImport>, String> {
    debug!("Checking activities import for account: {}", account_id);
    let base_currency = state.get_base_currency();
    let service = ActivityService::new(state.pool.clone(), base_currency).await?;
    let result = service.check_activities_import(account_id, activities).await?;
    Ok(result)
}

#[tauri::command]
pub async fn create_activities(
    activities: Vec<NewActivity>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    debug!("Creating activities...");
    let base_currency = state.get_base_currency();
    let service = ActivityService::new(state.pool.clone(), base_currency).await?;
    service.create_activities(activities).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_activity(
    activity_id: String,
    state: State<'_, AppState>,
) -> Result<Activity, String> {
    debug!("Deleting activity...");
    let base_currency = state.get_base_currency();
    let service = ActivityService::new(state.pool.clone(), base_currency).await?;
    service.delete_activity(activity_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_account_import_mapping(
    account_id: String,
    state: State<'_, AppState>,
) -> Result<ImportMappingData, String> {
    debug!("Getting import mapping for account: {}", account_id);
    let base_currency = state.get_base_currency();
    let service = ActivityService::new(state.pool.clone(), base_currency).await?;
    service.get_import_mapping(account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_account_import_mapping(
    mapping: ImportMappingData,
    state: State<'_, AppState>,
) -> Result<ImportMappingData, String> {
    debug!("Saving import mapping for account: {}", mapping.account_id);
    let base_currency = state.get_base_currency();
    let service = ActivityService::new(state.pool.clone(), base_currency).await?;
    service.save_import_mapping(mapping).map_err(|e| e.to_string())
}
