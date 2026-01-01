use std::sync::Arc;

use crate::context::ServiceContext;
use crate::events::{emit_resource_changed, ResourceEventPayload};
use log::debug;
use tauri::{AppHandle, State};
use wealthfolio_core::activities::{
    Activity, ActivityBulkMutationRequest, ActivityBulkMutationResult, ActivityImport,
    ActivitySearchResponse, ActivityUpdate, ImportMappingData, NewActivity, Sort,
};

use serde_json::json;

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
    needs_review_filter: Option<bool>,         // Optional needs_review filter for pending review
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
        needs_review_filter,
    )?)
}

#[tauri::command]
pub async fn create_activity(
    activity: NewActivity,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Activity, String> {
    debug!("Creating activity...");
    let result = state.activity_service().create_activity(activity).await?;

    let activity_date = result.activity_date.date_naive();
    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "activity",
            "created",
            json!({
                "activity_id": result.id,
                "account_id": result.account_id,
                "currency": result.currency,
                "asset_id": result.asset_id,
                "activity_date": activity_date.to_string(),
            }),
        ),
    );

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

    // Detect if the activity date changed (for quote backfill detection)
    let original_date = original_activity.activity_date.date_naive();
    let new_date = result.activity_date.date_naive();
    let date_changed = original_date != new_date;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "activity",
            "updated",
            json!({
                "activity_id": result.id,
                "account_id": result.account_id,
                "currency": result.currency,
                "asset_id": result.asset_id,
                "activity_date": new_date.to_string(),
                "previous_account_id": original_activity.account_id,
                "previous_currency": original_activity.currency,
                "previous_asset_id": original_activity.asset_id,
                "previous_activity_date": original_date.to_string(),
                "date_changed": date_changed,
            }),
        ),
    );

    Ok(result)
}

#[tauri::command]
pub async fn delete_activity(
    activity_id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<Activity, String> {
    debug!("Deleting activity...");
    let result = state
        .activity_service()
        .delete_activity(activity_id)
        .await
        .map_err(|e| e.to_string())?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "activity",
            "deleted",
            json!({
                "activity_id": result.id,
                "account_id": result.account_id,
                "currency": result.currency,
                "asset_id": result.asset_id,
            }),
        ),
    );

    Ok(result)
}

#[tauri::command]
pub async fn save_activities(
    request: ActivityBulkMutationRequest,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<ActivityBulkMutationResult, String> {
    let create_count = request.creates.len();
    let update_count = request.updates.len();
    let delete_count = request.delete_ids.len();
    debug!(
        "Bulk activity mutation request: {} creates, {} updates, {} deletes",
        create_count, update_count, delete_count
    );

    let result = state
        .activity_service()
        .bulk_mutate_activities(request)
        .await
        .map_err(|e| e.to_string())?;

    let result_value = serde_json::to_value(&result).unwrap_or_else(|_| json!({}));
    let event_payload = json!({
        "request": {
            "createCount": create_count,
            "updateCount": update_count,
            "deleteCount": delete_count,
        },
        "result": result_value,
    });

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new("activity", "bulk-mutated", event_payload),
    );

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
    let event_metadata: Vec<_> = activities
        .iter()
        .map(|activity| {
            json!({
                "asset_id": activity.symbol,
                "currency": activity.currency,
            })
        })
        .collect();

    let result = state
        .activity_service()
        .import_activities(account_id.clone(), activities) // activities is moved here
        .await?;
    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "activity",
            "imported",
            json!({
                "account_id": account_id,
                "activities": event_metadata,
            }),
        ),
    );

    Ok(result)
}
