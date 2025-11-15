use std::{path::Path as StdPath, sync::Arc};

use crate::{
    error::ApiResult,
    main_lib::AppState,
};
use anyhow::Context;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use wealthfolio_core::addons::{
    self, AddonManifest, AddonUpdateCheckResult, AddonUpdateInfo, ExtractedAddon, InstalledAddon,
};

fn read_manifest_if_exists(addon_dir: &StdPath) -> anyhow::Result<Option<AddonManifest>> {
    let manifest_path = addon_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&manifest_path)
        .with_context(|| format!("Failed to read manifest {}", manifest_path.display()))?;
    let manifest = serde_json::from_str::<AddonManifest>(&content)
        .with_context(|| format!("Failed to parse manifest {}", manifest_path.display()))?;
    Ok(Some(manifest))
}

fn read_manifest_or_error(addon_dir: &StdPath) -> anyhow::Result<AddonManifest> {
    read_manifest_if_exists(addon_dir)?.ok_or_else(|| {
        anyhow::anyhow!(format!(
            "Addon manifest not found in {}",
            addon_dir.display()
        ))
    })
}

#[derive(serde::Deserialize)]
struct InstallZipBody {
    #[serde(rename = "zipData")]
    zip_data: Option<Vec<u8>>,
    #[serde(rename = "zipDataB64")]
    zip_data_b64: Option<String>,
    #[serde(rename = "enableAfterInstall")]
    enable_after_install: Option<bool>,
}

#[derive(serde::Deserialize)]
struct AddonIdBody {
    #[serde(rename = "addonId")]
    addon_id: String,
}

async fn install_addon_zip_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<InstallZipBody>,
) -> ApiResult<Json<AddonManifest>> {
    let addons_root = StdPath::new(&state.addons_root);
    let zip_bytes: Vec<u8> = if let Some(b64) = body.zip_data_b64 {
        BASE64
            .decode(b64)
            .map_err(|e| anyhow::anyhow!("Invalid base64 zipDataB64: {}", e))?
    } else if let Some(bytes) = body.zip_data {
        bytes
    } else {
        return Err(anyhow::anyhow!("Missing zip data").into());
    };
    let extracted =
        addons::extract_addon_zip_internal(zip_bytes).map_err(|e| anyhow::anyhow!(e))?;
    let addon_id = extracted.metadata.id.clone();
    let addon_dir =
        addons::get_addon_path(addons_root, &addon_id).map_err(|e| anyhow::anyhow!(e))?;
    if addon_dir.exists() {
        std::fs::remove_dir_all(&addon_dir).map_err(|e| anyhow::anyhow!("{}", e))?;
    }
    std::fs::create_dir_all(&addon_dir).map_err(|e| anyhow::anyhow!("{}", e))?;
    for file in &extracted.files {
        let file_path = addon_dir.join(&file.name);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| anyhow::anyhow!("{}", e))?;
        }
        std::fs::write(&file_path, &file.content).map_err(|e| anyhow::anyhow!("{}", e))?;
    }
    let metadata = extracted
        .metadata
        .to_installed(body.enable_after_install.unwrap_or(true))
        .map_err(|e| anyhow::anyhow!(e))?;
    let manifest_path = addon_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&metadata).map_err(|e| anyhow::anyhow!(e))?;
    std::fs::write(&manifest_path, manifest_json).map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(metadata))
}

async fn list_installed_addons_web(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<InstalledAddon>>> {
    let addons_root = StdPath::new(&state.addons_root);
    let addons_dir =
        addons::ensure_addons_directory(addons_root).map_err(|e| anyhow::anyhow!(e))?;
    let mut installed = Vec::new();
    if addons_dir.exists() {
        for entry in std::fs::read_dir(&addons_dir).map_err(|e| anyhow::anyhow!("{}", e))? {
            let entry = entry.map_err(|e| anyhow::anyhow!("{}", e))?;
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let manifest_path = dir.join("manifest.json");
            if !manifest_path.exists() {
                continue;
            }
            let content =
                std::fs::read_to_string(&manifest_path).map_err(|e| anyhow::anyhow!("{}", e))?;
            let metadata: AddonManifest =
                serde_json::from_str(&content).map_err(|e| anyhow::anyhow!("{}", e))?;
            let files_count = std::fs::read_dir(&dir)
                .map_err(|e| anyhow::anyhow!("{}", e))?
                .count();
            let is_zip_addon = files_count > 2;
            installed.push(InstalledAddon {
                metadata,
                file_path: dir.to_string_lossy().to_string(),
                is_zip_addon,
            });
        }
    }
    Ok(Json(installed))
}

async fn check_addon_update_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AddonIdBody>,
) -> ApiResult<Json<AddonUpdateCheckResult>> {
    let addons_root = StdPath::new(&state.addons_root);
    let addon_dir =
        addons::get_addon_path(addons_root, &body.addon_id).map_err(|e| anyhow::anyhow!(e))?;
    let manifest = read_manifest_or_error(&addon_dir)?;
    let result = addons::check_addon_update_from_api(
        &body.addon_id,
        &manifest.version,
        Some(state.instance_id.as_str()),
    )
    .await
    .map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(result))
}

