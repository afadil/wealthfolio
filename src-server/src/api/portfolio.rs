use std::{convert::Infallible, sync::Arc, time::Duration};

use crate::{
    api::shared::{process_portfolio_job, PortfolioRequestBody},
    error::ApiResult,
    main_lib::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::sse::{Event as SseEvent, KeepAlive, Sse},
    routing::{get, post},
    Json, Router,
};
use futures_core::stream::Stream;
use tokio_stream::wrappers::{errors::BroadcastStreamRecvError, BroadcastStream};
use wealthfolio_core::portfolio::portfolio_model::{NewPortfolio, Portfolio, UpdatePortfolio};

async fn update_portfolio(
    State(state): State<Arc<AppState>>,
    body: Option<Json<PortfolioRequestBody>>,
) -> ApiResult<StatusCode> {
    let cfg = body
        .map(|Json(inner)| inner)
        .unwrap_or_default()
        .into_config(false);
    process_portfolio_job(state, cfg).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn recalculate_portfolio(
    State(state): State<Arc<AppState>>,
    body: Option<Json<PortfolioRequestBody>>,
) -> ApiResult<StatusCode> {
    let cfg = body
        .map(|Json(inner)| inner)
        .unwrap_or_default()
        .into_config(true);
    process_portfolio_job(state, cfg).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn stream_events(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<SseEvent, Infallible>>> {
    let receiver = BroadcastStream::new(state.event_bus.subscribe());
    let stream = tokio_stream::StreamExt::filter_map(receiver, |event| match event {
        Ok(evt) => {
            let sse_event = SseEvent::default().event(evt.name);
            let sse_event = if let Some(payload) = evt.payload {
                match sse_event.json_data(payload) {
                    Ok(ev) => ev,
                    Err(err) => {
                        tracing::error!(
                            "Failed to serialize SSE payload for {}: {}",
                            evt.name,
                            err
                        );
                        return None;
                    }
                }
            } else {
                sse_event.data("null")
            };
            Some(Ok(sse_event))
        }
        Err(BroadcastStreamRecvError::Lagged(_)) => None,
    });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    )
}

// Portfolio Management Endpoints

async fn create_portfolio(
    State(state): State<Arc<AppState>>,
    Json(new_portfolio): Json<NewPortfolio>,
) -> ApiResult<Json<Portfolio>> {
    let portfolio = state
        .portfolio_service
        .create_portfolio(new_portfolio)
        .await?;
    Ok(Json(portfolio))
}

async fn update_portfolio_endpoint(
    State(state): State<Arc<AppState>>,
    Json(update_portfolio): Json<UpdatePortfolio>,
) -> ApiResult<Json<Portfolio>> {
    let portfolio = state
        .portfolio_service
        .update_portfolio(update_portfolio)
        .await?;
    Ok(Json(portfolio))
}

async fn get_portfolio(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<Json<Portfolio>> {
    let portfolio = state.portfolio_service.get_portfolio(&id)?;
    Ok(Json(portfolio))
}

async fn list_portfolios(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Portfolio>>> {
    let portfolios = state.portfolio_service.list_portfolios()?;
    Ok(Json(portfolios))
}

async fn delete_portfolio(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    state.portfolio_service.delete_portfolio(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_portfolios_containing_account(
    State(state): State<Arc<AppState>>,
    Path(account_id): Path<String>,
) -> ApiResult<Json<Vec<Portfolio>>> {
    let portfolios = state
        .portfolio_service
        .get_portfolios_containing_account(&account_id)?;
    Ok(Json(portfolios))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/portfolio/update", post(update_portfolio))
        .route("/portfolio/recalculate", post(recalculate_portfolio))
        .route("/portfolios", post(create_portfolio))
        .route("/portfolios", get(list_portfolios))
        .route("/portfolios/:id", get(get_portfolio))
        .route(
            "/portfolios/:id",
            axum::routing::put(update_portfolio_endpoint),
        )
        .route("/portfolios/:id", axum::routing::delete(delete_portfolio))
        .route(
            "/portfolios/by-account/:account_id",
            get(get_portfolios_containing_account),
        )
        .route("/events/stream", get(stream_events))
}
