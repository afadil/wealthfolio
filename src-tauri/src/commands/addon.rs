use std::fs;
use tauri::AppHandle;
use tauri::Manager;

// Import addon modules
use crate::addons::*;

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

    let extracted = extract_addon_zip_internal(zip_data)?;
    let addon_id = extracted.metadata.id.clone();
    
    // Create addon directory
    let addon_dir = get_addon_path(&app_data_dir, &addon_id)?;
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

    // Use the already-detected permissions from extract_addon_zip_internal
    // No need to call detect_addon_permissions again since it was already done
    log::debug!("Using pre-detected permissions for addon: {}", addon_id);
    let merged_permissions = extracted.metadata.permissions.clone().unwrap_or_default();
    
    // Debug log the final merged permissions
    log::debug!("Final merged permissions for addon {}: {:#?}", addon_id, merged_permissions);
    for perm in &merged_permissions {
        log::debug!("Category '{}': {} functions", perm.category, perm.functions.len());
        for func in &perm.functions {
            log::debug!("  Function '{}': declared={}, detected={}, detected_at={:?}", 
                func.name, func.is_declared, func.is_detected, func.detected_at);
        }
    }

    // Convert to installed manifest with runtime fields and use the merged permissions
    let metadata = extracted.metadata.to_installed(enable_after_install.unwrap_or(true))?;
    
    let manifest_path = addon_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    fs::write(&manifest_path, manifest_json)
        .map_err(|e| format!("Failed to write manifest: {}", e))?;

    Ok(metadata)
}

