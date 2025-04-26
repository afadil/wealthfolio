use std::sync::Arc;

use crate::context::ServiceContext;
use crate::events::{
    emit_portfolio_recalculate_request,
    PortfolioRequestPayload,
};
use log::debug;
use tauri::{State, AppHandle};
use wealthfolio_core::activities::{
    Activity, ActivityImport, ActivitySearchResponse, ActivityUpdate, ImportMappingData,
    NewActivity, Sort,
};

#[tauri::command]
pub async fn get_activities(state: State<'_, Arc<ServiceContext>>) -> Result<Vec<Activity>, String> {
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
    Ok(state
        .activity_service()
        .search_activities(
            page,
            page_size,
            account_id_filter,
            activity_type_filter,
            asset_id_keyword,
            sort,
        )
        ?)
}

#[tauri::command]
pub async fn create_activity(
    activity: NewActivity,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Activity, String> {
    debug!("Creating activity...");
    let result = state.activity_service().create_activity(activity).await?;
    let handle = handle.clone();
    let account_id_clone = result.account_id.clone();
    let symbols = vec![result.asset_id.clone()];

    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![account_id_clone]))
        .sync_market_data(false)
        .symbols(Some(symbols))
        .build();
    emit_portfolio_recalculate_request(&handle, payload);

    Ok(result)
}

#[tauri::command]
pub async fn update_activity(
    activity: ActivityUpdate,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Activity, String> {
    debug!("Updating activity...");
    let result = state.activity_service().update_activity(activity).await?;
    let handle = handle.clone();
    let account_id_clone = result.account_id.clone();
    let symbols = vec![result.asset_id.clone()];

    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![account_id_clone]))
        .sync_market_data(true)
        .symbols(Some(symbols))
        .build();
    emit_portfolio_recalculate_request(&handle, payload);

    Ok(result)
}

#[tauri::command]
pub async fn check_activities_import(
    account_id: String,
    activities: Vec<ActivityImport>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<ActivityImport>, String> {
    debug!("Checking activities import for account: {}", account_id);
    let result = state.activity_service()
        .check_activities_import(account_id, activities)
        .await?;
    Ok(result)
}

#[tauri::command]
pub async fn create_activities(
    activities: Vec<NewActivity>,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<usize, String> {
    debug!("Creating activities...");
    let account_ids_clone = activities
        .iter()
        .map(|a| a.account_id.clone())
        .collect::<std::collections::HashSet<String>>()
        .into_iter()
        .collect::<Vec<String>>();

    let symbols_clone = activities
        .iter()
        .map(|a| a.asset_id.clone())
        .collect::<std::collections::HashSet<String>>()
        .into_iter()
        .collect::<Vec<String>>();

    let result = state.activity_service().create_activities(activities)?;
    let handle = handle.clone();

    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(account_ids_clone))
        .sync_market_data(false)
        .symbols(Some(symbols_clone))
        .build();
    emit_portfolio_recalculate_request(&handle, payload);

    Ok(result)
}

#[tauri::command]
pub async fn delete_activity(
    activity_id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Activity, String> {
    debug!("Deleting activity...");
    let result = state.activity_service().delete_activity(activity_id)?;
    let handle = handle.clone();
    let account_id_clone = result.account_id.clone();
    let symbols = vec![result.asset_id.clone()];

    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![account_id_clone]))
        .sync_market_data(false)
        .symbols(Some(symbols))
        .build();
    emit_portfolio_recalculate_request(&handle, payload);

    Ok(result)
}

#[tauri::command]
pub async fn get_account_import_mapping(
    account_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ImportMappingData, String> {
    debug!("Getting import mapping for account: {}", account_id);
    Ok(state.activity_service()
        .get_import_mapping(account_id)?)
}

#[tauri::command]
pub async fn save_account_import_mapping(
    mapping: ImportMappingData,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ImportMappingData, String> {
    debug!("Saving import mapping for account: {}", mapping.account_id);
    Ok(state.activity_service()
        .save_import_mapping(mapping)?)
}

#[tauri::command]
pub async fn import_activities(
    account_id: String,
    activities: Vec<ActivityImport>,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Vec<ActivityImport>, String> {
    debug!("Importing activities for account: {}", account_id);

    let symbols_clone = activities
        .iter()
        .map(|a| a.symbol.clone())
        .collect::<std::collections::HashSet<String>>()
        .into_iter()
        .collect::<Vec<String>>();

    let result = state.activity_service()
        .import_activities(account_id.clone(), activities)
        .await?;
    let handle = handle.clone();

    let payload = PortfolioRequestPayload::builder()
        .account_ids(Some(vec![account_id]))
        .sync_market_data(false)
        .symbols(Some(symbols_clone))
        .build();
    emit_portfolio_recalculate_request(&handle, payload);

    Ok(result)
}
