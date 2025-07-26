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

#[derive(serde::Serialize, serde::Deserialize, Clone, PartialEq, Debug)]
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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddonPermission {
    pub category: String,
    pub functions: Vec<FunctionPermission>,
    pub purpose: String,
}

/// Unified addon manifest structure that handles both development and runtime scenarios
/// This represents both what developers write in their manifest.json and installed addon metadata
#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AddonManifest {
    // Core manifest fields (always present)
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    #[serde(rename = "sdkVersion")]
    pub sdk_version: Option<String>,
    pub main: Option<String>, // Optional in development, required after installation
    pub enabled: Option<bool>, // Optional in development, required after installation
    pub permissions: Option<Vec<AddonPermission>>,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub license: Option<String>,
    #[serde(rename = "minWealthfolioVersion")]
    pub min_wealthfolio_version: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub icon: Option<String>,
    
    // Runtime fields (only present after installation)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>, // 'local' | 'store' | 'sideload'
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

impl AddonManifest {
    /// Convert to installed manifest by adding runtime fields
    pub fn to_installed(mut self, enable_after_install: bool) -> Result<Self, String> {
        // Validate required fields for installation
        if self.main.is_none() {
            return Err("Missing 'main' field in manifest.json".to_string());
        }

        // Set runtime fields
        self.enabled = Some(enable_after_install);
        self.installed_at = Some(chrono::Utc::now().to_rfc3339());
        self.source = Some("local".to_string());

        Ok(self)
    }

    /// Get the main file path, returning an error if not set
    pub fn get_main(&self) -> Result<&str, String> {
        self.main.as_deref().ok_or("Main file not specified".to_string())
    }