async fn check_all_addon_updates_web(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<AddonUpdateCheckResult>>> {
    let addons_root = StdPath::new(&state.addons_root);
    let addons_dir =
        addons::ensure_addons_directory(addons_root).map_err(|e| anyhow::anyhow!(e))?;
    let mut results = Vec::new();
    if addons_dir.exists() {
        for entry in std::fs::read_dir(&addons_dir).map_err(|e| anyhow::anyhow!("{}", e))? {
            let entry = entry.map_err(|e| anyhow::anyhow!("{}", e))?;
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let manifest = match read_manifest_if_exists(&dir)? {
                Some(m) => m,
                None => continue,
            };
            let addon_id = manifest.id.clone();
            match addons::check_addon_update_from_api(
                &addon_id,
                &manifest.version,
                Some(state.instance_id.as_str()),
            )
            .await
            {
                Ok(result) => results.push(result),
                Err(err) => {
                    tracing::error!("Failed to check update for addon {}: {}", addon_id, err);
                    results.push(AddonUpdateCheckResult {
                        addon_id,
                        update_info: AddonUpdateInfo {
                            current_version: manifest.version,
                            latest_version: "unknown".to_string(),
                            update_available: false,
                            download_url: None,
                            release_notes: None,
                            release_date: None,
                            changelog_url: None,
                            is_critical: None,
                            has_breaking_changes: None,
                            min_wealthfolio_version: None,
                        },
                        error: Some(err),
                    });
                }
            }
        }
    }
    Ok(Json(results))
}

#[derive(serde::Deserialize)]
struct ToggleBody {
    #[serde(rename = "addonId")]
    addon_id: String,
    enabled: bool,
}

async fn toggle_addon_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ToggleBody>,
) -> ApiResult<StatusCode> {
    let addons_root = StdPath::new(&state.addons_root);
    let addon_dir =
        addons::get_addon_path(addons_root, &body.addon_id).map_err(|e| anyhow::anyhow!(e))?;
    let manifest_path = addon_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(anyhow::anyhow!("Addon not found").into());
    }
    let content = std::fs::read_to_string(&manifest_path).map_err(|e| anyhow::anyhow!("{}", e))?;
    let mut metadata: AddonManifest =
        serde_json::from_str(&content).map_err(|e| anyhow::anyhow!("{}", e))?;
    metadata.enabled = Some(body.enabled);
    let manifest_json =
        serde_json::to_string_pretty(&metadata).map_err(|e| anyhow::anyhow!("{}", e))?;
    std::fs::write(&manifest_path, manifest_json).map_err(|e| anyhow::anyhow!("{}", e))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn uninstall_addon_web(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    let addons_root = StdPath::new(&state.addons_root);
    let addon_dir = addons::get_addon_path(addons_root, &id).map_err(|e| anyhow::anyhow!(e))?;
    if !addon_dir.exists() {
        return Err(anyhow::anyhow!("Addon not found").into());
    }
    std::fs::remove_dir_all(&addon_dir).map_err(|e| anyhow::anyhow!("{}", e))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn load_addon_for_runtime_web(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<ExtractedAddon>> {
    let addons_root = StdPath::new(&state.addons_root);
    let addon_dir = addons::get_addon_path(addons_root, &id).map_err(|e| anyhow::anyhow!(e))?;
    let manifest_path = addon_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(anyhow::anyhow!("Addon not found").into());
    }
    let manifest_content =
        std::fs::read_to_string(&manifest_path).map_err(|e| anyhow::anyhow!("{}", e))?;
    let metadata: AddonManifest =
        serde_json::from_str(&manifest_content).map_err(|e| anyhow::anyhow!("{}", e))?;
    if !metadata.is_enabled() {
        return Err(anyhow::anyhow!("Addon is disabled").into());
    }
    let mut files = Vec::new();
    addons::read_addon_files_recursive(&addon_dir, &addon_dir, &mut files)
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    let main_file = metadata.get_main().map_err(|e| anyhow::anyhow!(e))?;
    for f in &mut files {
        let normalized_name = f.name.replace('\\', "/");
        let normalized_main = main_file.replace('\\', "/");
        f.is_main = normalized_name == normalized_main
            || normalized_name.ends_with(&normalized_main)
            || (normalized_main.contains('/') && normalized_name == normalized_main);
    }
    if !files.iter().any(|f| f.is_main) {
        return Err(anyhow::anyhow!("Main addon file not found").into());
    }
    Ok(Json(ExtractedAddon { metadata, files }))
}

async fn get_enabled_addons_on_startup_web(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<ExtractedAddon>>> {
    let installed = list_installed_addons_web(State(state.clone())).await?.0;
    let mut enabled = Vec::new();
    for item in installed {
        if item.metadata.is_enabled() {
            if let Ok(Json(extracted)) =
                load_addon_for_runtime_web(Path(item.metadata.id.clone()), State(state.clone()))
                    .await
            {
                enabled.push(extracted);
            }
        }
    }
    Ok(Json(enabled))
}

#[derive(serde::Deserialize)]
struct ExtractBody {
    #[serde(rename = "zipData")]
    zip_data: Option<Vec<u8>>,
    #[serde(rename = "zipDataB64")]
    zip_data_b64: Option<String>,
}

async fn extract_addon_zip_web(Json(body): Json<ExtractBody>) -> ApiResult<Json<ExtractedAddon>> {
    let zip_bytes: Vec<u8> = if let Some(b64) = body.zip_data_b64 {
        BASE64
            .decode(b64)
            .map_err(|e| anyhow::anyhow!("Invalid base64 zipDataB64: {}", e))?
    } else if let Some(bytes) = body.zip_data {
        bytes
    } else {
        return Err(anyhow::anyhow!("Missing zip data").into());
    };
    let extracted =
        addons::extract_addon_zip_internal(zip_bytes).map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(extracted))
}

// ====== Store + staging ======

async fn fetch_addon_store_listings_web(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<serde_json::Value>>> {
    let listings = addons::fetch_addon_store_listings(Some(state.instance_id.as_str()))
        .await
        .map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(listings))
}

#[derive(serde::Deserialize)]
struct SubmitRatingBody {
    #[serde(rename = "addonId")]
    addon_id: String,
    rating: u8,
    review: Option<String>,
}

async fn submit_addon_rating_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SubmitRatingBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let resp = addons::submit_addon_rating(
        &body.addon_id,
        body.rating,
        body.review,
        state.instance_id.as_str(),
    )
    .await
    .map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(resp))
}

