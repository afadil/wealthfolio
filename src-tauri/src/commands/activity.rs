use crate::activity::activity_service;
use crate::models::{
    Activity, ActivityImport, ActivitySearchResponse, ActivityUpdate, NewActivity, Sort, CsvImportProfileWithMappings
};
use crate::AppState;
use diesel::SqliteConnection;
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::commands::csv_profile::{
    add_csv_profile as insert_csv_import_profile,
    fetch_csv_profiles as get_csv_profiles_from_db,
};
use std::fs::File;
use std::io::BufReader;
use csv::ReaderBuilder;

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
    println!("Adding new activity...");
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

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvImportProfile {
    pub id: String,
    pub name: String,
    pub account_id: String,
    pub column_mappings: Vec<CsvColumnMapping>,
    pub transaction_type_mappings: Vec<CsvTransactionTypeMapping>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvColumnMapping {
    pub csv_column_name: String,
    pub app_field_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvTransactionTypeMapping {
    pub csv_transaction_type: String,
    pub app_activity_type: String,
}

#[tauri::command]
pub fn create_csv_import_profile(
    profile: CsvImportProfileWithMappings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    insert_csv_import_profile(&mut conn, &profile).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_csv_import_profiles(
    account_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<CsvImportProfileWithMappings>, String> {
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    get_csv_profiles_from_db(&mut conn, &account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_transactions_with_profile(
    profile_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    // Step 1: Get the database connection
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    // Step 2: Fetch the CSV Import Profile by profile_id
    let profile = get_csv_import_profile_by_id(&mut conn, &profile_id)
        .map_err(|e| format!("Failed to fetch CSV profile: {}", e))?;

    // Step 3: Open the CSV file
    let file = File::open(&file_path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = ReaderBuilder::new()
        .has_headers(true) // Assuming CSV has headers
        .from_reader(BufReader::new(file));

    let base_currency = state.base_currency.read().unwrap().clone();
    let service = activity_service::ActivityService::new(base_currency);

    // Initialize an empty vector to store the activities
    let mut activities = Vec::new();

    // Step 4: Process each CSV record and send it to the create_activity method
    for result in reader.records() {
        let record = result.map_err(|e| format!("Failed to read CSV record: {}", e))?;
        
        // Step 5: Map the CSV record to `NewActivity` using the profile
        let new_activity = map_csv_to_activity(&record, &profile)?;
        activities.push(new_activity);
    }

    // Step 6: Use the `create_activities` method to insert all activities
    service
        .create_activities(&mut conn, activities)
        .map_err(|err| format!("Failed to import activities: {}", err))
}

// Helper function to fetch the CSV import profile by ID
fn get_csv_import_profile_by_id(
    conn: &mut SqliteConnection,
    profile_id: &str,
) -> Result<CsvImportProfileWithMappings, String> {
    let profiles = crate::commands::csv_profile::fetch_csv_profiles(conn, profile_id)
        .map_err(|e| format!("Failed to get profile: {}", e))?;

    profiles.into_iter().next().ok_or_else(|| {
        format!("Profile with ID '{}' not found", profile_id)
    })
}

fn map_csv_to_activity(
    record: &csv::StringRecord,
    profile: &CsvImportProfileWithMappings,
) -> Result<NewActivity, String> {
    // Initialize a new `NewActivity` with default values
    let mut new_activity = NewActivity {
        id: Some(String::new()),
        account_id: profile.account_id.clone(),
        asset_id: String::new(), // This can be mapped if present in the CSV or profile
        activity_type: String::new(), // Will map this using the transaction type mappings
        activity_date: String::new(), // Map this from the CSV (needs mapping logic)
        quantity: 0.0,
        unit_price: 0.0,
        currency: String::new(), // Map this if available in CSV
        fee: 0.0,
        is_draft: false, // You may want to customize this based on the business logic
        comment: None,
    };

    // Iterate over the column mappings defined in the profile and map CSV fields to `NewActivity` fields
    for mapping in &profile.column_mappings {
        let csv_value = record
            .get(mapping.csv_column_name.parse::<usize>().unwrap())
            .ok_or_else(|| format!("CSV column '{}' not found", mapping.csv_column_name))?;

        // Map CSV value to the corresponding field in `NewActivity`
        match mapping.app_field_name.as_str() {
            "id" => new_activity.id = Some(csv_value.to_string()),
            "account_id" => new_activity.account_id = csv_value.to_string(),
            "asset_id" => new_activity.asset_id = csv_value.to_string(),
            "activity_date" => new_activity.activity_date = csv_value.to_string(),
            "quantity" => {
                new_activity.quantity = csv_value.parse::<f64>().map_err(|e| format!("Failed to parse quantity: {}", e))?;
            }
            "unit_price" => {
                new_activity.unit_price = csv_value.parse::<f64>().map_err(|e| format!("Failed to parse unit price: {}", e))?;
            }
            "currency" => new_activity.currency = csv_value.to_string(),
            "fee" => {
                new_activity.fee = csv_value.parse::<f64>().map_err(|e| format!("Failed to parse fee: {}", e))?;
            }
            _ => return Err(format!("Unrecognized field mapping for {}", mapping.app_field_name)),
        }
    }

    // Map the transaction type using the profile's transaction type mappings
    let csv_transaction_type = record
        .get(2)  // Assuming column 2 holds the transaction type
        .ok_or_else(|| "CSV transaction type column not found".to_string())?;
    
    for mapping in &profile.transaction_type_mappings {
        if mapping.csv_transaction_type == csv_transaction_type {
            new_activity.activity_type = mapping.app_activity_type.clone();
            break;
        }
    }

    if new_activity.activity_type.is_empty() {
        return Err(format!("No matching activity type found for '{}'", csv_transaction_type));
    }

    Ok(new_activity)
}