    /// Get the enabled status, defaulting to true if not set
    pub fn is_enabled(&self) -> bool {
        self.enabled.unwrap_or(true)
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedAddon {
    pub metadata: AddonManifest,
    pub files: Vec<AddonFile>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAddon {
    pub metadata: AddonManifest,
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
pub fn detect_addon_permissions(addon_files: &[AddonFile]) -> Vec<AddonPermission> {
    // Define known permission categories and their associated functions
    // Prioritize full dotted function names over short names
    let permission_patterns = vec![
        ("portfolio", vec!["getHoldings", "getPortfolio", "getPerformance", "getAccountSummary", "holdings", "getHolding", "getHistoricalValuations", "calculatePerformanceHistory", "calculatePerformanceSummary"], "Portfolio data access"),
        ("account", vec!["getAccounts", "createAccount", "updateAccount", "deleteAccount"], "Account management"),
        ("activity", vec!["getActivities", "addActivity", "updateActivity", "deleteActivity"], "Activity management"),
        ("market-data", vec!["getMarketData", "getQuote", "getHistoricalData", "searchSymbols", "searchTicker", "getAssetProfile", "getQuoteHistory"], "Market data access"),
        ("goals", vec!["getGoals", "createGoal", "updateGoal", "deleteGoal"], "Goals management"),
        ("settings", vec!["getSettings", "updateSettings", "getPreferences"], "Settings access"),
        ("import-export", vec!["importData", "exportData", "uploadFile", "downloadFile"], "Data import/export"),
        ("ui", vec!["showNotification", "openModal", "updateTheme", "navigate", "onDisable", "sidebar.addItem", "router.add"], "User interface and navigation"),
    ];

    let mut detected_permissions: Vec<AddonPermission> = Vec::new();
    let current_time = chrono::Utc::now().to_rfc3339();

    // Group detected functions by category
    let mut category_functions: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    // Analyze all addon files for function usage
    for file in addon_files {
        log::debug!("Analyzing file: {} (size: {} chars)", file.name, file.content.len());
        
        for (category, functions, _purpose) in &permission_patterns {
            for function in functions {
                let mut function_detected = false;
                
                // For dotted function names (e.g., "sidebar.addItem"), check for the full pattern first
                if function.contains('.') {
                    let parts: Vec<&str> = function.split('.').collect();
                    if parts.len() == 2 {
                        let dotted_patterns = vec![
                            format!(".{}.{}(", parts[0], parts[1]),   // ctx.sidebar.addItem(
                            format!("{}.{}(", parts[0], parts[1]),    // sidebar.addItem(
                            format!("ctx.{}.{}(", parts[0], parts[1]), // ctx.sidebar.addItem(
                        ];
                        
                        for pattern in &dotted_patterns {
                            if file.content.contains(pattern) {
                                log::debug!("Found dotted pattern '{}' in file '{}' for function '{}'", pattern, file.name, function);
                                category_functions
                                    .entry(category.to_string())
                                    .or_insert_with(Vec::new)
                                    .push(function.to_string());
                                function_detected = true;
                                break;
                            }
                        }
                    }
                }
                
                // For simple function names or if dotted pattern wasn't found
                if !function_detected {
                    let simple_patterns = vec![
                        format!("{}(", function),              // getHoldings(
                        format!(".{}(", function),             // .getHoldings(
                        format!("ctx.{}(", function),          // ctx.onDisable(
                        // Remove the string literal patterns that cause false positives
                        // format!("'{}'", function),
                        // format!("\"{}\"", function),
                    ];
                    
                    for pattern in &simple_patterns {
                        if file.content.contains(pattern) {
                            log::debug!("Found simple pattern '{}' in file '{}' for function '{}'", pattern, file.name, function);
                            category_functions
                                .entry(category.to_string())
                                .or_insert_with(Vec::new)
                                .push(function.to_string());
                            break; // Only add once per function per file
                        }
                    }
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

    log::debug!("Permission detection completed. Found {} categories with permissions", detected_permissions.len());
    for perm in &detected_permissions {
        log::debug!("Category '{}': {} functions detected", perm.category, perm.functions.len());
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

    // Perform permission detection on the extracted files (same as install_addon_zip)
    log::debug!("Starting permission detection for extracted addon: {}", metadata.id);
    log::debug!("Number of files to analyze: {}", files.len());
    for file in &files {
        log::debug!("File: {} (size: {} chars, is_main: {})", file.name, file.content.len(), file.is_main);
    }
    
    let detected_permissions = detect_addon_permissions(&files);
    log::debug!("Permission detection completed for extracted addon: {}", metadata.id);
    log::debug!("Detected {} permission categories", detected_permissions.len());

    // Merge declared and detected permissions (same logic as install_addon_zip)
    let mut merged_permissions = Vec::new();
    
    // First, add all declared permissions with their original flags preserved
    if let Some(declared_perms) = &metadata.permissions {
        for perm in declared_perms {
            // Clone the permission and preserve all function flags
            let mut cloned_functions = Vec::new();
            for func in &perm.functions {
                cloned_functions.push(FunctionPermission {
                    name: func.name.clone(),
                    is_declared: func.is_declared,
                    is_detected: func.is_detected,
                    detected_at: func.detected_at.clone(),
                });
            }
            
            merged_permissions.push(AddonPermission {
                category: perm.category.clone(),
                functions: cloned_functions,
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

    // Create a metadata copy with merged permissions for the extracted addon
    let mut metadata_with_merged_permissions = metadata;
    metadata_with_merged_permissions.permissions = Some(merged_permissions.clone());
    
    // Debug log the final merged permissions
    log::debug!("Final merged permissions for extracted addon {}: {:#?}", metadata_with_merged_permissions.id, merged_permissions);
    for perm in &merged_permissions {
        log::debug!("Category '{}': {} functions", perm.category, perm.functions.len());
        for func in &perm.functions {
            log::debug!("  Function '{}': declared={}, detected={}", func.name, func.is_declared, func.is_detected);
        }
    }

    Ok(ExtractedAddon { metadata: metadata_with_merged_permissions, files })
}

fn parse_manifest_json_metadata(
    manifest_content: &str,
) -> Result<AddonManifest, String> {
    // First, parse as a raw JSON value to handle the legacy format
    let raw_manifest: serde_json::Value = serde_json::from_str(manifest_content)
        .map_err(|e| format!("Invalid manifest.json: {}", e))?;

    // Parse the basic manifest fields
    let id = raw_manifest["id"].as_str().ok_or("Missing 'id' field in manifest.json")?.to_string();
    let name = raw_manifest["name"].as_str().ok_or("Missing 'name' field in manifest.json")?.to_string();
    let version = raw_manifest["version"].as_str().ok_or("Missing 'version' field in manifest.json")?.to_string();
    let main = raw_manifest["main"].as_str().map(|s| s.to_string());
    let description = raw_manifest["description"].as_str().map(|s| s.to_string());
    let author = raw_manifest["author"].as_str().map(|s| s.to_string());
    let sdk_version = raw_manifest["sdkVersion"].as_str().map(|s| s.to_string());
    let enabled = raw_manifest["enabled"].as_bool();
    let homepage = raw_manifest["homepage"].as_str().map(|s| s.to_string());
    let repository = raw_manifest["repository"].as_str().map(|s| s.to_string());
    let license = raw_manifest["license"].as_str().map(|s| s.to_string());
    let min_wealthfolio_version = raw_manifest["minWealthfolioVersion"].as_str().map(|s| s.to_string());
    let keywords = raw_manifest["keywords"].as_array().map(|arr| {
        arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
    });
    let icon = raw_manifest["icon"].as_str().map(|s| s.to_string());

    // Validate required fields
    if main.is_none() {
        return Err("Missing 'main' field in manifest.json".to_string());
    }

    // Handle permissions - convert from legacy string array format to new FunctionPermission format
    let permissions = if let Some(perms_array) = raw_manifest["permissions"].as_array() {
        let mut converted_permissions = Vec::new();
        
        for perm_value in perms_array {
            let category = perm_value["category"].as_str()
                .ok_or("Missing 'category' field in permission")?
                .to_string();
            let purpose = perm_value["purpose"].as_str()
                .ok_or("Missing 'purpose' field in permission")?
                .to_string();
            
            // Handle both string arrays and FunctionPermission objects
            let functions = if let Some(functions_array) = perm_value["functions"].as_array() {
                let mut function_permissions = Vec::new();
                
                for func_value in functions_array {
                    if let Some(func_name) = func_value.as_str() {
                        // Legacy format: string array
                        function_permissions.push(FunctionPermission {
                            name: func_name.to_string(),
                            is_declared: true,
                            is_detected: false,
                            detected_at: None,
                        });
                    } else if func_value.is_object() {
                        // New format: FunctionPermission object
                        let name = func_value["name"].as_str()
                            .ok_or("Missing 'name' field in function permission")?
                            .to_string();
                        let is_declared = func_value["isDeclared"].as_bool().unwrap_or(true);
                        let is_detected = func_value["isDetected"].as_bool().unwrap_or(false);
                        let detected_at = func_value["detectedAt"].as_str().map(|s| s.to_string());
                        
                        function_permissions.push(FunctionPermission {
                            name,
                            is_declared,
                            is_detected,
                            detected_at,
                        });
                    }
                }
                
                function_permissions
            } else {
                return Err("Missing or invalid 'functions' field in permission".to_string());
            };
            
            converted_permissions.push(AddonPermission {
                category,
                functions,
                purpose,
            });
        }
        
        Some(converted_permissions)
    } else {
        None
    };

    // Return manifest with converted permissions but without runtime fields yet
    Ok(AddonManifest {
        id,
        name,
        version,
        description,
        author,
        sdk_version,
        main,
        enabled,
        permissions,
        homepage,
        repository,
        license,
        min_wealthfolio_version,
        keywords,
        icon,
        installed_at: None,
        updated_at: None,
        source: None,
        size: None,
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