#[derive(serde::Deserialize)]
struct RatingsQuery {
    #[serde(rename = "addonId")]
    addon_id: Option<String>,
}

async fn get_addon_ratings_web(_q: Query<RatingsQuery>) -> ApiResult<Json<Vec<serde_json::Value>>> {
    // Store ratings retrieval API not implemented yet; return empty list to avoid UI errors
    Ok(Json(Vec::new()))
}

#[derive(serde::Deserialize)]
struct StagingDownloadBody {
    #[serde(rename = "addonId")]
    addon_id: String,
}

async fn download_addon_to_staging_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<StagingDownloadBody>,
) -> ApiResult<Json<ExtractedAddon>> {
    let addons_root = StdPath::new(&state.addons_root);
    let zip = addons::download_addon_from_store(&body.addon_id, state.instance_id.as_str())
        .await
        .map_err(|e| {
            tracing::error!(addon_id = %body.addon_id, "download from store failed: {}", e);
            anyhow::anyhow!(format!(
                "Download from store failed for '{}': {}",
                body.addon_id, e
            ))
        })?;
    let _staged_path = addons::save_addon_to_staging(&body.addon_id, addons_root, &zip)
        .map_err(|e: String| anyhow::anyhow!(e))?;
    let extracted = addons::extract_addon_zip_internal(zip).map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(extracted))
}

#[derive(serde::Deserialize)]
struct InstallFromStagingBody {
    #[serde(rename = "addonId")]
    addon_id: String,
    #[serde(rename = "enableAfterInstall")]
    enable_after_install: Option<bool>,
}

