mod api;
mod config;
mod error;
mod models;
mod main_lib;

use api::app_router;
use config::Config;
use main_lib::{init_tracing, build_state};
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::from_env();
    init_tracing();
    let state = build_state(&config).await?;
    let router = app_router(state, &config).fallback_service(ServeDir::new(&config.static_dir));
    tracing::info!("Listening on {}", config.listen_addr);
    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
