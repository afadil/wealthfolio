use std::{collections::HashMap, path::Path as StdPath, sync::Arc};

use crate::{
    api::shared::{normalize_file_path, process_portfolio_job, PortfolioJobConfig},
    error::ApiResult,
    main_lib::AppState,
};
use anyhow::Context;
use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::StatusCode as HttpStatusCode;
use semver::Version;
use serde::Deserialize;
use tokio::{fs, task};
use wealthfolio_core::{
    db,
    settings::{Settings, SettingsServiceTrait, SettingsUpdate},
};

async fn get_settings(State(state): State<Arc<AppState>>) -> ApiResult<Json<Settings>> {
    let s = state.settings_service.get_settings()?;
    Ok(Json(s))
}

async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SettingsUpdate>,
) -> ApiResult<Json<Settings>> {
    let previous_base_currency = state.base_currency.read().unwrap().clone();
    state.settings_service.update_settings(&payload).await?;
    let updated_settings = state.settings_service.get_settings()?;

    if updated_settings.base_currency != previous_base_currency {
        *state.base_currency.write().unwrap() = updated_settings.base_currency.clone();

        let state_for_job = state.clone();
        tokio::spawn(async move {
            let job_config = PortfolioJobConfig {
                account_ids: None,
                symbols: None,
                refetch_all_market_data: true,
                force_full_recalculation: true,
            };

            if let Err(err) = process_portfolio_job(state_for_job, job_config).await {
                tracing::warn!("Base currency change recalculation failed: {}", err);
            }
        });
    }

    Ok(Json(updated_settings))
}

async fn is_auto_update_check_enabled(State(state): State<Arc<AppState>>) -> ApiResult<Json<bool>> {
    let enabled = state
        .settings_service
        .is_auto_update_check_enabled()
        .unwrap_or(true);
    Ok(Json(enabled))
}

const WEB_RUNTIME_TARGET: &str = "web-docker";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfoResponse {
    version: String,
    db_path: String,
    logs_dir: String,
}

async fn get_app_info(State(state): State<Arc<AppState>>) -> ApiResult<Json<AppInfoResponse>> {
    let version = env!("CARGO_PKG_VERSION").to_string();

    let db_path = state.db_path.clone();

    // For web mode, logs typically go to the same directory or a subdirectory
    // In production, this would typically be configured via environment variables
    let logs_dir = std::env::var("WF_LOGS_DIR").unwrap_or_else(|_| {
        StdPath::new(&state.data_root)
            .join("logs")
            .to_str()
            .unwrap_or("")
            .to_string()
    });

    Ok(Json(AppInfoResponse {
        version,
        db_path,
        logs_dir,
    }))
}

#[derive(Deserialize)]
struct UpdatePlatformInfo {
    url: Option<String>,
}