#[tauri::command]
pub async fn list_installed_addons(
    app_handle: AppHandle,
) -> Result<Vec<InstalledAddon>, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let addons_dir = ensure_addons_directory(&app_data_dir)?;
    let mut installed_addons = Vec::new();

    if !addons_dir.exists() {
        return Ok(installed_addons);
    }

    // Read addon directories
    let entries = fs::read_dir(&addons_dir)
        .map_err(|e| format!("Failed to read addons directory: {}", e))?;

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

    let addon_dir = get_addon_path(&app_data_dir, &addon_id)?;
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
pub async fn uninstall_addon(
    app_handle: AppHandle,
    addon_id: String,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let addon_dir = get_addon_path(&app_data_dir, &addon_id)?;
    
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

    let addon_dir = get_addon_path(&app_data_dir, &addon_id)?;
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
    read_addon_files_recursive(&addon_dir, &addon_dir, &mut files)?;

    // Set the is_main flag based on metadata.main
    let main_file = metadata.get_main()?;
    for file in &mut files {
        file.is_main = file.name == main_file || 
                      file.name.ends_with(main_file) ||
                      (main_file.contains('/') && file.name == main_file);
    }

    // Verify that we found the main file
    let main_file_found = files.iter().any(|f| f.is_main);
    if !main_file_found {
        return Err(format!(
            "Main addon file '{}' not found. Available files: {}",
            main_file,
            files.iter().map(|f| f.name.as_str()).collect::<Vec<_>>().join(", ")
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
    extract_addon_zip_internal(zip_data)
}

#[tauri::command]
pub async fn redetect_addon_permissions(
    app_handle: AppHandle,
    addon_id: String,
) -> Result<Vec<AddonPermission>, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let addon_dir = get_addon_path(&app_data_dir, &addon_id)?;
    let manifest_path = addon_dir.join("manifest.json");
    
    if !manifest_path.exists() {
        return Err("Addon not found".to_string());
    }

    // Read current manifest
    let manifest_content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest file: {}", e))?;
    let mut metadata: AddonManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse manifest: {}", e))?;

    // Load addon files for permission detection
    let mut files = Vec::new();
    read_addon_files_recursive(&addon_dir, &addon_dir, &mut files)?;
    
    // Re-detect permissions
    let detected_permissions = detect_addon_permissions(&files);
    
    // Merge with existing declared permissions
    let mut merged_permissions = Vec::new();
    
    // First, preserve declared permissions
    if let Some(existing_perms) = &metadata.permissions {
        for perm in existing_perms {
            // Only preserve functions that were declared
            let declared_functions: Vec<FunctionPermission> = perm.functions
                .iter()
                .filter(|f| f.is_declared)
                .cloned()
                .collect();
            
            if !declared_functions.is_empty() {
                merged_permissions.push(AddonPermission {
                    category: perm.category.clone(),
                    functions: declared_functions,
                    purpose: perm.purpose.clone(),
                });
            }
        }
    }
    
    // Then, add detected permissions and merge with declared ones
    for detected_perm in detected_permissions {
        if let Some(existing) = merged_permissions.iter_mut().find(|p| p.category == detected_perm.category) {
            // Merge detected functions with declared functions
            for detected_func in &detected_perm.functions {
                // Check if this function already exists in declared functions
                if let Some(existing_func) = existing.functions.iter_mut().find(|f| f.name == detected_func.name) {
                    // Mark existing declared function as also detected
                    existing_func.is_detected = true;
                    existing_func.detected_at = detected_func.detected_at.clone();
                } else {
                    // Add new detected function
                    existing.functions.push(detected_func.clone());
                }
            }
        } else {
            // Add as detected-only permission category
            merged_permissions.push(detected_perm);
        }
    }
    
    // Update manifest with new permissions
    metadata.permissions = Some(merged_permissions.clone());
    
    // Write back manifest
    let manifest_json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    fs::write(&manifest_path, manifest_json)
        .map_err(|e| format!("Failed to write manifest: {}", e))?;

    Ok(merged_permissions)
}

/// Check for updates for a specific addon from the addon store
#[tauri::command]
pub async fn check_addon_update(
    addon_id: String,
    current_version: String,
) -> Result<AddonUpdateCheckResult, String> {
    // Check for updates from addon store
    match check_addon_update_from_api(&addon_id, &current_version).await {
        Ok(update_check_result) => {
            // The API already provides the complete result, just return it
            Ok(update_check_result)
        }
        Err(error) => {
            log::error!("Failed to fetch addon store info for {}: {}", addon_id, error);
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
) -> Result<Vec<AddonUpdateCheckResult>, String> {
    let installed_addons = list_installed_addons(app_handle.clone()).await?;
    let mut results = Vec::new();
    
    for addon in installed_addons {
        let result = check_addon_update(addon.metadata.id.clone(), addon.metadata.version.clone()).await?;
        results.push(result);
    }
    
    Ok(results)
}

/// Download and update an addon from the store
#[tauri::command]
pub async fn update_addon_from_store(
    app_handle: AppHandle,
    addon_id: String,
    download_url: String,
) -> Result<AddonManifest, String> {
    // Download the addon package
    let zip_data = download_addon_package(&download_url).await
        .map_err(|e| format!("Failed to download addon: {}", e))?;

    // Get the current addon state before updating
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let addon_dir = get_addon_path(&app_data_dir, &addon_id)?;
    let was_enabled = if let Ok(manifest_content) = fs::read_to_string(addon_dir.join("manifest.json")) {
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
pub async fn fetch_addon_store_listings() -> Result<Vec<serde_json::Value>, String> {
    crate::addons::service::fetch_addon_store_listings().await
}

/// Download and extract addon from store for permission analysis
#[tauri::command]
pub async fn download_and_extract_addon(
    download_url: String,
) -> Result<ExtractedAddon, String> {
    // Download the addon package
    let zip_data = download_addon_package(&download_url).await
        .map_err(|e| format!("Failed to download addon from store: {}", e))?;

    // Extract and analyze permissions directly in backend
    extract_addon_zip_internal(zip_data)
}

/// Install addon from store after user permission approval
#[tauri::command]
pub async fn install_addon_from_store(
    app_handle: AppHandle,
    download_url: String,
    enable_after_install: Option<bool>,
) -> Result<AddonManifest, String> {
    // Download the addon package
    let zip_data = download_addon_package(&download_url).await
        .map_err(|e| format!("Failed to download addon from store: {}", e))?;

    // Install directly using existing logic
    install_addon_zip(app_handle, zip_data, enable_after_install).await
}