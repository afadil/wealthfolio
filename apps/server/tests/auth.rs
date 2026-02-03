use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use axum::{
    body::{to_bytes, Body},
    http::{header, Method, Request},
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rand::{rngs::OsRng, RngCore};
use tempfile::tempdir;
use tower::ServiceExt;
use wealthfolio_server::{api::app_router, build_state, config::Config};

async fn build_test_router(password: &str) -> axum::Router {
    let tmp = tempdir().unwrap();
    std::env::set_var("WF_DB_PATH", tmp.path().join("test.db"));

    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .unwrap()
        .to_string();
    std::env::set_var("WF_AUTH_PASSWORD_HASH", password_hash);

    let mut secret_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut secret_bytes);
    let secret_b64 = BASE64.encode(secret_bytes);
    std::env::set_var("WF_SECRET_KEY", secret_b64);

    let config = Config::from_env();
    let state = build_state(&config).await.unwrap();
    app_router(state, &config)
}

fn cleanup_env() {
    for key in ["WF_DB_PATH", "WF_AUTH_PASSWORD_HASH", "WF_SECRET_KEY"] {
        std::env::remove_var(key);
    }
}

#[tokio::test]
async fn login_and_access_protected_route() {
    let password = "super-secret";
    let app = build_test_router(password).await;

    // Unauthorized request should fail
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/accounts")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 401);

    // Auth status reflects requirement
    let status_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(status_response.status(), 200);
    let status_body = to_bytes(status_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let status_json: serde_json::Value = serde_json::from_slice(&status_body).unwrap();
    assert_eq!(status_json["requiresPassword"], true);

    // Login with correct password
    let login_body = serde_json::json!({ "password": password });
    let login_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/auth/login")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(login_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login_response.status(), 200);
    let login_bytes = to_bytes(login_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let login_json: serde_json::Value = serde_json::from_slice(&login_bytes).unwrap();
    let token = login_json["accessToken"].as_str().unwrap();

    // Access with token succeeds
    let authed_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/accounts")
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(authed_response.status(), 200);

    cleanup_env();
}
