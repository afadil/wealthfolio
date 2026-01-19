use std::collections::HashSet;
use std::sync::Arc;

use crate::{
    api::shared::{trigger_activity_portfolio_job, ActivityImpact},
    error::ApiResult,
    main_lib::AppState,
};
use axum::{
    extract::{Path, Query, State},
    routing::{delete, get, post},
    Json, Router,
};
use tracing::info;
use wealthfolio_core::activities::{
    Activity, ActivityBulkMutationRequest, ActivityBulkMutationResult, ActivityImport,
    ActivitySearchResponse, ActivityUpdate, ImportMappingData, NewActivity,
};

#[derive(serde::Deserialize)]
#[serde(untagged)]
enum SortWrapper {
    One(wealthfolio_core::activities::Sort),
    Many(Vec<wealthfolio_core::activities::Sort>),
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
enum StringOrVec {
    One(String),
    Many(Vec<String>),
}

#[derive(serde::Deserialize)]
struct ActivitySearchBody {
    page: i64,
    #[serde(rename = "pageSize")]
    page_size: i64,
    #[serde(rename = "accountIdFilter")]
    account_id_filter: Option<StringOrVec>,
    #[serde(rename = "activityTypeFilter")]
    activity_type_filter: Option<StringOrVec>,
    #[serde(rename = "assetIdKeyword")]
    asset_id_keyword: Option<String>,
    // Allow addons to pass either a single sort or an array (we pick the first)
    sort: Option<SortWrapper>,
    #[serde(rename = "needsReviewFilter")]
    needs_review_filter: Option<bool>,
}

async fn search_activities(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ActivitySearchBody>,
) -> ApiResult<Json<ActivitySearchResponse>> {
    // Normalize sort to a single value if provided
    let sort_normalized: Option<wealthfolio_core::activities::Sort> = match body.sort {
        Some(SortWrapper::One(s)) => Some(s),
        Some(SortWrapper::Many(v)) => v.into_iter().next(),
        None => None,
    };
    let account_ids: Option<Vec<String>> = match body.account_id_filter {
        Some(StringOrVec::One(s)) => Some(vec![s]),
        Some(StringOrVec::Many(v)) => Some(v),
        None => None,
    };
    let types: Option<Vec<String>> = match body.activity_type_filter {
        Some(StringOrVec::One(s)) => Some(vec![s]),
        Some(StringOrVec::Many(v)) => Some(v),
        None => None,
    };
    let resp = state.activity_service.search_activities(
        body.page,
        body.page_size,
        account_ids,
        types,
        body.asset_id_keyword,
        sort_normalized,
        body.needs_review_filter,
    )?;
    Ok(Json(resp))
}

async fn create_activity(
    State(state): State<Arc<AppState>>,
    Json(activity): Json<NewActivity>,
) -> ApiResult<Json<Activity>> {
    let created = state.activity_service.create_activity(activity).await?;

    // Trigger asset enrichment (service handles filtering)
    if let Some(ref asset_id) = created.asset_id {
        let asset_service = state.asset_service.clone();
        let asset_id = asset_id.clone();
        tokio::spawn(async move {
            let _ = asset_service.enrich_assets(vec![asset_id]).await;
        });
    }

    trigger_activity_portfolio_job(state, vec![ActivityImpact::from_activity(&created)]);
    Ok(Json(created))
}

async fn update_activity(
    State(state): State<Arc<AppState>>,
    Json(activity): Json<ActivityUpdate>,
) -> ApiResult<Json<Activity>> {
    let previous = state.activity_service.get_activity(&activity.id)?;
    let updated = state.activity_service.update_activity(activity).await?;

    // Trigger asset enrichment if asset changed (service handles filtering)
    if updated.asset_id != previous.asset_id {
        if let Some(ref asset_id) = updated.asset_id {
            let asset_service = state.asset_service.clone();
            let asset_id = asset_id.clone();
            tokio::spawn(async move {
                let _ = asset_service.enrich_assets(vec![asset_id]).await;
            });
        }
    }

    trigger_activity_portfolio_job(
        state,
        vec![
            ActivityImpact::from_activity(&updated),
            ActivityImpact::from_activity(&previous),
        ],
    );
    Ok(Json(updated))
}

async fn save_activities(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ActivityBulkMutationRequest>,
) -> ApiResult<Json<ActivityBulkMutationResult>> {
    let result = state
        .activity_service
        .bulk_mutate_activities(request)
        .await?;

    // Trigger asset enrichment for all assets from created activities (service handles filtering)
    let new_asset_ids: Vec<String> = result
        .created
        .iter()
        .filter_map(|a| a.asset_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    if !new_asset_ids.is_empty() {
        info!("Triggering enrichment for {} assets from bulk mutation", new_asset_ids.len());
        let asset_service = state.asset_service.clone();
        tokio::spawn(async move {
            let _ = asset_service.enrich_assets(new_asset_ids).await;
        });
    }

    let mut impacts: Vec<ActivityImpact> = Vec::new();
    impacts.extend(result.created.iter().map(ActivityImpact::from_activity));
    impacts.extend(result.updated.iter().map(ActivityImpact::from_activity));
    impacts.extend(result.deleted.iter().map(ActivityImpact::from_activity));
    trigger_activity_portfolio_job(state, impacts);
    Ok(Json(result))
}

async fn delete_activity(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Activity>> {
    let deleted = state.activity_service.delete_activity(id).await?;
    trigger_activity_portfolio_job(state, vec![ActivityImpact::from_activity(&deleted)]);
    Ok(Json(deleted))
}

#[derive(serde::Deserialize)]
struct ImportCheckBody {
    #[serde(rename = "accountId")]
    account_id: String,
    activities: Vec<ActivityImport>,
}

async fn check_activities_import(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ImportCheckBody>,
) -> ApiResult<Json<Vec<ActivityImport>>> {
    let res = state
        .activity_service
        .check_activities_import(body.account_id, body.activities)
        .await?;
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct ImportBody {
    #[serde(rename = "accountId")]
    account_id: String,
    activities: Vec<ActivityImport>,
}

async fn import_activities(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ImportBody>,
) -> ApiResult<Json<Vec<ActivityImport>>> {
    let res = state
        .activity_service
        .import_activities(body.account_id, body.activities)
        .await?;

    // Trigger asset enrichment for all assets from imported activities (service handles filtering)
    let imported_asset_ids: Vec<String> = res
        .iter()
        .filter(|a| a.is_valid)
        .map(|a| a.symbol.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    if !imported_asset_ids.is_empty() {
        info!("Triggering enrichment for {} assets from import", imported_asset_ids.len());
        let asset_service = state.asset_service.clone();
        tokio::spawn(async move {
            let _ = asset_service.enrich_assets(imported_asset_ids).await;
        });
    }

    trigger_activity_portfolio_job(
        state,
        res.iter()
            .map(|item| {
                ActivityImpact::from_parts(
                    item.account_id.clone().unwrap_or_default(),
                    Some(item.currency.clone()),
                    Some(item.symbol.clone()),
                )
            })
            .collect(),
    );
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct MappingQuery {
    #[serde(rename = "accountId")]
    account_id: String,
}

async fn get_account_import_mapping(
    State(state): State<Arc<AppState>>,
    Query(q): Query<MappingQuery>,
) -> ApiResult<Json<ImportMappingData>> {
    let res = state.activity_service.get_import_mapping(q.account_id)?;
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct SaveMappingBody {
    mapping: ImportMappingData,
}

async fn save_account_import_mapping(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SaveMappingBody>,
) -> ApiResult<Json<ImportMappingData>> {
    let res = state
        .activity_service
        .save_import_mapping(body.mapping)
        .await?;
    Ok(Json(res))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/activities/search", post(search_activities))
        .route("/activities", post(create_activity).put(update_activity))
        .route("/activities/bulk", post(save_activities))
        .route("/activities/{id}", delete(delete_activity))
        .route("/activities/import/check", post(check_activities_import))
        .route("/activities/import", post(import_activities))
        .route(
            "/activities/import/mapping",
            get(get_account_import_mapping).post(save_account_import_mapping),
        )
}
