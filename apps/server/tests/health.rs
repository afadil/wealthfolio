use axum::{body::Body, http::Request};
use tempfile::tempdir;
use tower::ServiceExt;
use wealthfolio_server::{api::app_router, build_state, config::Config};

#[tokio::test]
async fn healthz_works() {
    let tmp = tempdir().unwrap();
    std::env::set_var("WF_DB_PATH", tmp.path().join("test.db"));
    std::env::set_var("WF_SECRET_KEY", "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    let config = Config::from_env();
    let state = build_state(&config).await.unwrap();
    let app = app_router(state, &config);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/healthz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);

    for key in ["WF_DB_PATH", "WF_SECRET_KEY"] {
        std::env::remove_var(key);
    }
}
