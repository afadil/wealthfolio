use std::{convert::Infallible, sync::Arc, time::Duration};

use crate::{
    api::shared::{process_portfolio_job, PortfolioRequestBody},
    error::ApiResult,
    main_lib::AppState,
};
use axum::{
    extract::State,
    http::StatusCode,
    response::sse::{Event as SseEvent, KeepAlive, Sse},
    routing::{get, post},
    Json, Router,
};
use futures_core::stream::Stream;
use tokio_stream::wrappers::{errors::BroadcastStreamRecvError, BroadcastStream};

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

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/portfolio/update", post(update_portfolio))
        .route("/portfolio/recalculate", post(recalculate_portfolio))
        .route("/events/stream", get(stream_events))
}
