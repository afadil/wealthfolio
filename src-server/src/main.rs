mod api;
mod auth;
mod config;
mod error;
mod events;
mod main_lib;
mod models;
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
    let static_dir_path = std::path::Path::new(&config.static_dir);
    let router = app_router(state, &config).fallback_service(
        ServeDir::new(static_dir_path)
            // If the static directory doesn't have a specific file to serve, fallback to index.html and let the SPA handle it.
            .not_found_service(ServeFile::new(static_dir_path.join("index.html"))),
    );
    tracing::info!("Listening on {}", config.listen_addr);
    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
