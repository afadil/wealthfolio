use std::fs;
use std::sync::Arc;
use tauri::Manager;
use tauri::{AppHandle, State};

// Import addon modules
use crate::context::ServiceContext;
use wealthfolio_core::addons::{
    self,
    AddonManifest,
    AddonUpdateCheckResult,
    AddonUpdateInfo,
    ExtractedAddon,
    InstalledAddon,
};

#[tauri::command]
pub async fn install_addon_zip(
    app_handle: AppHandle,
    zip_data: Vec<u8>,
    enable_after_install: Option<bool>,
) -> Result<AddonManifest, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let extracted = addons::extract_addon_zip_internal(zip_data)?;
    let addon_id = extracted.metadata.id.clone();

    // Create addon directory
    let addon_dir = addons::get_addon_path(&app_data_dir, &addon_id)?;
    if addon_dir.exists() {
        fs::remove_dir_all(&addon_dir)
            .map_err(|e| format!("Failed to remove existing addon directory: {}", e))?;
    }
    fs::create_dir_all(&addon_dir)
        .map_err(|e| format!("Failed to create addon directory: {}", e))?;

    // Write all addon files
    for file in &extracted.files {
        let file_path = addon_dir.join(&file.name);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create file directory: {}", e))?;
        }
        fs::write(&file_path, &file.content)
            .map_err(|e| format!("Failed to write addon file {}: {}", file.name, e))?;
    }

    // Convert to installed manifest with runtime fields and use the merged permissions
    let metadata = extracted
        .metadata
        .to_installed(enable_after_install.unwrap_or(true))?;

    let manifest_path = addon_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    fs::write(&manifest_path, manifest_json)
        .map_err(|e| format!("Failed to write manifest: {}", e))?;

    Ok(metadata)
}

#[tauri::command]
pub async fn list_installed_addons(app_handle: AppHandle) -> Result<Vec<InstalledAddon>, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let addons_dir = addons::ensure_addons_directory(&app_data_dir)?;
    let mut installed_addons = Vec::new();

    if !addons_dir.exists() {
        return Ok(installed_addons);
    }

    // Read addon directories
    let entries =
        fs::read_dir(&addons_dir).map_err(|e| format!("Failed to read addons directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let addon_dir = entry.path();

        if !addon_dir.is_dir() {
            continue;
        }

        let manifest_path = addon_dir.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }

        // Read manifest
        let manifest_content = match fs::read_to_string(&manifest_path) {
            Ok(content) => content,
            Err(e) => {
                log::error!("Failed to read manifest file {:?}: {}", manifest_path, e);
                continue;
            }
        };

        let metadata: AddonManifest = match serde_json::from_str(&manifest_content) {
            Ok(metadata) => metadata,
            Err(e) => {
                log::error!("Failed to parse manifest {:?}: {}", manifest_path, e);
                log::error!("Manifest content: {}", manifest_content);
                continue;
            }
        };

        // Determine if it's a ZIP addon (has multiple files)
        let files_count = fs::read_dir(&addon_dir)
            .map_err(|e| format!("Failed to count addon files: {}", e))?
            .count();
        let is_zip_addon = files_count > 2; // More than manifest.json and main file

        installed_addons.push(InstalledAddon {
            metadata,
            file_path: addon_dir.to_string_lossy().to_string(),
            is_zip_addon,
        });
    }

    Ok(installed_addons)
}

