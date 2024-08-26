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
    let mut conn = state.conn.lock().unwrap();
    let service = activity_service::ActivityService::new();

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
        .map_err(|e| format!("Seach activities: {}", e))
}

#[tauri::command]
pub fn create_activity(activity: NewActivity, state: State<AppState>) -> Result<Activity, String> {
    println!("Adding new activity...");

    let result = tauri::async_runtime::block_on(async {
        let mut conn = state.conn.lock().unwrap();
        let service = activity_service::ActivityService::new();
        service.create_activity(&mut *conn, activity).await
    });

    result.map_err(|e| format!("Failed to add new activity: {}", e))
}

#[tauri::command]
pub fn check_activities_import(
    account_id: String,
    file_path: String,
    state: State<AppState>,
) -> Result<Vec<ActivityImport>, String> {
    println!(
        "Checking activities import...: {}, {}",
        account_id, file_path
    );

    let result = tauri::async_runtime::block_on(async {
        let mut conn = state.conn.lock().unwrap();
        let service = activity_service::ActivityService::new();
        service
            .check_activities_import(&mut *conn, account_id, file_path)
            .await
    });

    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_activities(
    activities: Vec<NewActivity>,
    state: State<AppState>,
) -> Result<usize, String> {
    // Return a Result with the count or an error message
    println!("Importing activities...");
    let mut conn = state.conn.lock().unwrap();
    let service = activity_service::ActivityService::new();
    service
        .create_activities(&mut *conn, activities)
        .map_err(|err| format!("Failed to import activities: {}", err))
        .map(|count| count) // You can directly return the count here
}

#[tauri::command]
pub fn update_activity(
    activity: ActivityUpdate,
    state: State<AppState>,
) -> Result<Activity, String> {
    println!("Updating activity..."); 
    let mut conn = state.conn.lock().unwrap();
    let service = activity_service::ActivityService::new();
    service
        .update_activity(&mut *conn, activity)
        .map_err(|e| format!("Failed to update activity: {}", e))
}


#[tauri::command]
pub fn delete_activity(activity_id: String, state: State<AppState>) -> Result<usize, String> {
    println!("Deleting activity..."); 
    let mut conn = state.conn.lock().unwrap();
    let service = activity_service::ActivityService::new();
    service
        .delete_activity(&mut *conn, activity_id)
        .map_err(|e| format!("Failed to delete activity: {}", e))
}
