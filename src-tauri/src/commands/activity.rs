use std::collections::HashSet;
use std::sync::Arc;

use crate::context::ServiceContext;
use crate::events::{emit_portfolio_trigger_recalculate, PortfolioRequestPayload};
use log::debug;
use tauri::{AppHandle, State};
use wealthfolio_core::activities::{
    Activity, ActivityImport, ActivitySearchResponse, ActivityUpdate, ImportMappingData,
    NewActivity, Sort,
};

// Helper function to generate symbols for portfolio recalculation (single activity)
fn get_symbols_to_sync(
    state: &State<'_, Arc<ServiceContext>>,
    activity_account_id: &str,
    activity_currency: &str,
    activity_asset_id: &str,
) -> Result<Vec<String>, String> {
    let account = state
        .account_service()
        .get_account(activity_account_id)
        .map_err(|e| format!("Failed to get account {}: {}", activity_account_id, e))?;
    let account_currency = account.currency;

    let mut symbols = vec![activity_asset_id.to_string()];

    if !activity_currency.is_empty() && activity_currency != &account_currency {
        let fx_symbol = format!("{}{}=X", account_currency, activity_currency);
        symbols.push(fx_symbol);
    }
    Ok(symbols)
}

// Helper function to generate symbols for imported activities (batch)
fn get_all_symbols_to_sync(
    state: &State<'_, Arc<ServiceContext>>,
    account_id: &str,
    activities: &[ActivityImport], // Use slice
) -> Result<Vec<String>, String> {
    let account = state
        .account_service()
        .get_account(account_id)
        .map_err(|e| format!("Failed to get account {}: {}", account_id, e))?;
    let account_currency = account.currency;

    let mut all_symbols: HashSet<String> = HashSet::new();

    for activity_import in activities {
        // Add asset symbol
        if !activity_import.symbol.is_empty() {
            all_symbols.insert(activity_import.symbol.clone());
        }

        // Add FX symbol if currencies differ
        if !activity_import.currency.is_empty() && activity_import.currency != account_currency {
            let fx_symbol = format!("{}{}=X", account_currency, activity_import.currency);
            all_symbols.insert(fx_symbol);
        }
    }
    Ok(all_symbols.into_iter().collect())
}

#[tauri::command]
pub async fn get_activities(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Activity>, String> {
    debug!("Fetching all activities...");
    Ok(state.activity_service().get_activities()?)
}

#[tauri::command]
pub async fn search_activities(
    page: i64,                                 // Page number, 1-based
    page_size: i64,                            // Number of items per page
    account_id_filter: Option<Vec<String>>,    // Optional account_id filter
    activity_type_filter: Option<Vec<String>>, // Optional activity_type filter
    asset_id_keyword: Option<String>,          // Optional asset_id keyword for search
    sort: Option<Sort>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ActivitySearchResponse, String> {
    debug!("Search activities... {}, {}", page, page_size);
    Ok(state.activity_service().search_activities(
        page,
        page_size,
        account_id_filter,
        activity_type_filter,
        asset_id_keyword,
        sort,
    )?)
}

#[tauri::command]
pub async fn create_activity(
    activity: NewActivity,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Activity, String> {
    debug!("Creating activity...");
    // Note: Account currency for FX check is now handled by get_symbols_to_sync using the result
    let result = state.activity_service().create_activity(activity).await?;
    let handle = handle.clone();

    let symbols_for_payload = get_symbols_to_sync(
        &state,
        &result.account_id,
        &result.currency,
        &result.asset_id,
    )?;

    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![result.account_id.clone()]))
        .refetch_all_market_data(true)
        .symbols(Some(symbols_for_payload))
        .build();
    emit_portfolio_trigger_recalculate(&handle, payload);

    Ok(result)
}

#[tauri::command]
pub async fn update_activity(
    activity: ActivityUpdate,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Activity, String> {
    debug!("Updating activity...");

    let original_activity = state
        .activity_service()
        .get_activity(&activity.id)
        .map_err(|e| e.to_string())?;

    let result = state.activity_service().update_activity(activity).await?;
    let handle = handle.clone();

    let symbols_for_payload = get_symbols_to_sync(
        &state,
        &result.account_id,
        &result.currency,
        &result.asset_id,
    )?;

    let mut account_ids_for_payload = vec![result.account_id.clone()];
    if original_activity.account_id != result.account_id {
        account_ids_for_payload.push(original_activity.account_id);
    }

    let payload: PortfolioRequestPayload = PortfolioRequestPayload::builder()
        .account_ids(Some(account_ids_for_payload))
        .refetch_all_market_data(true)
        .symbols(Some(symbols_for_payload))
        .build();
    emit_portfolio_trigger_recalculate(&handle, payload);

    Ok(result)
}

#[tauri::command]
pub async fn delete_activity(
    activity_id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Activity, String> {
    debug!("Deleting activity...");
    let result = state.activity_service().delete_activity(activity_id).await.map_err(|e| e.to_string())?;
    let handle = handle.clone();
    let account_id_clone = result.account_id.clone();
    let symbols = vec![result.asset_id.clone()];

    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![account_id_clone]))
        .refetch_all_market_data(true)
        .symbols(Some(symbols))
        .build();
    emit_portfolio_trigger_recalculate(&handle, payload);

    Ok(result)
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
    state.activity_service().save_import_mapping(mapping).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_activities_import(
    account_id: String,
    activities: Vec<ActivityImport>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<ActivityImport>, String> {
    debug!("Checking activities import for account: {}", account_id);
    let result = state
        .activity_service()
        .check_activities_import(account_id, activities)
        .await?;
    Ok(result)
}

#[tauri::command]
pub async fn import_activities(
    account_id: String,
    activities: Vec<ActivityImport>,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Vec<ActivityImport>, String> {
    debug!("Importing activities for account: {}", account_id);

    // Generate symbols (including FX) using the new helper function
    let symbols_for_payload = get_all_symbols_to_sync(&state, &account_id, &activities)?;

    let result = state
        .activity_service()
        .import_activities(account_id.clone(), activities) // activities is moved here
        .await?;
    let handle = handle.clone();

    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![account_id])) // account_id is still available
        .refetch_all_market_data(true)
        .symbols(Some(symbols_for_payload))
        .build();
    emit_portfolio_trigger_recalculate(&handle, payload);

    Ok(result)
}