#[derive(Deserialize)]
struct UpdateCheckResponseRaw {
    version: String,
    notes: Option<String>,
    pub_date: Option<String>,
    platforms: HashMap<String, UpdatePlatformInfo>,
    changelog_url: Option<String>,
    screenshots: Option<Vec<String>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResponse {
    update_available: bool,
    latest_version: String,
    notes: Option<String>,
    pub_date: Option<String>,
    download_url: Option<String>,
    changelog_url: Option<String>,
    screenshots: Option<Vec<String>>,
}

fn normalize_target(target: Option<String>) -> String {
    match target
        .or_else(|| Some(WEB_RUNTIME_TARGET.to_string()))
        .unwrap_or_else(|| WEB_RUNTIME_TARGET.to_string())
        .to_lowercase()
        .as_str()
    {
        "macos" | "darwin" => "darwin".to_string(),
        "windows" | "win32" => "windows".to_string(),
        "linux" => "linux".to_string(),
        "web-docker" => WEB_RUNTIME_TARGET.to_string(),
        other => other.to_string(),
    }
}

fn normalize_arch(arch: Option<String>) -> String {
    match arch
        .or_else(|| Some(std::env::consts::ARCH.to_string()))
        .unwrap_or_else(|| "x86_64".to_string())
        .to_lowercase()
        .as_str()
    {
        "arm64" | "aarch64" => "aarch64".to_string(),
        "x86_64" | "x64" | "amd64" => "x86_64".to_string(),
        other => other.to_string(),
    }
}

async fn check_update(State(state): State<Arc<AppState>>) -> ApiResult<Json<UpdateCheckResponse>> {
    let current_version_str = env!("CARGO_PKG_VERSION").to_string();
    let target = normalize_target(None);
    let arch = normalize_arch(None);
    let request_url = format!(
        "https://wealthfolio.app/releases/{}/{}/{}",
        target, arch, current_version_str
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&request_url)
        .header("X-Instance-Id", state.instance_id.clone())
        .header("X-Client-Runtime", WEB_RUNTIME_TARGET)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to query update endpoint: {e}"))?;

    if response.status() == HttpStatusCode::NOT_FOUND {
        return Ok(Json(UpdateCheckResponse {
            update_available: false,
            latest_version: current_version_str,
            notes: None,
            pub_date: None,
            download_url: None,
            changelog_url: None,
            screenshots: None,
        }));
    }

    let payload: UpdateCheckResponseRaw = response
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse update response: {e}"))?;

    let current_version =
        Version::parse(&current_version_str).unwrap_or_else(|_| Version::new(0, 0, 0));
    let latest_version =
        Version::parse(&payload.version).unwrap_or_else(|_| current_version.clone());
    let update_available = latest_version > current_version;

    let platform_key = format!("{}-{}", target, arch);
    let download_url = payload
        .platforms
        .get(&platform_key)
        .and_then(|p| p.url.clone());

    Ok(Json(UpdateCheckResponse {
        update_available,
        latest_version: payload.version,
        notes: payload.notes,
        pub_date: payload.pub_date,
        download_url,
        changelog_url: payload.changelog_url,
        screenshots: payload.screenshots,
    }))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupDatabaseResponse {
    filename: String,
    data_b64: String,
}

async fn backup_database_route(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<BackupDatabaseResponse>> {
    let data_root = state.data_root.clone();
    let backup_path = task::spawn_blocking(move || db::backup_database(&data_root))
        .await
        .map_err(|e| anyhow::anyhow!("Failed to execute backup task: {}", e))??;

    let filename = StdPath::new(&backup_path)
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| anyhow::anyhow!("Invalid backup filename"))?
        .to_string();

    let bytes = fs::read(&backup_path)
        .await
        .with_context(|| format!("Failed to read backup file {}", backup_path))?;

    let data_b64 = BASE64.encode(&bytes);
    Ok(Json(BackupDatabaseResponse { filename, data_b64 }))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupToPathBody {
    #[serde(rename = "backupDir")]
    backup_dir: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupToPathResponse {
    path: String,
}

async fn backup_database_to_path_route(
    State(state): State<Arc<AppState>>,
    Json(body): Json<BackupToPathBody>,
) -> ApiResult<Json<BackupToPathResponse>> {
    let data_root = state.data_root.clone();
    let target_dir = body.backup_dir.clone();

    let backup_path = task::spawn_blocking(move || -> anyhow::Result<String> {
        let db_path = db::get_db_path(&data_root);
        let normalized_backup_dir = normalize_file_path(&target_dir);

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let backup_filename = format!("wealthfolio_backup_{}.db", timestamp);
        let backup_path = StdPath::new(&normalized_backup_dir).join(&backup_filename);

        if let Some(parent) = backup_path.parent() {
            std::fs::create_dir_all(parent).with_context(|| {
                format!("Failed to create backup directory {}", parent.display())
            })?;
        }

        let backup_path_str = backup_path
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid backup path"))?
            .to_string();

        std::fs::copy(&db_path, &backup_path_str).with_context(|| {
            format!(
                "Failed to copy database from {} to {}",
                db_path, backup_path_str
            )
        })?;

        let wal_source = format!("{}-wal", db_path);
        let wal_target = format!("{}-wal", backup_path_str);
        if StdPath::new(&wal_source).exists() {
            std::fs::copy(&wal_source, &wal_target).with_context(|| {
                format!(
                    "Failed to copy WAL file from {} to {}",
                    wal_source, wal_target
                )
            })?;
        }

        let shm_source = format!("{}-shm", db_path);
        let shm_target = format!("{}-shm", backup_path_str);
        if StdPath::new(&shm_source).exists() {
            std::fs::copy(&shm_source, &shm_target).with_context(|| {
                format!(
                    "Failed to copy SHM file from {} to {}",
                    shm_source, shm_target
                )
            })?;
        }

        Ok(backup_path_str)
    })
    .await
    .map_err(|e| anyhow::anyhow!("Failed to execute backup-to-path task: {}", e))??;

    Ok(Json(BackupToPathResponse { path: backup_path }))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreBody {
    #[serde(rename = "backupFilePath")]
    backup_file_path: String,
}

async fn restore_database_route(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RestoreBody>,
) -> ApiResult<StatusCode> {
    let data_root = state.data_root.clone();
    task::spawn_blocking(move || {
        let normalized_path = normalize_file_path(&body.backup_file_path);
        db::restore_database_safe(&data_root, &normalized_path)
            .with_context(|| format!("Failed to restore database from {}", normalized_path))
    })
    .await
    .map_err(|e| anyhow::anyhow!("Failed to execute restore task: {}", e))??;

    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/settings", get(get_settings).put(update_settings))
        .route(
            "/settings/auto-update-enabled",
            get(is_auto_update_check_enabled),
        )
        .route("/app/info", get(get_app_info))
        .route("/app/check-update", get(check_update))
        .route("/utilities/database/backup", post(backup_database_route))
        .route(
            "/utilities/database/backup-to-path",
            post(backup_database_to_path_route),
        )
        .route("/utilities/database/restore", post(restore_database_route))
}