async fn update_addon_from_store_by_id_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AddonIdBody>,
) -> ApiResult<Json<AddonManifest>> {
    let addons_root = StdPath::new(&state.addons_root);
    let addon_dir =
        addons::get_addon_path(addons_root, &body.addon_id).map_err(|e| anyhow::anyhow!(e))?;
    let was_enabled = read_manifest_if_exists(&addon_dir)?
        .and_then(|m| m.enabled)
        .unwrap_or(false);

    let zip_data = addons::download_addon_from_store(&body.addon_id, state.instance_id.as_str())
        .await
        .map_err(|e| anyhow::anyhow!(e))?;
    let extracted = addons::extract_addon_zip_internal(zip_data).map_err(|e| anyhow::anyhow!(e))?;

    if addon_dir.exists() {
        std::fs::remove_dir_all(&addon_dir)
            .map_err(|e| anyhow::anyhow!("Failed to remove addon directory: {}", e))?;
    }
    std::fs::create_dir_all(&addon_dir)
        .map_err(|e| anyhow::anyhow!("Failed to create addon directory: {}", e))?;

    for file in &extracted.files {
        let file_path = addon_dir.join(&file.name);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| anyhow::anyhow!("Failed to create addon file directory: {}", e))?;
        }
        std::fs::write(&file_path, &file.content)
            .map_err(|e| anyhow::anyhow!("Failed to write addon file: {}", e))?;
    }

    let metadata = extracted
        .metadata
        .to_installed(was_enabled)
        .map_err(|e| anyhow::anyhow!(e))?;

    let manifest_path = addon_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&metadata).map_err(|e| anyhow::anyhow!(e))?;
    std::fs::write(&manifest_path, manifest_json)
        .map_err(|e| anyhow::anyhow!("Failed to write manifest: {}", e))?;

    Ok(Json(metadata))
}

async fn install_addon_from_staging_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<InstallFromStagingBody>,
) -> ApiResult<Json<AddonManifest>> {
    let addons_root = StdPath::new(&state.addons_root);
    let zip = addons::load_addon_from_staging(&body.addon_id, addons_root)
        .map_err(|e: String| anyhow::anyhow!(e))?;
    let extracted = addons::extract_addon_zip_internal(zip).map_err(|e| anyhow::anyhow!(e))?;
    let addon_id = extracted.metadata.id.clone();
    let addon_dir =
        addons::get_addon_path(addons_root, &addon_id).map_err(|e| anyhow::anyhow!(e))?;
    if addon_dir.exists() {
        std::fs::remove_dir_all(&addon_dir).map_err(|e| anyhow::anyhow!("{}", e))?;
    }
    std::fs::create_dir_all(&addon_dir).map_err(|e| anyhow::anyhow!("{}", e))?;
    for file in &extracted.files {
        let file_path = addon_dir.join(&file.name);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| anyhow::anyhow!("{}", e))?;
        }
        std::fs::write(&file_path, &file.content).map_err(|e| anyhow::anyhow!("{}", e))?;
    }
    let metadata = extracted
        .metadata
        .to_installed(body.enable_after_install.unwrap_or(true))
        .map_err(|e| anyhow::anyhow!(e))?;
    let manifest_path = addon_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&metadata).map_err(|e| anyhow::anyhow!(e))?;
    std::fs::write(&manifest_path, manifest_json).map_err(|e| anyhow::anyhow!(e))?;
    // Clean staging file
    let _ = addons::remove_addon_from_staging(&body.addon_id, addons_root);
    Ok(Json(metadata))
}

async fn clear_addon_staging_web(
    State(state): State<Arc<AppState>>,
    Query(rq): Query<RatingsQuery>,
) -> ApiResult<StatusCode> {
    let addons_root = StdPath::new(&state.addons_root);
    if let Some(addon_id) = rq.addon_id {
        addons::remove_addon_from_staging(&addon_id, addons_root)
            .map_err(|e| anyhow::anyhow!(e))?;
    } else {
        addons::clear_staging_directory(addons_root).map_err(|e| anyhow::anyhow!(e))?;
    }
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/addons/installed", get(list_installed_addons_web))
        .route("/addons/install-zip", post(install_addon_zip_web))
        .route("/addons/toggle", post(toggle_addon_web))
        .route("/addons/{id}", delete(uninstall_addon_web))
        .route("/addons/runtime/{id}", get(load_addon_for_runtime_web))
        .route(
            "/addons/enabled-on-startup",
            get(get_enabled_addons_on_startup_web),
        )
        .route("/addons/extract", post(extract_addon_zip_web))
        .route(
            "/addons/store/listings",
            get(fetch_addon_store_listings_web),
        )
        .route(
            "/addons/store/ratings",
            post(submit_addon_rating_web).get(get_addon_ratings_web),
        )
        .route("/addons/store/check-update", post(check_addon_update_web))
        .route("/addons/store/check-all", post(check_all_addon_updates_web))
        .route(
            "/addons/store/update",
            post(update_addon_from_store_by_id_web),
        )
        .route(
            "/addons/store/staging/download",
            post(download_addon_to_staging_web),
        )
        .route(
            "/addons/store/install-from-staging",
            post(install_addon_from_staging_web),
        )
        .route("/addons/store/staging", delete(clear_addon_staging_web))
}
