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
use tracing::warn;
#[cfg(feature = "device-sync")]
use wealthfolio_device_sync::SyncState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::from_env();
    init_tracing();
    let state = build_state(&config).await?;

    #[cfg(feature = "device-sync")]
    #[allow(clippy::collapsible_if)]
    if features::device_sync_enabled() {
        if state
            .device_enroll_service
            .get_sync_state()
            .await
            .map(|sync_state| sync_state.state == SyncState::Ready)
            .unwrap_or(false)
        {
            if let Err(err) =
                api::device_sync_engine::ensure_background_engine_started(state.clone()).await
            {
                warn!(
                    "Failed to auto-start device sync background engine: {}",
                    err
                );
            }
        }
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
