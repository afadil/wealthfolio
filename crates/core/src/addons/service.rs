use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use super::models::*;

// Constants
pub const ADDON_STORE_API_BASE_URL: &str = "https://wealthfolio.app/api/addons";

/// Helper function to create a request with common headers
fn create_request_with_headers(
    client: &reqwest::Client,
    method: reqwest::Method,
    url: &str,
    instance_id: Option<&str>,
) -> reqwest::RequestBuilder {
    let mut request = client.request(method, url);

    // Always add User-Agent, with version if available
    let app_version = option_env!("CARGO_PKG_VERSION");
    let user_agent = if let Some(version) = app_version {
        format!("Wealthfolio/{}", version)
    } else {
        "Wealthfolio".to_string()
    };
    request = request.header("User-Agent", user_agent);

    // Add X-App-Version header only if version is available
    if let Some(version) = app_version {
        request = request.header("X-App-Version", version);
    }

    // Add instance ID header if provided
    if let Some(instance_id) = instance_id {
        request = request.header("X-Instance-Id", instance_id);
    }

    request
}

/// Helper function to handle API response and parse JSON
async fn handle_api_response<T>(response: reqwest::Response, operation: &str) -> Result<T, String>
where
    T: serde::de::DeserializeOwned,
{
    let status = response.status();

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        log::error!(
            "{} API returned error {}: {}",
            operation,
            status,
            error_text
        );
        return Err(format!(
            "{} API returned error {}: {}",
            operation, status, error_text
        ));
    }

    let response_text = response.text().await.map_err(|e| {
        log::error!("Failed to read {} API response: {}", operation, e);
        format!("Failed to read {} API response: {}", operation, e)
    })?;

    serde_json::from_str(&response_text).map_err(|e| {
        log::error!("Failed to parse {} API response as JSON: {}", operation, e);
        log::error!("Response body was: {}", response_text);
        format!("Failed to parse {} API response: {}", operation, e)
    })
}

/// Initialize the addons directory in the provided data root
pub fn ensure_addons_directory(base_dir: impl AsRef<Path>) -> Result<PathBuf, String> {
    let addons_dir = base_dir.as_ref().join("addons");
    if !addons_dir.exists() {
        fs::create_dir_all(&addons_dir)
            .map_err(|e| format!("Failed to create addons directory: {}", e))?;
    }
    Ok(addons_dir)
}

