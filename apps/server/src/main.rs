mod ai_environment;
mod api;
mod auth;
mod config;
mod domain_events;
mod error;
mod events;
mod features;
mod main_lib;
mod models;
mod scheduler;
mod secrets;

use api::app_router;
use config::Config;
use main_lib::{build_state, init_tracing};
use tower_http::services::{ServeDir, ServeFile};
#[cfg(feature = "device-sync")]
use tracing::{info, warn};
#[cfg(feature = "device-sync")]
use wealthfolio_device_sync::SyncState;

#[cfg(feature = "device-sync")]
fn is_expected_startup_token_warmup_error(err: &crate::error::ApiError) -> bool {
    match err {
        crate::error::ApiError::Unauthorized(_) => true,
        crate::error::ApiError::Internal(message) => {
            message.contains("No refresh token configured")
                || message.contains("Auth refresh configuration is missing")
                || message.contains("CONNECT_AUTH_URL or CONNECT_AUTH_PUBLISHABLE_KEY")
        }
        _ => false,
    }
}

#[cfg(all(test, feature = "device-sync"))]
mod tests {
    use super::*;
    use crate::error::ApiError;

    #[test]
    fn startup_token_warmup_treats_unauthorized_as_expected() {
        let err = ApiError::Unauthorized("No refresh token configured".to_string());
        assert!(is_expected_startup_token_warmup_error(&err));
    }

    #[test]
    fn startup_token_warmup_treats_missing_config_as_expected() {
        let err = ApiError::Internal(
            "CONNECT_AUTH_URL or CONNECT_AUTH_PUBLISHABLE_KEY is not configured".to_string(),
        );
        assert!(is_expected_startup_token_warmup_error(&err));
    }

    #[test]
    fn startup_token_warmup_treats_unexpected_internal_as_warning_candidate() {
        let err = ApiError::Internal("Upstream refresh timeout".to_string());
        assert!(!is_expected_startup_token_warmup_error(&err));
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::from_env();
    init_tracing();
    let state = build_state(&config).await?;

    #[cfg(feature = "device-sync")]
    #[allow(clippy::collapsible_if)]
    if features::device_sync_enabled() {
        let startup_state = state.clone();
        tokio::spawn(async move {
            if let Err(err) = api::connect::mint_access_token(&startup_state).await {
                if is_expected_startup_token_warmup_error(&err) {
                    info!(
                        "Skipping startup device sync token warmup (expected state): {}",
                        err
                    );
                } else {
                    warn!("Device sync token warmup failed during startup: {}", err);
                }
            }

            if startup_state
                .device_enroll_service
                .get_sync_state()
                .await
                .map(|sync_state| sync_state.state == SyncState::Ready)
                .unwrap_or(false)
            {
                if let Err(err) =
                    api::device_sync_engine::ensure_background_engine_started(startup_state.clone())
                        .await
                {
                    warn!(
                        "Failed to auto-start device sync background engine: {}",
                        err
                    );
                }
            }
        });
    }

    // Start background broker sync scheduler (4-hour interval)
    scheduler::start_broker_sync_scheduler(state.clone());

    let static_dir = std::path::PathBuf::from(&config.static_dir);
    let index_file = static_dir.join("index.html");
    let static_service = ServeDir::new(static_dir).fallback(ServeFile::new(index_file));
    let router = app_router(state, &config).fallback_service(static_service);
    tracing::info!("Listening on {}", config.listen_addr);
    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
