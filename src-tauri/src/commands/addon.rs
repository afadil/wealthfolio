use std::io::Read;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AddonFile {
    pub name: String,
    pub content: String,
    pub is_main: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FunctionPermission {
    /// Function name
    pub name: String,
    /// Whether this function was declared by the developer in manifest
    pub is_declared: bool,
    /// Whether this function was detected by static analysis during installation
    pub is_detected: bool,
    /// ISO timestamp when this function was detected (if is_detected is true)
    pub detected_at: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AddonPermission {
    pub category: String,
    pub functions: Vec<FunctionPermission>,
    pub purpose: String,
}

/// Base addon manifest structure matching the SDK
/// This represents what developers write in their manifest.json
#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AddonManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    #[serde(rename = "sdkVersion")]
    pub sdk_version: Option<String>,
    pub main: Option<String>,
    pub enabled: Option<bool>,
    pub permissions: Option<Vec<AddonPermission>>,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub license: Option<String>,
    #[serde(rename = "minWealthfolioVersion")]
    pub min_wealthfolio_version: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub icon: Option<String>,
}

/// Extended addon metadata with runtime and installation information
/// This matches the SDK's AddonMetadata interface
#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AddonMetadata {
    // Base manifest fields
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    #[serde(rename = "sdkVersion")]
    pub sdk_version: Option<String>,
    pub main: String, // Required after installation
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub license: Option<String>,
    #[serde(rename = "minWealthfolioVersion")]
    pub min_wealthfolio_version: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub icon: Option<String>,
    
    // Runtime fields
    pub enabled: bool, // Required after installation
    pub installed_at: String,
    pub updated_at: Option<String>,
    pub source: Option<String>, // 'local' | 'store' | 'sideload'
    pub size: Option<u64>,
    pub permissions: Option<Vec<AddonPermission>>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedAddon {
    pub metadata: AddonMetadata,
    pub files: Vec<AddonFile>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
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

/// Simple permission detection based on common API function patterns
/// Returns detected permissions that can be merged with declared ones
fn detect_addon_permissions(addon_files: &[AddonFile]) -> Vec<AddonPermission> {
    // Define known permission categories and their associated functions
    let permission_patterns = vec![
        ("portfolio", vec!["getHoldings", "getPortfolio", "getPerformance", "getAccountSummary"], "Portfolio data access"),
        ("account", vec!["getAccounts", "createAccount", "updateAccount", "deleteAccount"], "Account management"),
        ("activity", vec!["getActivities", "addActivity", "updateActivity", "deleteActivity"], "Activity management"),
        ("market-data", vec!["getMarketData", "getQuote", "getHistoricalData", "searchSymbols"], "Market data access"),
        ("goals", vec!["getGoals", "createGoal", "updateGoal", "deleteGoal"], "Goals management"),
        ("settings", vec!["getSettings", "updateSettings", "getPreferences"], "Settings access"),
        ("import-export", vec!["importData", "exportData", "uploadFile", "downloadFile"], "Data import/export"),
        ("ui", vec!["showNotification", "openModal", "updateTheme", "navigate"], "User interface"),
    ];

    let mut detected_permissions: Vec<AddonPermission> = Vec::new();
    let current_time = chrono::Utc::now().to_rfc3339();

    // Group detected functions by category
    let mut category_functions: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    // Analyze all addon files for function usage
    for file in addon_files {
        for (category, functions, _purpose) in &permission_patterns {
            for function in functions {
                // Simple pattern matching for function calls
                if file.content.contains(&format!("{}(", function)) ||
                   file.content.contains(&format!(".{}(", function)) ||
                   file.content.contains(&format!("'{}'", function)) ||
                   file.content.contains(&format!("\"{}\"", function)) {
                    
                    category_functions
                        .entry(category.to_string())
                        .or_insert_with(Vec::new)
                        .push(function.to_string());
                }
            }
        }
    }

    // Create permission objects for each category with detected functions
    for (category, functions) in category_functions {
        // Remove duplicates
        let mut unique_functions = functions;
        unique_functions.sort();
        unique_functions.dedup();

        // Find the purpose for this category
        let purpose = permission_patterns
            .iter()
            .find(|(cat, _, _)| cat == &category)
            .map(|(_, _, purpose)| purpose.to_string())
            .unwrap_or_else(|| format!("Access to {} functions", category));

        // Create FunctionPermission objects for detected functions
        let function_permissions: Vec<FunctionPermission> = unique_functions
            .into_iter()
            .map(|func_name| FunctionPermission {
                name: func_name,
                is_declared: false,
                is_detected: true,
                detected_at: Some(current_time.clone()),
            })
            .collect();

        detected_permissions.push(AddonPermission {
            category,
            functions: function_permissions,
            purpose,
        });
    }

    detected_permissions
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

    // Perform permission detection on the extracted files
    let detected_permissions = detect_addon_permissions(&extracted.files);

    // Merge declared and detected permissions
    let mut merged_permissions = Vec::new();
    
    // First, add all declared permissions and mark them as declared
    if let Some(declared_perms) = &extracted.metadata.permissions {
        for perm in declared_perms {
            merged_permissions.push(AddonPermission {
                category: perm.category.clone(),
                functions: perm.functions.clone(),
                purpose: perm.purpose.clone(),
            });
        }
    }
    
    // Then, add detected permissions and merge with declared ones
    for detected_perm in detected_permissions {
        // Check if this category already exists in declared permissions
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

    // Save manifest with runtime fields and merged permissions
    let mut metadata = extracted.metadata.clone();
    metadata.enabled = enable_after_install.unwrap_or(true);
    metadata.installed_at = chrono::Utc::now().to_rfc3339();
    metadata.permissions = Some(merged_permissions);
    
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
    let mut metadata: AddonMetadata = serde_json::from_str(&manifest_content)
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

    let homepage = manifest_json
        .get("homepage")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let repository = manifest_json
        .get("repository")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let license = manifest_json
        .get("license")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let min_wealthfolio_version = manifest_json
        .get("minWealthfolioVersion")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let keywords = manifest_json
        .get("keywords")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<Vec<String>>()
        });

    let icon = manifest_json
        .get("icon")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Parse permissions if they exist
    let permissions = manifest_json
        .get("permissions")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|perm| {
                    let category = perm.get("category")?.as_str()?.to_string();
                    let function_names = perm.get("functions")?
                        .as_array()?
                        .iter()
                        .filter_map(|f| f.as_str().map(|s| s.to_string()))
                        .collect::<Vec<String>>();
                    let purpose = perm.get("purpose")?.as_str()?.to_string();
                    
                    // Convert function names to FunctionPermission objects
                    let functions: Vec<FunctionPermission> = function_names
                        .into_iter()
                        .map(|name| FunctionPermission {
                            name,
                            is_declared: true,
                            is_detected: false,
                            detected_at: None,
                        })
                        .collect();
                    
                    Some(AddonPermission {
                        category,
                        functions,
                        purpose,
                    })
                })
                .collect::<Vec<AddonPermission>>()
        });

    Ok(AddonMetadata {
        id,
        name,
        version,
        description,
        author,
        sdk_version,
        main,
        homepage,
        repository,
        license,
        min_wealthfolio_version,
        keywords,
        icon,
        enabled: true, // Default for new addons
        installed_at: chrono::Utc::now().to_rfc3339(),
        updated_at: None,
        source: Some("local".to_string()),
        size: None,
        permissions,
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

/// Helper functions for working with function-level permissions

/// Get all declared functions from a permission
#[allow(dead_code)]
pub fn get_declared_functions(permission: &AddonPermission) -> Vec<String> {
    permission.functions
        .iter()
        .filter(|func| func.is_declared)
        .map(|func| func.name.clone())
        .collect()
}

/// Get all detected functions from a permission
#[allow(dead_code)]
pub fn get_detected_functions(permission: &AddonPermission) -> Vec<String> {
    permission.functions
        .iter()
        .filter(|func| func.is_detected)
        .map(|func| func.name.clone())
        .collect()
}

/// Get functions that were detected but not declared (potential security concern)
#[allow(dead_code)]
pub fn get_undeclared_detected_functions(permission: &AddonPermission) -> Vec<String> {
    permission.functions
        .iter()
        .filter(|func| func.is_detected && !func.is_declared)
        .map(|func| func.name.clone())
        .collect()
}

/// Check if a permission has any undeclared detected functions
#[allow(dead_code)]
pub fn has_undeclared_detected_functions(permission: &AddonPermission) -> bool {
    permission.functions
        .iter()
        .any(|func| func.is_detected && !func.is_declared)
} 