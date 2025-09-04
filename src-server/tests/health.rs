use wealthfolio_server::{config::Config, api::app_router, build_state};
use axum::{body::Body, http::Request};
use tower::ServiceExt;
use tempfile::tempdir;

#[tokio::test]
async fn healthz_works() {
    let tmp = tempdir().unwrap();
    std::env::set_var("WF_DB_PATH", tmp.path().join("test.db"));
    let config = Config::from_env();
    let state = build_state(&config).await.unwrap();
    let app = app_router(state, &config);

    let response = app
        .oneshot(Request::builder().uri("/api/v1/healthz").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
}
