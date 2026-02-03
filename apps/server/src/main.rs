mod ai_environment;
mod api;
mod auth;
mod config;
mod domain_events;
mod error;
mod events;
mod main_lib;
mod models;
mod scheduler;
mod secrets;

use api::app_router;
use config::Config;
use main_lib::{build_state, init_tracing};
use tower_http::services::{ServeDir, ServeFile};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::from_env();
    init_tracing();
    let state = build_state(&config).await?;

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
