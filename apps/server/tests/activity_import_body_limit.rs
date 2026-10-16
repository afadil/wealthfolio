#![allow(clippy::unwrap_used, clippy::panic, reason = "test code")]
use std::{net::SocketAddr, time::Duration};

use axum::{body::Body, http::Request};
use tempfile::tempdir;
use tower::ServiceExt;
use wealthfolio_server::{api::app_router, build_state, config::Config};

fn test_config(db_path: String, addons_root: String) -> Config {
    Config {
        listen_addr: "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
        db_path,
        cors_allow: vec!["*".to_string()],
        request_timeout: Duration::from_secs(30),
        static_dir: "dist".to_string(),
        addons_root,
        raw_secret_key: vec![7; 32],
        secrets_encryption_key: [7; 32],
        database_key: [9; 32],
        db_encryption_required: false,
        auth: None,
        oidc: None,
        mcp_enabled: false,
        mcp_audit_enabled: true,
        mcp_allowed_hosts: None,
    }
}

/// A CSV import sends all rows in one request. A few thousand rows exceed
/// axum's 2 MB default body limit, which used to reject the whole import.
#[tokio::test]
async fn import_check_accepts_bodies_larger_than_the_default_limit() {
    let temp_dir = tempdir().unwrap();
    let path = |name: &str| temp_dir.path().join(name).to_string_lossy().into_owned();
    let config = test_config(path("app.db"), path("addons"));
    let state = build_state(&config).await.unwrap();
    let app = app_router(state, &config).unwrap();

    let row = r#"{"date":"2024-01-02","symbol":"","activityType":"DEPOSIT","currency":"EUR","amount":"10","accountId":"missing","isDraft":false,"isValid":true,"comment":"PADDING"}"#
        .replace("PADDING", &"x".repeat(1000));
    let rows = vec![row; 3_000].join(",");
    let body = format!(r#"{{"activities":[{rows}]}}"#);
    assert!(body.len() > 2 * 1024 * 1024);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/activities/import/check")
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_ne!(
        response.status(),
        413,
        "import body was rejected as too large"
    );
}
