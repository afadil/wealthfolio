use crate::activity::activity_service;
use crate::models::{
    Activity, ActivityImport, ActivitySearchResponse, ActivityUpdate, NewActivity, Sort,
};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_activities(state: State<'_, AppState>) -> Result<Vec<Activity>, String> {
    println!("Fetching all activities...");
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = activity_service::ActivityService::new(base_currency);

    service
        .get_activities(&mut conn)
        .map_err(|e| format!("Failed to fetch activities: {}", e))
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
    println!("Search activities... {}, {}", page, page_size);
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = activity_service::ActivityService::new(base_currency);

    service
        .search_activities(
            &mut conn,
            page,
            page_size,
            account_id_filter,
            activity_type_filter,
            asset_id_keyword,
            sort,
        )
        .map_err(|e| format!("Search activities: {}", e))
}

#[tauri::command]
pub async fn create_activity(
    activity: NewActivity,
    state: State<'_, AppState>,
) -> Result<Activity, String> {
    println!("Adding new activity... {:?}", activity);
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = activity_service::ActivityService::new(base_currency);
    service
        .create_activity(&mut conn, activity)
        .await
        .map_err(|e| format!("Failed to add new activity: {}", e))
}

#[tauri::command]
pub async fn update_activity(
    activity: ActivityUpdate,
    state: State<'_, AppState>,
) -> Result<Activity, String> {
    println!("Updating activity...");
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = activity_service::ActivityService::new(base_currency);
    service
        .update_activity(&mut conn, activity)
        .await
        .map_err(|e| format!("Failed to update activity: {}", e))
}

#[tauri::command]
pub async fn check_activities_import(
    account_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<ActivityImport>, String> {
    println!(
        "Checking activities import...: {}, {}",
        account_id, file_path
    );
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = activity_service::ActivityService::new(base_currency);
    service
        .check_activities_import(&mut conn, account_id, file_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_activities(
    activities: Vec<NewActivity>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    println!("Importing activities...");
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = activity_service::ActivityService::new(base_currency);
    service
        .create_activities(&mut conn, activities)
        .map_err(|err| format!("Failed to import activities: {}", err))
}

#[tauri::command]
pub async fn delete_activity(
    activity_id: String,
    state: State<'_, AppState>,
) -> Result<Activity, String> {
    println!("Deleting activity...");
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let base_currency = state.base_currency.read().unwrap().clone();
    let service = activity_service::ActivityService::new(base_currency);
    service
        .delete_activity(&mut conn, activity_id)
        .map_err(|e| format!("Failed to delete activity: {}", e))
}
