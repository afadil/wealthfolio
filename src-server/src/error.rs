use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;
use wealthfolio_core::errors::Error as CoreError;

#[allow(dead_code)]
#[derive(Error, Debug)]
pub enum ApiError {
    #[error("{0}")]
    Core(#[from] CoreError),
    #[error("Not Found")]
    NotFound,
    #[error("{0}")]
    NotImplemented(String),
    // Surface the underlying error message to help debugging during development
    #[error("{0}")]
    Anyhow(#[from] anyhow::Error),
}

#[derive(Serialize)]
struct ErrorBody {
    code: u16,
    message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            ApiError::Core(e) => (StatusCode::BAD_REQUEST, e.to_string()),
            ApiError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            ApiError::NotImplemented(reason) => (StatusCode::NOT_IMPLEMENTED, reason.clone()),
            ApiError::Anyhow(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };
        let body = Json(ErrorBody {
            code: status.as_u16(),
            message: msg,
        });
        (status, body).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
