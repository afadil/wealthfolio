use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use super::models::*;

// Constants
pub const ADDON_STORE_API_BASE_URL: &str = "http://localhost:4321/api/addons";

/// Initialize the addons directory in app_data
pub fn ensure_addons_directory(app_data_dir: &str) -> Result<PathBuf, String> {
    let addons_dir = Path::new(app_data_dir).join("addons");
    if !addons_dir.exists() {
        fs::create_dir_all(&addons_dir)
            .map_err(|e| format!("Failed to create addons directory: {}", e))?;
    }
    Ok(addons_dir)
}

/// Get addon directory path for a specific addon
pub fn get_addon_path(app_data_dir: &str, addon_id: &str) -> Result<PathBuf, String> {
    let addons_dir = ensure_addons_directory(app_data_dir)?;
    Ok(addons_dir.join(addon_id))
}

/// Simple permission detection based on common API function patterns
/// Returns detected permissions that can be merged with declared ones
pub fn detect_addon_permissions(addon_files: &[AddonFile]) -> Vec<AddonPermission> {
    // Define known permission categories and their associated functions
    // Use SDK category ids and current Host API function names
    let permission_patterns = vec![
        (
            "portfolio",
            vec![
                "getHoldings",
                "getHolding",
                "update",
                "recalculate",
                "getIncomeSummary",
                "getHistoricalValuations",
                "getLatestValuations",
            ],
            "Access to portfolio holdings, valuations, and performance",
        ),
        (
            "activities",
            vec![
                "getAll",
                "search",
                "create",
                "update",
                "saveMany",
                "import",
                "checkImport",
                "getImportMapping",
                "saveImportMapping",
            ],
            "Access to transaction history and activity management",
        ),
        (
            "accounts",
            vec!["getAll", "create"],
            "Access to account information and management",
        ),
        (
            "market-data",
            vec![
                "searchTicker",
                "syncHistory",
                "sync",
                "getProviders",
                "getProfile",
                "updateProfile",
                "updateDataSource",
            ],
            "Access to quotes and market data",
        ),
        (
            "quotes",
            vec![
                "update",
                "getHistory",
            ],
            "Access to quote management",
        ),
        (
            "performance",
            vec![
                "calculateHistory",
                "calculateSummary",
                "calculateAccountsSimple",
            ],
            "Access to performance calculations",
        ),
        (
            "financial-planning",
            vec![
                "getAll",
                "create",
                "update",
                "updateAllocations",
                "getAllocations",
                "calculateDeposits",
            ],
            "Access to goals and contribution limits",
        ),
        (
            "currency",
            vec!["getAll", "update", "add"],
            "Access to exchange rates and currency data",
        ),
        (
            "settings",
            vec!["get", "update", "backupDatabase"],
            "Access to application settings",
        ),
        (
            "files",
            vec!["openCsvDialog", "openSaveDialog"],
            "Access to file dialogs",
        ),
        (
            "events",
            vec![
                // Import events
                "onDropHover",
                "onDrop",
                "onDropCancelled",
                // Portfolio events
                "onUpdateStart",
                "onUpdateComplete",
                "onUpdateError",
                // Market events
                "onSyncStart",
                "onSyncComplete",
            ],
            "Access to application events",
        ),
        (
            "ui",
            vec!["sidebar.addItem", "router.add"],
            "User interface and navigation",
        ),
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
                    // Create API-specific patterns to prevent false positives
                    let api_category = if category == &"currency" {
                        "exchangeRates"
                    } else if category == &"financial-planning" {
                        // Handle both goals and contributionLimits APIs
                        if *function == "calculateDeposits" {
                            "contributionLimits"
                        } else {
                            "goals" // Default to goals for getAll, create, update, etc.
                        }
                    } else if category == &"market-data" {
                        // Handle both market and assets APIs
                        if *function == "getProfile" || *function == "updateProfile" || *function == "updateDataSource" {
                            "assets"
                        } else {
                            "market" // Default to market for searchTicker, sync, etc.
                        }
                    } else {
                        category // Use category as-is for portfolio, activities, accounts, etc.
                    };
                    
                    let api_patterns = vec![
                        format!("api.{}.{}(", api_category, function),        // api.portfolio.getHoldings(
                        format!(".api.{}.{}(", api_category, function),       // ctx.api.portfolio.getHoldings(
                        format!("ctx.api.{}.{}(", api_category, function),    // ctx.api.portfolio.getHoldings(
                    ];
                    
                    // Handle events category with nested API structure
                    let events_patterns = if *category == "events" {
                        vec![
                            format!("ctx.api.events.import.{}(", function),    // ctx.api.events.import.onDrop(
                            format!("ctx.api.events.portfolio.{}(", function), // ctx.api.events.portfolio.onUpdateStart(
                            format!("ctx.api.events.market.{}(", function),    // ctx.api.events.market.onSyncStart(
                            format!("api.events.import.{}(", function),        // api.events.import.onDrop(
                            format!("api.events.portfolio.{}(", function),     // api.events.portfolio.onUpdateStart(
                            format!("api.events.market.{}(", function),        // api.events.market.onSyncStart(
                        ]
                    } else {
                        vec![]
                    };
                    
                    // Special patterns for non-API functions
                    let simple_patterns = if *category == "ui" {
                        vec![
                            format!("ctx.{}(", function),          // ctx.onDisable(
                        ]
                    } else {
                        vec![] // No simple patterns for API functions to prevent false positives
                    };
                    
                    // First try API-specific patterns
                    let mut pattern_found = false;
                    for pattern in &api_patterns {
                        if file.content.contains(pattern) {
                            log::debug!("Found API pattern '{}' in file '{}' for function '{}'", pattern, file.name, function);
                            category_functions
                                .entry(category.to_string())
                                .or_insert_with(Vec::new)
                                .push(function.to_string());
                            pattern_found = true;
                            break;
                        }
                    }
                    
                    // If no API pattern found, try events patterns
                    if !pattern_found {
                        for pattern in &events_patterns {
                            if file.content.contains(pattern) {
                                log::debug!("Found events pattern '{}' in file '{}' for function '{}'", pattern, file.name, function);
                                category_functions
                                    .entry(category.to_string())
                                    .or_insert_with(Vec::new)
                                    .push(function.to_string());
                                pattern_found = true;
                                break;
                            }
                        }
                    }
                    
                    // If no API or events pattern found, try simple patterns (for special cases like onDisable)
                    if !pattern_found {
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

pub fn extract_addon_zip_internal(zip_data: Vec<u8>) -> Result<ExtractedAddon, String> {
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

pub fn parse_manifest_json_metadata(
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

pub fn read_addon_files_recursive(
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

/// Check for addon updates from the API server
pub async fn check_addon_update_from_api(addon_id: &str, current_version: &str) -> Result<AddonUpdateCheckResult, String> {
    let api_url = format!("{}/update-check?addonId={}&currentVersion={}", 
                         ADDON_STORE_API_BASE_URL, addon_id, current_version);
    
    let client = reqwest::Client::new();
    let response = client
        .get(&api_url)
        .header("User-Agent", "Wealthfolio/1.0")
        .send()
        .await
        .map_err(|e| {
            log::error!("Failed to fetch addon info from API: {}", e);
            format!("Failed to fetch addon info from API: {}", e)
        })?;

    let status = response.status();

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        log::error!("API returned error {}: {}", status, error_text);
        return Err(format!("API returned error {}: {}", status, error_text));
    }

    // Get the response text first for logging
    let response_text = response.text().await
        .map_err(|e| {
            log::error!("Failed to read API response: {}", e);
            format!("Failed to read API response: {}", e)
        })?;
    
    let update_check_result: AddonUpdateCheckResult = serde_json::from_str(&response_text)
        .map_err(|e| {
            log::error!("Failed to parse API response as JSON: {}", e);
            log::error!("Response body was: {}", response_text);
            format!("Failed to parse API response: {}", e)
        })?;

    Ok(update_check_result)
}

/// Download addon package from URL
pub async fn download_addon_package(download_url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(download_url)
        .header("User-Agent", "Wealthfolio/1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to download addon package: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let zip_data = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download data: {}", e))?
        .to_vec();

    Ok(zip_data)
}

/// Fetch available addons from the store API  
pub async fn fetch_addon_store_listings() -> Result<Vec<serde_json::Value>, String> {
    // Fetch all addons and let frontend filter by status
    let api_url = ADDON_STORE_API_BASE_URL.to_string();
    
    let client = reqwest::Client::new();
    let response = client
        .get(&api_url)
        .header("User-Agent", "Wealthfolio/1.0")
        .send()
        .await
        .map_err(|e| {
            log::error!("Failed to fetch addon store listings: {}", e);
            format!("Failed to fetch addon store listings: {}", e)
        })?;

    let status = response.status();

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        log::error!("Store API returned error {}: {}", status, error_text);
        return Err(format!("Store API returned error {}: {}", status, error_text));
    }

    // Get the response text first for logging
    let response_text = response.text().await
        .map_err(|e| {
            log::error!("Failed to read store API response: {}", e);
            format!("Failed to read store API response: {}", e)
        })?;
    
    // Parse the response as an object first to handle the {"addons": [...]} structure
    let response_json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| {
            log::error!("Failed to parse store API response as JSON: {}", e);
            log::error!("Response body was: {}", response_text);
            format!("Failed to parse store API response: {}", e)
        })?;
    
    // Extract the addons array from the response object
    let store_listings = if let Some(addons) = response_json.get("addons") {
        if let Some(addons_array) = addons.as_array() {
            addons_array.clone()
        } else {
            log::error!("'addons' field is not an array in API response");
            return Err("'addons' field is not an array in API response".to_string());
        }
    } else {
        // Fallback: try to parse as direct array for backward compatibility
        if let Some(direct_array) = response_json.as_array() {
            direct_array.clone()
        } else {
            log::error!("API response is neither {{\"addons\": [...]}} nor a direct array");
            log::error!("Response structure: {}", serde_json::to_string_pretty(&response_json).unwrap_or_default());
            return Err("Invalid API response structure".to_string());
        }
    };

    Ok(store_listings)
}