/// Get addon directory path for a specific addon
pub fn get_addon_path(base_dir: impl AsRef<Path>, addon_id: &str) -> Result<PathBuf, String> {
    let addons_dir = ensure_addons_directory(base_dir)?;
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
            vec!["update", "getHistory"],
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
            vec!["sidebar.addItem", "router.add", "onDisable"],
            "User interface and navigation",
        ),
    ];

    let mut detected_permissions: Vec<AddonPermission> = Vec::new();
    let current_time = chrono::Utc::now().to_rfc3339();

    // Group detected functions by category
    let mut category_functions: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();

    // Analyze all addon files for function usage
    for file in addon_files {
        log::debug!(
            "Analyzing file: {} (size: {} chars)",
            file.name,
            file.content.len()
        );

        for (category, functions, _purpose) in &permission_patterns {
            for function in functions {
                let mut function_detected = false;

                // For dotted function names (e.g., "sidebar.addItem"), check for the full pattern first
                if function.contains('.') {
                    let parts: Vec<&str> = function.split('.').collect();
                    if parts.len() == 2 {
                        let dotted_patterns = vec![
                            format!(".{}.{}(", parts[0], parts[1]), // ctx.sidebar.addItem(
                            format!("{}.{}(", parts[0], parts[1]),  // sidebar.addItem(
                            format!("ctx.{}.{}(", parts[0], parts[1]), // ctx.sidebar.addItem(
                        ];

                        for pattern in &dotted_patterns {
                            if file.content.contains(pattern) {
                                log::debug!(
                                    "Found dotted pattern '{}' in file '{}' for function '{}'",
                                    pattern,
                                    file.name,
                                    function
                                );
                                category_functions
                                    .entry(category.to_string())
                                    .or_default()
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
                        if *function == "getProfile"
                            || *function == "updateProfile"
                            || *function == "updateDataSource"
                        {
                            "assets"
                        } else {
                            "market" // Default to market for searchTicker, sync, etc.
                        }
                    } else {
                        category // Use category as-is for portfolio, activities, accounts, etc.
                    };

                    let api_patterns = vec![
                        format!("api.{}.{}(", api_category, function), // api.portfolio.getHoldings(
                        format!(".api.{}.{}(", api_category, function), // ctx.api.portfolio.getHoldings(
                        format!("ctx.api.{}.{}(", api_category, function), // ctx.api.portfolio.getHoldings(
                    ];

                    // Handle events category with nested API structure
                    let events_patterns = if *category == "events" {
                        vec![
                            format!("ctx.api.events.import.{}(", function), // ctx.api.events.import.onDrop(
                            format!("ctx.api.events.portfolio.{}(", function), // ctx.api.events.portfolio.onUpdateStart(
                            format!("ctx.api.events.market.{}(", function), // ctx.api.events.market.onSyncStart(
                            format!("api.events.import.{}(", function), // api.events.import.onDrop(
                            format!("api.events.portfolio.{}(", function), // api.events.portfolio.onUpdateStart(
                            format!("api.events.market.{}(", function), // api.events.market.onSyncStart(
                        ]
                    } else {
                        vec![]
                    };

                    // Special patterns for non-API functions
                    let simple_patterns = if *category == "ui" {
                        vec![
                            format!("ctx.{}(", function), // ctx.onDisable(
                        ]
                    } else {
                        vec![] // No simple patterns for API functions to prevent false positives
                    };

                    // First try API-specific patterns
                    let mut pattern_found = false;
                    for pattern in &api_patterns {
                        if file.content.contains(pattern) {
                            log::debug!(
                                "Found API pattern '{}' in file '{}' for function '{}'",
                                pattern,
                                file.name,
                                function
                            );
                            category_functions
                                .entry(category.to_string())
                                .or_default()
                                .push(function.to_string());
                            pattern_found = true;
                            break;
                        }
                    }

                    // If no API pattern found, try events patterns
                    if !pattern_found {
                        for pattern in &events_patterns {
                            if file.content.contains(pattern) {
                                log::debug!(
                                    "Found events pattern '{}' in file '{}' for function '{}'",
                                    pattern,
                                    file.name,
                                    function
                                );
                                category_functions
                                    .entry(category.to_string())
                                    .or_default()
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
                                log::debug!(
                                    "Found simple pattern '{}' in file '{}' for function '{}'",
                                    pattern,
                                    file.name,
                                    function
                                );
                                category_functions
                                    .entry(category.to_string())
                                    .or_default()
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

    log::debug!(
        "Permission detection completed. Found {} categories with permissions",
        detected_permissions.len()
    );
    for perm in &detected_permissions {
        log::debug!(
            "Category '{}': {} functions detected",
            perm.category,
            perm.functions.len()
        );
    }

    detected_permissions
}

pub fn extract_addon_zip_internal(zip_data: Vec<u8>) -> Result<ExtractedAddon, String> {
    use std::io::Cursor;
    use zip::ZipArchive;

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
        let is_main_fallback = file_name.ends_with("addon.js")
            || file_name.ends_with("addon.jsx")
            || file_name.ends_with("index.js")
            || file_name.ends_with("index.jsx")
            || file_name.contains("dist/addon.js");

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
        file.is_main = file.name == main_file || file.name.ends_with(main_file);
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

    // Perform permission detection on the extracted files (same as install_addon_zip)
    log::debug!(
        "Starting permission detection for extracted addon: {}",
        metadata.id
    );
    log::debug!("Number of files to analyze: {}", files.len());
    for file in &files {
        log::debug!(
            "File: {} (size: {} chars, is_main: {})",
            file.name,
            file.content.len(),
            file.is_main
        );
    }

    let detected_permissions = detect_addon_permissions(&files);
    log::debug!(
        "Permission detection completed for extracted addon: {}",
        metadata.id
    );
    log::debug!(
        "Detected {} permission categories",
        detected_permissions.len()
    );

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
        if let Some(existing) = merged_permissions
            .iter_mut()
            .find(|p| p.category == detected_perm.category)
        {
            // Merge detected functions with declared functions
            for detected_func in &detected_perm.functions {
                // Check if this function already exists in declared functions
                if let Some(existing_func) = existing
                    .functions
                    .iter_mut()
                    .find(|f| f.name == detected_func.name)
                {
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
    log::debug!(
        "Final merged permissions for extracted addon {}: {:#?}",
        metadata_with_merged_permissions.id,
        merged_permissions
    );
    for perm in &merged_permissions {
        log::debug!(
            "Category '{}': {} functions",
            perm.category,
            perm.functions.len()
        );
        for func in &perm.functions {
            log::debug!(
                "  Function '{}': declared={}, detected={}",
                func.name,
                func.is_declared,
                func.is_detected
            );
        }
    }

    Ok(ExtractedAddon {
        metadata: metadata_with_merged_permissions,
        files,
    })
}

pub fn parse_manifest_json_metadata(manifest_content: &str) -> Result<AddonManifest, String> {
    // First, parse as a raw JSON value to handle the legacy format
    let raw_manifest: serde_json::Value = serde_json::from_str(manifest_content)
        .map_err(|e| format!("Invalid manifest.json: {}", e))?;

    // Parse the basic manifest fields
    let id = raw_manifest["id"]
        .as_str()
        .ok_or("Missing 'id' field in manifest.json")?
        .to_string();
    let name = raw_manifest["name"]
        .as_str()
        .ok_or("Missing 'name' field in manifest.json")?
        .to_string();
    let version = raw_manifest["version"]
        .as_str()
        .ok_or("Missing 'version' field in manifest.json")?
        .to_string();
    let main = raw_manifest["main"].as_str().map(|s| s.to_string());
    let description = raw_manifest["description"].as_str().map(|s| s.to_string());
    let author = raw_manifest["author"].as_str().map(|s| s.to_string());
    let sdk_version = raw_manifest["sdkVersion"].as_str().map(|s| s.to_string());
    let enabled = raw_manifest["enabled"].as_bool();
    let homepage = raw_manifest["homepage"].as_str().map(|s| s.to_string());
    let repository = raw_manifest["repository"].as_str().map(|s| s.to_string());
    let license = raw_manifest["license"].as_str().map(|s| s.to_string());
    let min_wealthfolio_version = raw_manifest["minWealthfolioVersion"]
        .as_str()
        .map(|s| s.to_string());
    let keywords = raw_manifest["keywords"].as_array().map(|arr| {
        arr.iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect()
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
            let category = perm_value["category"]
                .as_str()
                .ok_or("Missing 'category' field in permission")?
                .to_string();
            let purpose = perm_value["purpose"]
                .as_str()
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
                        let name = func_value["name"]
                            .as_str()
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
    let entries =
        fs::read_dir(current_dir).map_err(|e| format!("Failed to read addon directory: {}", e))?;

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
            let relative_path = file_path
                .strip_prefix(base_dir)
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
pub async fn check_addon_update_from_api(
    addon_id: &str,
    current_version: &str,
    instance_id: Option<&str>,
) -> Result<AddonUpdateCheckResult, String> {
    let api_url = format!(
        "{}/update-check?addonId={}&currentVersion={}",
        ADDON_STORE_API_BASE_URL, addon_id, current_version
    );

    let client = reqwest::Client::new();
    let response =
        create_request_with_headers(&client, reqwest::Method::GET, &api_url, instance_id)
            .send()
            .await
            .map_err(|e| {
                log::error!("Failed to fetch addon info from API: {}", e);
                format!("Failed to fetch addon info from API: {}", e)
            })?;

    handle_api_response(response, "Update check").await
}

/// Download addon package from URL
pub async fn download_addon_package(download_url: &str) -> Result<Vec<u8>, String> {
    log::info!("Downloading addon package from URL: {}", download_url);

    let client = reqwest::Client::new();
    let mut request = client.get(download_url);

    // Always add User-Agent, with version if available
    let app_version = option_env!("CARGO_PKG_VERSION");
    let user_agent = if let Some(version) = app_version {
        format!("Wealthfolio/{}", version)
    } else {
        "Wealthfolio".to_string()
    };
    request = request.header("User-Agent", user_agent);

    // Add X-App-Version header only if version is available
    if let Some(version) = app_version {
        request = request.header("X-App-Version", version);
    }

    let response = request.send().await.map_err(|e| {
        log::error!(
            "Failed to download addon package from '{}': {}",
            download_url,
            e
        );
        format!("Failed to download addon package: {}", e)
    })?;

    let status = response.status();
    log::debug!(
        "Package download response status from '{}': {}",
        download_url,
        status
    );

    if !status.is_success() {
        log::error!(
            "Package download failed with status {} from URL: {}",
            status,
            download_url
        );
        return Err(format!("Download failed with status: {}", status));
    }

    let zip_data = response
        .bytes()
        .await
        .map_err(|e| {
            log::error!(
                "Failed to read download data from '{}': {}",
                download_url,
                e
            );
            format!("Failed to read download data: {}", e)
        })?
        .to_vec();

    log::info!(
        "Successfully downloaded addon package ({} bytes) from: {}",
        zip_data.len(),
        download_url
    );

    Ok(zip_data)
}

/// Get staging directory for downloads
pub fn get_staging_directory(base_dir: impl AsRef<Path>) -> Result<PathBuf, String> {
    let staging_dir = base_dir.as_ref().join("addons").join("staging");

    if !staging_dir.exists() {
        fs::create_dir_all(&staging_dir)
            .map_err(|e| format!("Failed to create staging directory: {}", e))?;
    }

    Ok(staging_dir)
}

/// Clear staging directory
pub fn clear_staging_directory(base_dir: impl AsRef<Path>) -> Result<(), String> {
    let staging_dir = get_staging_directory(base_dir)?;

    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir)
            .map_err(|e| format!("Failed to clear staging directory: {}", e))?;

        // Recreate the empty staging directory
        fs::create_dir_all(&staging_dir)
            .map_err(|e| format!("Failed to recreate staging directory: {}", e))?;
    }

    Ok(())
}

/// Download addon from store using GET request
pub async fn download_addon_from_store(
    addon_id: &str,
    instance_id: &str,
) -> Result<Vec<u8>, String> {
    let download_api_url = format!("{}/{}/download", ADDON_STORE_API_BASE_URL, addon_id);

    log::info!(
        "Calling download API for addon '{}' at URL: {}",
        addon_id,
        download_api_url
    );
    log::debug!("Using instance ID: {}", instance_id);

    let client = reqwest::Client::new();
    let response = create_request_with_headers(
        &client,
        reqwest::Method::GET,
        &download_api_url,
        Some(instance_id),
    )
    .send()
    .await
    .map_err(|e| {
        log::error!("Failed to call download API for addon {}: {}", addon_id, e);
        format!("Failed to call download API: {}", e)
    })?;

    let status = response.status();
    log::debug!(
        "Download API response status for addon '{}': {}",
        addon_id,
        status
    );

    // Log response headers for debugging
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");
    log::debug!("Response content-type: {}", content_type);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        log::error!(
            "Download API returned error {} for addon '{}' at URL '{}': {}",
            status,
            addon_id,
            download_api_url,
            error_text
        );
        return match status.as_u16() {
            404 => Err("Addon not found or coming soon".to_string()),
            410 => Err("Addon is inactive or deprecated".to_string()),
            503 => Err("Download service temporarily unavailable".to_string()),
            _ => Err(format!(
                "Download API returned error {}: {}",
                status, error_text
            )),
        };
    }

    // Check if response is JSON (containing download URL) or direct ZIP data
    if content_type.contains("application/json") {
        log::debug!("Response is JSON, parsing for download URL");

        // Parse JSON response to get actual download URL
        let response_text = response.text().await.map_err(|e| {
            log::error!("Failed to read JSON download response: {}", e);
            format!("Failed to read download response: {}", e)
        })?;

        log::debug!("Download API JSON response: {}", response_text);

        let download_response: serde_json::Value =
            serde_json::from_str(&response_text).map_err(|e| {
                log::error!("Failed to parse download API response as JSON: {}", e);
                format!("Failed to parse download response: {}", e)
            })?;

        // Extract the actual download URL
        let actual_download_url = download_response
            .get("downloadUrl")
            .and_then(|v| v.as_str())
            .ok_or("Download API response missing downloadUrl field")?;

        log::info!(
            "Got download URL for addon '{}': {}",
            addon_id,
            actual_download_url
        );

        // Now download the actual file
        return download_addon_package(actual_download_url).await;
    } else {
        log::debug!("Response is binary data, treating as direct ZIP download");

        // Download the addon package directly (GET request returns the file)
        let zip_data = response
            .bytes()
            .await
            .map_err(|e| {
                log::error!(
                    "Failed to read download data for addon '{}': {}",
                    addon_id,
                    e
                );
                format!("Failed to read download data: {}", e)
            })?
            .to_vec();

        log::info!(
            "Successfully downloaded addon package ({} bytes) for addon '{}'",
            zip_data.len(),
            addon_id
        );

        // Quick check of downloaded data
        if zip_data.len() < 100 {
            log::warn!(
                "Downloaded data for addon '{}' is suspiciously small: {} bytes",
                addon_id,
                zip_data.len()
            );
            if !zip_data.is_empty() {
                let preview = String::from_utf8_lossy(&zip_data);
                log::debug!("Small download content: {}", preview);
            }
        }

        Ok(zip_data)
    }
}

/// Save addon data to staging directory
pub fn save_addon_to_staging(
    addon_id: &str,
    base_dir: impl AsRef<Path>,
    zip_data: &[u8],
) -> Result<PathBuf, String> {
    let staging_dir = get_staging_directory(base_dir)?;
    let staged_file_path = staging_dir.join(format!("{}.zip", addon_id));

    // Validate zip data before saving
    if zip_data.is_empty() {
        return Err("Cannot stage empty addon data".to_string());
    }

    log::debug!(
        "Validating ZIP data for addon '{}': {} bytes",
        addon_id,
        zip_data.len()
    );

    // Log first few bytes for debugging
    if zip_data.len() >= 4 {
        log::debug!(
            "First 4 bytes: {:02x} {:02x} {:02x} {:02x}",
            zip_data[0],
            zip_data[1],
            zip_data[2],
            zip_data[3]
        );
    }

    // Check for ZIP signature
    if zip_data.len() < 4 || &zip_data[0..4] != b"PK\x03\x04" {
        if zip_data.len() >= 100 {
            // Log first 100 bytes as string to see if it's an error response
            let preview = String::from_utf8_lossy(&zip_data[0..100]);
            log::error!(
                "Invalid ZIP signature for addon '{}'. Data preview: {}",
                addon_id,
                preview
            );
        }
        return Err(format!(
            "Invalid ZIP data: missing ZIP signature (got {} bytes)",
            zip_data.len()
        ));
    }

    // Quick validation that it's a valid zip
    use std::io::Cursor;
    use zip::ZipArchive;

    let cursor = Cursor::new(zip_data);
    let archive_result = ZipArchive::new(cursor);

    match archive_result {
        Ok(mut archive) => {
            log::debug!(
                "ZIP validation successful for addon '{}': {} files",
                addon_id,
                archive.len()
            );
            // Verify we can read at least the manifest
            let mut manifest_found = false;
            for i in 0..archive.len() {
                if let Ok(file) = archive.by_index(i) {
                    if file.name() == "manifest.json" || file.name().ends_with("/manifest.json") {
                        manifest_found = true;
                        break;
                    }
                }
            }
            if !manifest_found {
                log::warn!("No manifest.json found in ZIP for addon '{}'", addon_id);
            }
        }
        Err(e) => {
            log::error!("ZIP validation failed for addon '{}': {}", addon_id, e);
            return Err(format!("Invalid ZIP data for staging: {}", e));
        }
    }

    fs::write(&staged_file_path, zip_data)
        .map_err(|e| format!("Failed to write staged addon file: {}", e))?;

    log::info!(
        "Addon '{}' staged at: {:?} ({} bytes)",
        addon_id,
        staged_file_path,
        zip_data.len()
    );

    Ok(staged_file_path)
}

/// Load addon from staging directory
pub fn load_addon_from_staging(
    addon_id: &str,
    base_dir: impl AsRef<Path>,
) -> Result<Vec<u8>, String> {
    let staging_dir = get_staging_directory(base_dir)?;
    let staged_file_path = staging_dir.join(format!("{}.zip", addon_id));

    if !staged_file_path.exists() {
        return Err(format!(
            "Staged addon file not found for addon: {}",
            addon_id
        ));
    }

    let zip_data = fs::read(&staged_file_path)
        .map_err(|e| format!("Failed to read staged addon file: {}", e))?;

    log::info!(
        "Loaded addon '{}' from staging ({} bytes)",
        addon_id,
        zip_data.len()
    );

    Ok(zip_data)
}

/// Remove specific addon from staging
pub fn remove_addon_from_staging(addon_id: &str, base_dir: impl AsRef<Path>) -> Result<(), String> {
    let staging_dir = get_staging_directory(base_dir)?;
    let staged_file_path = staging_dir.join(format!("{}.zip", addon_id));

    if staged_file_path.exists() {
        fs::remove_file(&staged_file_path)
            .map_err(|e| format!("Failed to remove staged addon file: {}", e))?;
        log::info!("Removed addon '{}' from staging", addon_id);
    }

    Ok(())
}

/// Fetch available addons from the store API
pub async fn fetch_addon_store_listings(
    instance_id: Option<&str>,
) -> Result<Vec<serde_json::Value>, String> {
    // Fetch all addons and let frontend filter by status
    let api_url = ADDON_STORE_API_BASE_URL.to_string();

    let client = reqwest::Client::new();
    let response =
        create_request_with_headers(&client, reqwest::Method::GET, &api_url, instance_id)
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
        return Err(format!(
            "Store API returned error {}: {}",
            status, error_text
        ));
    }

    // Get the response text first for custom parsing
    let response_text = response.text().await.map_err(|e| {
        log::error!("Failed to read store API response: {}", e);
        format!("Failed to read store API response: {}", e)
    })?;

    // Parse the response as an object first to handle the {"addons": [...]} structure
    let response_json: serde_json::Value = serde_json::from_str(&response_text).map_err(|e| {
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
            log::error!(
                "Response structure: {}",
                serde_json::to_string_pretty(&response_json).unwrap_or_default()
            );
            return Err("Invalid API response structure".to_string());
        }
    };

    Ok(store_listings)
}

/// Submit or update a rating for an addon
pub async fn submit_addon_rating(
    addon_id: &str,
    rating: u8,
    review: Option<String>,
    instance_id: &str,
) -> Result<serde_json::Value, String> {
    if !(1..=5).contains(&rating) {
        return Err("Rating must be between 1 and 5".to_string());
    }

    let api_url = format!("{}/{}/ratings", ADDON_STORE_API_BASE_URL, addon_id);

    let mut request_body = serde_json::json!({
        "rating": rating
    });

    if let Some(review_text) = review {
        request_body["review"] = serde_json::Value::String(review_text);
    }

    let client = reqwest::Client::new();
    let response =
        create_request_with_headers(&client, reqwest::Method::POST, &api_url, Some(instance_id))
            .json(&request_body)
            .send()
            .await
            .map_err(|e| {
                log::error!("Failed to submit rating for addon {}: {}", addon_id, e);
                format!("Failed to submit rating: {}", e)
            })?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        log::error!(
            "Rating submission API returned error {} for addon {}: {}",
            status,
            addon_id,
            error_text
        );
        return Err(format!("Failed to submit rating: HTTP {}", status));
    }

    let response_text = response.text().await.map_err(|e| {
        log::error!("Failed to read rating submission API response: {}", e);
        format!("Failed to read rating submission API response: {}", e)
    })?;

    let response_json: serde_json::Value = serde_json::from_str(&response_text).map_err(|e| {
        log::error!(
            "Failed to parse rating submission API response as JSON: {}",
            e
        );
        log::error!("Response body was: {}", response_text);
        format!("Failed to parse rating submission API response: {}", e)
    })?;

    Ok(response_json)
}
