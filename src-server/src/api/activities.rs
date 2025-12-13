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
use rust_decimal::prelude::FromPrimitive;
use wealthfolio_core::activities::{
    Activity, ActivityBulkMutationRequest, ActivityBulkMutationResult, ActivityDetails,
    ActivityImport, ActivitySearchResponse, ActivityUpdate, ImportMappingData,
    MonthMetricsRequest, MonthMetricsResponse, NewActivity, SpendingTrendsRequest,
    SpendingTrendsResponse,
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
    #[serde(rename = "categoryIdFilter")]
    category_id_filter: Option<StringOrVec>,
    #[serde(rename = "eventIdFilter")]
    event_id_filter: Option<StringOrVec>,
    #[serde(rename = "assetIdKeyword")]
    asset_id_keyword: Option<String>,
    #[serde(rename = "accountTypeFilter")]
    account_type_filter: Option<StringOrVec>,
    #[serde(rename = "isCategorizedFilter")]
    is_categorized_filter: Option<bool>,
    #[serde(rename = "hasEventFilter")]
    has_event_filter: Option<bool>,
    #[serde(rename = "amountMinFilter")]
    amount_min_filter: Option<f64>,
    #[serde(rename = "amountMaxFilter")]
    amount_max_filter: Option<f64>,
    #[serde(rename = "startDateFilter")]
    start_date_filter: Option<String>,
    #[serde(rename = "endDateFilter")]
    end_date_filter: Option<String>,
    sort: Option<SortWrapper>,
    #[serde(rename = "recurrenceFilter")]
    recurrence_filter: Option<StringOrVec>,
    #[serde(rename = "hasRecurrenceFilter")]
    has_recurrence_filter: Option<bool>,
}

async fn search_activities(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ActivitySearchBody>,
) -> ApiResult<Json<ActivitySearchResponse>> {
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
    let category_ids: Option<Vec<String>> = match body.category_id_filter {
        Some(StringOrVec::One(s)) => Some(vec![s]),
        Some(StringOrVec::Many(v)) => Some(v),
        None => None,
    };
    let event_ids: Option<Vec<String>> = match body.event_id_filter {
        Some(StringOrVec::One(s)) => Some(vec![s]),
        Some(StringOrVec::Many(v)) => Some(v),
        None => None,
    };
    let account_types: Option<Vec<String>> = match body.account_type_filter {
        Some(StringOrVec::One(s)) => Some(vec![s]),
        Some(StringOrVec::Many(v)) => Some(v),
        None => None,
    };
    let recurrence_values: Option<Vec<String>> = match body.recurrence_filter {
        Some(StringOrVec::One(s)) => Some(vec![s]),
        Some(StringOrVec::Many(v)) => Some(v),
        None => None,
    };

    let amount_min = body.amount_min_filter.and_then(rust_decimal::Decimal::from_f64);
    let amount_max = body.amount_max_filter.and_then(rust_decimal::Decimal::from_f64);

    let resp = state.activity_service.search_activities(
        body.page,
        body.page_size,
        account_ids,
        types,
        category_ids,
        event_ids,
        body.asset_id_keyword,
        account_types,
        body.is_categorized_filter,
        body.has_event_filter,
        amount_min,
        amount_max,
        body.start_date_filter,
        body.end_date_filter,
        sort_normalized,
        recurrence_values,
        body.has_recurrence_filter,
    )?;
    Ok(Json(resp))
}

async fn create_activity(
    State(state): State<Arc<AppState>>,
    Json(activity): Json<NewActivity>,
) -> ApiResult<Json<Activity>> {
    let created = state.activity_service.create_activity(activity).await?;
    trigger_activity_portfolio_job(state, vec![ActivityImpact::from_activity(&created)]);
    Ok(Json(created))
}

async fn update_activity(
    State(state): State<Arc<AppState>>,
    Json(activity): Json<ActivityUpdate>,
) -> ApiResult<Json<Activity>> {
    let previous = state.activity_service.get_activity(&activity.id)?;
    let updated = state.activity_service.update_activity(activity).await?;
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

#[derive(serde::Deserialize)]
struct TopSpendingTransactionsBody {
    month: String,
    limit: i64,
}

async fn get_top_spending_transactions(
    State(state): State<Arc<AppState>>,
    Json(body): Json<TopSpendingTransactionsBody>,
) -> ApiResult<Json<Vec<ActivityDetails>>> {
    let res = state
        .activity_service
        .get_top_spending_transactions(body.month, body.limit)?;
    Ok(Json(res))
}

async fn get_spending_trends(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SpendingTrendsRequest>,
) -> ApiResult<Json<SpendingTrendsResponse>> {
    let res = state.activity_service.get_spending_trends(body)?;
    Ok(Json(res))
}

async fn get_month_metrics(
    State(state): State<Arc<AppState>>,
    Json(body): Json<MonthMetricsRequest>,
) -> ApiResult<Json<MonthMetricsResponse>> {
    let res = state.activity_service.get_month_metrics(body)?;
    Ok(Json(res))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/activities/search", post(search_activities))
        .route("/activities/top-spending", post(get_top_spending_transactions))
        .route("/activities/spending-trends", post(get_spending_trends))
        .route("/activities/month-metrics", post(get_month_metrics))
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