#[tauri::command]
pub async fn toggle_addon(
    app_handle: AppHandle,
    addon_id: String,
    enabled: bool,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let addon_dir = addons::get_addon_path(&app_data_dir, &addon_id)?;
    let manifest_path = addon_dir.join("manifest.json");

    if !manifest_path.exists() {
        return Err("Addon not found".to_string());
    }

    // Read current manifest
    let manifest_content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest file: {}", e))?;
    let mut metadata: AddonManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse manifest: {}", e))?;

    // Update enabled status
    metadata.enabled = Some(enabled);

    // Write back manifest
    let manifest_json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    fs::write(&manifest_path, manifest_json)
        .map_err(|e| format!("Failed to write manifest: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn uninstall_addon(app_handle: AppHandle, addon_id: String) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let addon_dir = addons::get_addon_path(&app_data_dir, &addon_id)?;

    if !addon_dir.exists() {
        return Err("Addon not found".to_string());
    }

    fs::remove_dir_all(&addon_dir)
        .map_err(|e| format!("Failed to remove addon directory: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_addon_for_runtime(
    app_handle: AppHandle,
    addon_id: String,
) -> Result<ExtractedAddon, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let addon_dir = addons::get_addon_path(&app_data_dir, &addon_id)?;
    let manifest_path = addon_dir.join("manifest.json");

    if !manifest_path.exists() {
        return Err("Addon not found".to_string());
    }

    // Read manifest
    let manifest_content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest file: {}", e))?;
    let metadata: AddonManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse manifest: {}", e))?;

    if !metadata.is_enabled() {
        return Err("Addon is disabled".to_string());
    }

    // Read addon files recursively
    let mut files = Vec::new();
    addons::read_addon_files_recursive(&addon_dir, &addon_dir, &mut files)?;

    // Set the is_main flag based on metadata.main
    let main_file = metadata.get_main()?;
    for file in &mut files {
        // Normalize path separators for comparison (convert backslashes to forward slashes)
        let normalized_file_name = file.name.replace('\\', "/");
        let normalized_main_file = main_file.replace('\\', "/");

        file.is_main = normalized_file_name == normalized_main_file
            || normalized_file_name.ends_with(&normalized_main_file)
            || (normalized_main_file.contains('/') && normalized_file_name == normalized_main_file);
    }

    // Verify that we found the main file
    let main_file_found = files.iter().any(|f| f.is_main);
    if !main_file_found {
        return Err(format!(
            "Main addon file '{}' not found. Available files: {}",
            main_file,
            files
                .iter()
                .map(|f| f.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    Ok(ExtractedAddon { metadata, files })
}

#[tauri::command]
pub async fn get_enabled_addons_on_startup(
    app_handle: AppHandle,
) -> Result<Vec<ExtractedAddon>, String> {
    let installed_addons = list_installed_addons(app_handle.clone()).await?;
    let mut enabled_addons = Vec::new();

    for installed in installed_addons {
        if installed.metadata.is_enabled() {
            match load_addon_for_runtime(app_handle.clone(), installed.metadata.id).await {
                Ok(addon) => enabled_addons.push(addon),
                Err(e) => {
                    log::warn!("Failed to load addon {}: {}", installed.metadata.name, e);
                    continue;
                }
            }
        }
    }

    Ok(enabled_addons)
}

// Legacy function for backward compatibility
#[tauri::command]
pub async fn extract_addon_zip(
    _app_handle: AppHandle,
    zip_data: Vec<u8>,
) -> Result<ExtractedAddon, String> {
    addons::extract_addon_zip_internal(zip_data)
}

/// Check for updates for a specific addon from the addon store
#[tauri::command]
pub async fn check_addon_update(
    addon_id: String,
    current_version: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<AddonUpdateCheckResult, String> {
    let instance_id = state.instance_id.as_str();
    // Check for updates from addon store
    match addons::check_addon_update_from_api(&addon_id, &current_version, Some(instance_id)).await {
        Ok(update_check_result) => {
            // The API already provides the complete result, just return it
            Ok(update_check_result)
        }
        Err(error) => {
            log::error!(
                "Failed to fetch addon store info for {}: {}",
                addon_id,
                error
            );
            Ok(AddonUpdateCheckResult {
                addon_id,
                update_info: AddonUpdateInfo {
                    current_version,
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
                error: Some(error),
            })
        }
    }
}

/// Check for updates for all installed addons
#[tauri::command]
pub async fn check_all_addon_updates(
    app_handle: AppHandle,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<AddonUpdateCheckResult>, String> {
    let installed_addons = list_installed_addons(app_handle.clone()).await?;
    let mut results = Vec::new();
    let instance_id = state.instance_id.as_str();

    for addon in installed_addons {
        match addons::check_addon_update_from_api(
            &addon.metadata.id,
            &addon.metadata.version,
            Some(instance_id),
        )
        .await
        {
            Ok(result) => results.push(result),
            Err(error) => {
                log::error!(
                    "Failed to check update for addon {}: {}",
                    addon.metadata.id,
                    error
                );
                // Create a fallback result with error
                results.push(AddonUpdateCheckResult {
                    addon_id: addon.metadata.id,
                    update_info: AddonUpdateInfo {
                        current_version: addon.metadata.version,
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
                    error: Some(error),
                });
            }
        }
    }

    Ok(results)
}

/// Download and update an addon from the store by ID
#[tauri::command]
pub async fn update_addon_from_store_by_id(
    app_handle: AppHandle,
    addon_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<AddonManifest, String> {
    let instance_id = state.instance_id.as_str();

    // Download the addon package using the new download API
    let zip_data = addons::download_addon_from_store(&addon_id, instance_id)
        .await
        .map_err(|e| format!("Failed to download addon: {}", e))?;

    // Get the current addon state before updating
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let addon_dir = addons::get_addon_path(&app_data_dir, &addon_id)?;
    let was_enabled =
        if let Ok(manifest_content) = fs::read_to_string(addon_dir.join("manifest.json")) {
            if let Ok(metadata) = serde_json::from_str::<AddonManifest>(&manifest_content) {
                metadata.enabled.unwrap_or(false)
            } else {
                false
            }
        } else {
            false
        };

    // Uninstall the old version first
    uninstall_addon(app_handle.clone(), addon_id.clone()).await?;

    // Install the new version, preserving the enabled state
    let new_metadata = install_addon_zip(app_handle, zip_data, Some(was_enabled)).await?;

    Ok(new_metadata)
}

/// Fetch available addons from the store
#[tauri::command]
pub async fn fetch_addon_store_listings(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<serde_json::Value>, String> {
    let instance_id = state.instance_id.as_str();
    addons::fetch_addon_store_listings(Some(instance_id)).await
}

/// Download addon to staging directory for permission review
#[tauri::command]
pub async fn download_addon_to_staging(
    app_handle: AppHandle,
    addon_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ExtractedAddon, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let instance_id = state.instance_id.as_str();

    // Download addon data
    let zip_data = addons::download_addon_from_store(&addon_id, instance_id)
        .await
        .map_err(|e| {
            // Clean up any partial staging on download failure
            let _ = addons::remove_addon_from_staging(&addon_id, &app_data_dir);
            format!("Failed to download addon: {}", e)
        })?;

    // Save to staging directory with validation
    let _staged_path = addons::save_addon_to_staging(&addon_id, &app_data_dir, &zip_data)
        .map_err(|e| format!("Failed to stage addon: {}", e))?;

    // Extract and analyze permissions
    addons::extract_addon_zip_internal(zip_data)
}

/// Install addon from staging directory after permission approval
#[tauri::command]
pub async fn install_addon_from_staging(
    app_handle: AppHandle,
    addon_id: String,
    enable_after_install: Option<bool>,
) -> Result<AddonManifest, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    // Load addon from staging
    let zip_data = addons::load_addon_from_staging(&addon_id, &app_data_dir)?;

    // Install the addon
    let result = install_addon_zip(app_handle, zip_data, enable_after_install).await;

    // Clean up staging regardless of install success/failure
    let _ = addons::remove_addon_from_staging(&addon_id, &app_data_dir);

    result
}

/// Clear specific addon from staging or entire staging directory
#[tauri::command]
pub async fn clear_addon_staging(
    app_handle: AppHandle,
    addon_id: Option<String>,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    match addon_id {
        Some(id) => addons::remove_addon_from_staging(&id, &app_data_dir),
        None => addons::clear_staging_directory(&app_data_dir),
    }
}

/// Submit or update a rating for an addon
#[tauri::command]
pub async fn submit_addon_rating(
    addon_id: String,
    rating: u8,
    review: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<serde_json::Value, String> {
    let instance_id = state.instance_id.as_str();
    addons::submit_addon_rating(&addon_id, rating, review, instance_id).await
}
