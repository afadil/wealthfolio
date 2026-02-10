use axum::{body::to_bytes, body::Body, http::Request};
use tempfile::tempdir;
use tower::ServiceExt;
use tower_http::services::{ServeDir, ServeFile};
use wealthfolio_server::{api::app_router, build_state, config::Config};

fn cleanup_env() {
    for key in ["WF_DB_PATH", "WF_SECRET_KEY", "WF_STATIC_DIR"] {
        std::env::remove_var(key);
    }
}

#[tokio::test]
async fn serves_index_html_for_unknown_route() {
    let db_dir = tempdir().unwrap();
    let static_dir = tempdir().unwrap();
    let index_path = static_dir.path().join("index.html");
    std::fs::write(&index_path, "<html>SPA</html>").unwrap();

    std::env::set_var("WF_DB_PATH", db_dir.path().join("test.db"));
    std::env::set_var("WF_SECRET_KEY", "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    std::env::set_var("WF_STATIC_DIR", static_dir.path());

    let config = Config::from_env();
    let state = build_state(&config).await.unwrap();
    let static_service =
        ServeDir::new(static_dir.path()).fallback(ServeFile::new(index_path.clone()));
    let app = app_router(state, &config).fallback_service(static_service);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/dashboard")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    assert_eq!(body, "<html>SPA</html>".as_bytes());

    cleanup_env();
}
