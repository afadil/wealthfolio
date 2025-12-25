use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::post,
    Json, Router,
};

#[derive(serde::Deserialize)]
struct SecretSetBody {
    #[serde(rename = "secretKey")]
    secret_key: String,
    secret: String,
}

async fn set_secret(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SecretSetBody>,
) -> ApiResult<StatusCode> {
    state
        .secret_store
        .set_secret(&body.secret_key, &body.secret)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct SecretQuery {
    #[serde(rename = "secretKey")]
    secret_key: String,
}

async fn get_secret(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SecretQuery>,
) -> ApiResult<Json<Option<String>>> {
    let val = state.secret_store.get_secret(&q.secret_key)?;
    Ok(Json(val))
}

async fn delete_secret(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SecretQuery>,
) -> ApiResult<StatusCode> {
    state.secret_store.delete_secret(&q.secret_key)?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route(
        "/secrets",
        post(set_secret).get(get_secret).delete(delete_secret),
    )
}
