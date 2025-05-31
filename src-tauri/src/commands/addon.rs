use std::io::Read;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct AddonFile {
    pub name: String,
    pub content: String,
    pub is_main: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct AddonMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub main: String,
    #[serde(rename = "sdkVersion")]
    pub sdk_version: Option<String>,
    // Runtime fields added when saving
    pub enabled: bool,
    pub installed_at: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ExtractedAddon {
    pub metadata: AddonMetadata,
    pub files: Vec<AddonFile>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct InstalledAddon {
    pub metadata: AddonMetadata,
    pub file_path: String,
    pub is_zip_addon: bool,
}

/// Initialize the addons directory in app_data
fn ensure_addons_directory(app_data_dir: &str) -> Result<PathBuf, String> {
    let addons_dir = Path::new(app_data_dir).join("addons");
    if !addons_dir.exists() {
        fs::create_dir_all(&addons_dir)
            .map_err(|e| format!("Failed to create addons directory: {}", e))?;
    }
    Ok(addons_dir)
}

/// Get addon directory path for a specific addon
fn get_addon_path(app_data_dir: &str, addon_id: &str) -> Result<PathBuf, String> {
    let addons_dir = ensure_addons_directory(app_data_dir)?;
    Ok(addons_dir.join(addon_id))
}

#[tauri::command]
pub async fn install_addon_zip(
    app_handle: AppHandle,
    zip_data: Vec<u8>,
    enable_after_install: Option<bool>,
) -> Result<AddonMetadata, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_str()
        .ok_or("Failed to convert app data dir path to string")?
        .to_string();

    let extracted = extract_addon_zip_internal(zip_data)?;
    let addon_id = &extracted.metadata.id;
    
    // Create addon directory
    let addon_dir = get_addon_path(&app_data_dir, addon_id)?;
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

    // Save manifest with runtime fields
    let mut metadata = extracted.metadata.clone();
    metadata.enabled = enable_after_install.unwrap_or(true);
    metadata.installed_at = chrono::Utc::now().to_rfc3339();
    
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
        
        let metadata: AddonMetadata = match serde_json::from_str(&manifest_content) {
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
    let mut metadata: AddonMetadata = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse manifest: {}", e))?;

    // Update enabled status
    metadata.enabled = enabled;

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
    let metadata: AddonMetadata = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse manifest: {}", e))?;

    if !metadata.enabled {
        return Err("Addon is disabled".to_string());
    }

    // Read addon files recursively
    let mut files = Vec::new();
    read_addon_files_recursive(&addon_dir, &addon_dir, &mut files)?;

    // Set the is_main flag based on metadata.main
    for file in &mut files {
        file.is_main = file.name == metadata.main || 
                      file.name.ends_with(&metadata.main) ||
                      (metadata.main.contains('/') && file.name == metadata.main);
    }

    // Verify that we found the main file
    let main_file_found = files.iter().any(|f| f.is_main);
    if !main_file_found {
        return Err(format!(
            "Main addon file '{}' not found. Available files: {}",
            metadata.main,
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
        if installed.metadata.enabled {
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

fn extract_addon_zip_internal(zip_data: Vec<u8>) -> Result<ExtractedAddon, String> {
    use zip::ZipArchive;
    use std::io::Cursor;

    let cursor = Cursor::new(zip_data);
    let mut archive = ZipArchive::new(cursor).map_err(|e| format!("Failed to read ZIP: {}", e))?;

    let mut files = Vec::new();
    let mut manifest_json: Option<String> = None;
    let mut main_file: Option<String> = None;

    // Extract all files from ZIP
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to access file {}: {}", i, e))?;
        
        if file.is_dir() {
            continue;
        }

        let file_name = file.name().to_string();
        let mut contents = String::new();
        
        file.read_to_string(&mut contents)
            .map_err(|e| format!("Failed to read file {}: {}", file_name, e))?;

        // Check for manifest.json
        if file_name == "manifest.json" || file_name.ends_with("/manifest.json") {
            manifest_json = Some(contents.clone());
        }

        // Check for main addon file (fallback detection)
        let is_main_fallback = file_name.ends_with("addon.js") || file_name.ends_with("addon.jsx") || 
                              file_name.ends_with("index.js") || file_name.ends_with("index.jsx") ||
                              file_name.contains("dist/addon.js");
        
        if is_main_fallback && main_file.is_none() {
            main_file = Some(file_name.clone());
        }

        files.push(AddonFile {
            name: file_name,
            content: contents,
            is_main: false, // Will be set correctly after parsing manifest.json
        });
    }

    // Parse metadata from manifest.json or fallback to file analysis
    let metadata = if let Some(manifest_content) = manifest_json {
        parse_manifest_json_metadata(&manifest_content)?
    } else {
        return Err("ZIP addon must contain a manifest.json file with addon metadata".to_string());
    };

    // Now set the is_main flag correctly based on the metadata.main path
    for file in &mut files {
        file.is_main = file.name == metadata.main || 
                      file.name.ends_with(&metadata.main) ||
                      (metadata.main.contains('/') && file.name == metadata.main);
    }

    // Verify that we found the main file
    let main_file_found = files.iter().any(|f| f.is_main);
    if !main_file_found {
        return Err(format!(
            "Main addon file '{}' not found. Available files: {}",
            metadata.main,
            files.iter().map(|f| f.name.as_str()).collect::<Vec<_>>().join(", ")
        ));
    }

    Ok(ExtractedAddon { metadata, files })
}

fn parse_manifest_json_metadata(
    manifest_content: &str,
) -> Result<AddonMetadata, String> {
    use serde_json::Value;

    let manifest_json: Value = serde_json::from_str(manifest_content)
        .map_err(|e| format!("Invalid manifest.json: {}", e))?;

    let id = manifest_json
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'id' field in manifest.json")?
        .to_string();

    let name = manifest_json
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'name' field in manifest.json")?
        .to_string();

    let version = manifest_json
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'version' field in manifest.json")?
        .to_string();

    let description = manifest_json
        .get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let author = manifest_json
        .get("author")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let main = manifest_json
        .get("main")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'main' field in manifest.json")?
        .to_string();

    let sdk_version = manifest_json
        .get("sdkVersion")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(AddonMetadata {
        id,
        name,
        version,
        description,
        author,
        main,
        sdk_version,
        enabled: true, // Default for new addons
        installed_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn read_addon_files_recursive(
    current_dir: &Path,
    base_dir: &Path,
    files: &mut Vec<AddonFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(current_dir)
        .map_err(|e| format!("Failed to read addon directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let file_path = entry.path();
        
        if file_path.is_dir() {
            // Recursively read subdirectories
            read_addon_files_recursive(&file_path, base_dir, files)?;
        } else if file_path.is_file() {
            let file_name = file_path.file_name().unwrap().to_string_lossy().to_string();
            
            // Skip the manifest file
            if file_name == "manifest.json" {
                continue;
            }
            
            // Get relative path from base directory
            let relative_path = file_path.strip_prefix(base_dir)
                .map_err(|e| format!("Failed to get relative path: {}", e))?;
            let relative_path_str = relative_path.to_string_lossy().to_string();
            
            let content = fs::read_to_string(&file_path)
                .map_err(|e| format!("Failed to read file {}: {}", relative_path_str, e))?;
            
            files.push(AddonFile {
                name: relative_path_str,
                content,
                is_main: false, // Will be set later in the calling function
            });
        }
    }

    Ok(())
} 