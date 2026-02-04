use std::collections::HashMap;
use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Multipart, Path, Query, State},
    routing::{delete, get, post},
    Json, Router,
};
use wealthfolio_core::activities::{
    Activity, ActivityBulkMutationRequest, ActivityBulkMutationResult, ActivityImport,
    ActivitySearchResponse, ActivityUpdate, ImportActivitiesResult, ImportMappingData, NewActivity,
    ParseConfig, ParsedCsvResult,
};

use super::shared::parse_date_optional;

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
    #[serde(rename = "dateFrom")]
    date_from: Option<String>, // YYYY-MM-DD format
    #[serde(rename = "dateTo")]
    date_to: Option<String>, // YYYY-MM-DD format
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
    // Parse date filters
    let date_from_parsed = parse_date_optional(body.date_from, "dateFrom")?;
    let date_to_parsed = parse_date_optional(body.date_to, "dateTo")?;

    let resp = state.activity_service.search_activities(
        body.page,
        body.page_size,
        account_ids,
        types,
        body.asset_id_keyword,
        sort_normalized,
        body.needs_review_filter,
        date_from_parsed,
        date_to_parsed,
    )?;
    Ok(Json(resp))
}

async fn create_activity(
    State(state): State<Arc<AppState>>,
    Json(activity): Json<NewActivity>,
) -> ApiResult<Json<Activity>> {
    let created = state.activity_service.create_activity(activity).await?;

    // Domain events handle asset enrichment and portfolio recalculation
    Ok(Json(created))
}

async fn update_activity(
    State(state): State<Arc<AppState>>,
    Json(activity): Json<ActivityUpdate>,
) -> ApiResult<Json<Activity>> {
    let updated = state.activity_service.update_activity(activity).await?;
    // Domain events handle asset enrichment and portfolio recalculation
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
    // Domain events handle asset enrichment and portfolio recalculation
    Ok(Json(result))
}

async fn delete_activity(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Activity>> {
    let deleted = state.activity_service.delete_activity(id).await?;
    // Domain events handle portfolio recalculation
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
) -> ApiResult<Json<ImportActivitiesResult>> {
    let result = state
        .activity_service
        .import_activities(body.account_id, body.activities)
        .await?;
    // Domain events handle asset enrichment and portfolio recalculation
    Ok(Json(result))
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

#[derive(serde::Deserialize)]
struct CheckDuplicatesBody {
    #[serde(rename = "idempotencyKeys")]
    idempotency_keys: Vec<String>,
}

#[derive(serde::Serialize)]
struct CheckDuplicatesResponse {
    duplicates: HashMap<String, String>,
}

async fn check_existing_duplicates(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CheckDuplicatesBody>,
) -> ApiResult<Json<CheckDuplicatesResponse>> {
    let duplicates = state
        .activity_service
        .check_existing_duplicates(body.idempotency_keys)?;
    Ok(Json(CheckDuplicatesResponse { duplicates }))
}

async fn parse_csv_endpoint(
    State(_state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<Json<ParsedCsvResult>> {
    let mut file_content: Option<Vec<u8>> = None;
    let mut config = ParseConfig::default();

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        crate::error::ApiError::BadRequest(format!("Failed to read multipart field: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                file_content = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| {
                            crate::error::ApiError::BadRequest(format!(
                                "Failed to read file content: {}",
                                e
                            ))
                        })?
                        .to_vec(),
                );
            }
            "config" => {
                let config_bytes = field.bytes().await.map_err(|e| {
                    crate::error::ApiError::BadRequest(format!("Failed to read config: {}", e))
                })?;
                config = serde_json::from_slice(&config_bytes).map_err(|e| {
                    crate::error::ApiError::BadRequest(format!("Invalid config JSON: {}", e))
                })?;
            }
            _ => {}
        }
    }

    let content = file_content.ok_or_else(|| {
        crate::error::ApiError::BadRequest("Missing file in multipart request".to_string())
    })?;

    let result = wealthfolio_core::activities::parse_csv(&content, &config)?;
    Ok(Json(result))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/activities/search", post(search_activities))
        .route("/activities", post(create_activity).put(update_activity))
        .route("/activities/bulk", post(save_activities))
        .route("/activities/{id}", delete(delete_activity))
        .route("/activities/import/check", post(check_activities_import))
        .route("/activities/import", post(import_activities))
        .route("/activities/import/parse", post(parse_csv_endpoint))
        .route(
            "/activities/import/mapping",
            get(get_account_import_mapping).post(save_account_import_mapping),
        )
        .route(
            "/activities/import/check-duplicates",
            post(check_existing_duplicates),
        )
}
