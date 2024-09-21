use crate::activity::activity_service;
use crate::models::{
    Activity, ActivityImport, ActivitySearchResponse, ActivityUpdate, NewActivity, Sort,
};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn search_activities(
    page: i64,                                 // Page number, 1-based
    page_size: i64,                            // Number of items per page
    account_id_filter: Option<Vec<String>>,    // Optional account_id filter
    activity_type_filter: Option<Vec<String>>, // Optional activity_type filter
    asset_id_keyword: Option<String>,          // Optional asset_id keyword for search
    sort: Option<Sort>,
    state: State<AppState>,
) -> Result<ActivitySearchResponse, String> {
    println!("Search activities... {}, {}", page, page_size);
    let service = activity_service::ActivityService::new((*state.pool).clone());

    service
        .search_activities(
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
pub fn create_activity(activity: NewActivity, state: State<AppState>) -> Result<Activity, String> {
    println!("Adding new activity...");
    let result = tauri::async_runtime::block_on(async {
        let service = activity_service::ActivityService::new((*state.pool).clone());
        service.create_activity(activity).await
    });

    result.map_err(|e| format!("Failed to add new activity: {}", e))
}

#[tauri::command]
pub fn update_activity(
    activity: ActivityUpdate,
    state: State<AppState>,
) -> Result<Activity, String> {
    println!("Updating activity...");
    let result = tauri::async_runtime::block_on(async {
        let service = activity_service::ActivityService::new((*state.pool).clone());
        service.update_activity(activity).await
    });

    result.map_err(|e| format!("Failed to update activity: {}", e))
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

    let service = activity_service::ActivityService::new((*state.pool).clone());
    service
        .check_activities_import(account_id, file_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_activities(
    activities: Vec<NewActivity>,
    state: State<AppState>,
) -> Result<usize, String> {
    println!("Importing activities...");
    let service = activity_service::ActivityService::new((*state.pool).clone());
    service
        .create_activities(activities)
        .map_err(|err| format!("Failed to import activities: {}", err))
}

#[tauri::command]
pub fn delete_activity(activity_id: String, state: State<AppState>) -> Result<Activity, String> {
    println!("Deleting activity...");
    let service = activity_service::ActivityService::new((*state.pool).clone());
    service
        .delete_activity(activity_id)
        .map_err(|e| format!("Failed to delete activity: {}", e))
}
