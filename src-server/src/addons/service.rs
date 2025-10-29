use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use super::models::*;

// Remote store base URL (aligns with Tauri service)
pub const ADDON_STORE_API_BASE_URL: &str = "https://wealthfolio.app/api/addons";

fn create_request_with_headers(client: &reqwest::Client, method: reqwest::Method, url: &str, instance_id: Option<&str>) -> reqwest::RequestBuilder {
    let mut request = client.request(method, url).header("User-Agent", "Wealthfolio/1.0");
    if let Some(id) = instance_id { request = request.header("X-Instance-Id", id); }
    request
}

pub fn data_root_from_db_path(db_path: &str) -> Result<PathBuf, String> {
    let p = Path::new(db_path);
    let parent = p.parent().ok_or("Invalid DB path; no parent directory")?;
    Ok(parent.to_path_buf())
}

pub fn ensure_addons_directory(data_root: &Path) -> Result<PathBuf, String> {
    let addons_dir = data_root.join("addons");
    if !addons_dir.exists() {
        fs::create_dir_all(&addons_dir).map_err(|e| format!("Failed to create addons dir: {}", e))?;
    }
    Ok(addons_dir)
}

pub fn get_addon_path(data_root: &Path, addon_id: &str) -> Result<PathBuf, String> {
    Ok(ensure_addons_directory(data_root)?.join(addon_id))
}

pub fn get_staging_directory(data_root: &Path) -> Result<PathBuf, String> {
    let dir = data_root.join("addons-staging");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create staging dir: {}", e))?;
    }
    Ok(dir)
}

pub fn clear_staging_directory(data_root: &Path) -> Result<(), String> {
    let dir = get_staging_directory(data_root)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("Failed to clear staging dir: {}", e))?;
    }
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to recreate staging dir: {}", e))?;
    Ok(())
}

pub fn remove_addon_from_staging(addon_id: &str, data_root: &Path) -> Result<(), String> {
    let dir = get_staging_directory(data_root)?;
    let path = dir.join(format!("{}.zip", addon_id));
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Failed to remove staged addon: {}", e))?;
    }
    Ok(())
}

/// Save addon data to staging directory with basic validation
pub fn save_addon_to_staging(addon_id: &str, data_root: &Path, zip_data: &[u8]) -> Result<PathBuf, String> {
    let staging_dir = get_staging_directory(data_root)?;
    let staged_file_path = staging_dir.join(format!("{}.zip", addon_id));

    if zip_data.is_empty() {
        return Err("Cannot stage empty addon data".to_string());
    }

    // Quick ZIP signature check (PK\x03\x04)
    if zip_data.len() < 4 || &zip_data[0..4] != b"PK\x03\x04" {
        return Err("Invalid ZIP data: missing ZIP signature".to_string());
    }

    // Validate zip can be opened
    use std::io::Cursor;
    use zip::ZipArchive;
    let cursor = Cursor::new(zip_data);
    let archive = ZipArchive::new(cursor).map_err(|e| format!("Invalid ZIP data for staging: {}", e))?;
    if archive.len() == 0 {
        return Err("ZIP appears to be empty".to_string());
    }

    fs::write(&staged_file_path, zip_data).map_err(|e| format!("Failed to write staged addon file: {}", e))?;
    Ok(staged_file_path)
}

/// Load addon from staging directory
pub fn load_addon_from_staging(addon_id: &str, data_root: &Path) -> Result<Vec<u8>, String> {
    let staging_dir = get_staging_directory(data_root)?;
    let staged_file_path = staging_dir.join(format!("{}.zip", addon_id));
    if !staged_file_path.exists() {
        return Err(format!("Staged addon file not found for addon: {}", addon_id));
    }
    let zip_data = fs::read(&staged_file_path).map_err(|e| format!("Failed to read staged addon file: {}", e))?;
    Ok(zip_data)
}

pub fn read_addon_files_recursive(base_dir: &Path, current_dir: &Path, files: &mut Vec<AddonFile>) -> Result<(), String> {
    for entry in fs::read_dir(current_dir).map_err(|e| format!("Failed to read dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
        let path = entry.path();
        if path.is_dir() {
            read_addon_files_recursive(base_dir, &path, files)?;
        } else if path.is_file() {
            let rel = path.strip_prefix(base_dir).unwrap_or(&path).to_string_lossy().to_string();
            let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
            files.push(AddonFile { name: rel, content, is_main: false });
        }
    }
    Ok(())
}

pub fn detect_addon_permissions(addon_files: &[AddonFile]) -> Vec<AddonPermission> {
    let permission_patterns: Vec<(&str, Vec<&str>, &str)> = vec![
        ("portfolio", vec!["getHoldings","getHolding","update","recalculate","getIncomeSummary","getHistoricalValuations","getLatestValuations"], "Access to portfolio holdings, valuations, and performance"),
        ("activities", vec!["getAll","search","create","update","saveMany","import","checkImport","getImportMapping","saveImportMapping"], "Access to transaction history and activity management"),
        ("accounts", vec!["getAll","create"], "Access to account information and management"),
        ("market-data", vec!["searchTicker","syncHistory","sync","getProviders","getProfile","updateProfile","updateDataSource"], "Access to quotes and market data"),
        ("quotes", vec!["update","getHistory"], "Access to quote management"),
        ("performance", vec!["calculateHistory","calculateSummary"], "Access to performance calculations"),
        ("settings", vec!["get","update","backup"], "Access to application settings"),
        ("files", vec!["openCsvDialog","openSaveDialog"], "Access to local file dialogs"),
        ("events", vec!["listenPortfolioUpdateStart","listenPortfolioUpdateComplete","listenPortfolioUpdateError","listenMarketSyncStart","listenMarketSyncComplete","onDisable"], "Access to application events and lifecycle"),
        ("navigation", vec!["navigateToRoute"], "Access to navigation APIs"),
        ("secrets", vec!["set","get","delete"], "Access to secrets storage"),
    ];

    let api_patterns = vec!["ctx.api.", "ctx.apiAddons.", "ctx.apiAddOn."];
    let events_patterns = vec!["ctx.onDisable(", "onDisable("];
    let simple_patterns = vec!["onDisable("];

    let current_time = chrono::Utc::now().to_rfc3339();
    let mut category_functions: HashMap<String, Vec<String>> = HashMap::new();

    for file in addon_files {
        for (category, functions, _) in &permission_patterns {
            for function in functions {
                if file.content.contains(function) {
                    let mut pattern_found = false;
                    for api in &api_patterns {
                        if file.content.contains(api) {
                            category_functions.entry(category.to_string()).or_default().push(function.to_string());
                            pattern_found = true;
                            break;
                        }
                    }
                    if !pattern_found {
                        for ev in &events_patterns {
                            if file.content.contains(ev) {
                                category_functions.entry(category.to_string()).or_default().push(function.to_string());
                                pattern_found = true;
                                break;
                            }
                        }
                    }
                    if !pattern_found {
                        for sp in &simple_patterns {
                            if file.content.contains(sp) {
                                category_functions.entry(category.to_string()).or_default().push(function.to_string());
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    let mut detected_permissions = Vec::new();
    for (category, functions) in category_functions {
        let mut unique = functions;
        unique.sort();
        unique.dedup();
        let purpose = permission_patterns
            .iter()
            .find(|(c, _, _)| c == &category)
            .map(|(_, _, p)| p.to_string())
            .unwrap_or_else(|| format!("Access to {} functions", category));
        let function_permissions: Vec<FunctionPermission> = unique
            .into_iter()
            .map(|name| FunctionPermission { name, is_declared: false, is_detected: true, detected_at: Some(current_time.clone()) })
            .collect();
        detected_permissions.push(AddonPermission { category, functions: function_permissions, purpose });
    }
    detected_permissions
}

pub fn parse_manifest_json_metadata(manifest_content: &str) -> Result<AddonManifest, String> {
    let raw: serde_json::Value = serde_json::from_str(manifest_content).map_err(|e| format!("Invalid manifest.json: {}", e))?;
    let id = raw["id"].as_str().ok_or("Missing 'id' field in manifest.json")?.to_string();
    let name = raw["name"].as_str().ok_or("Missing 'name' field in manifest.json")?.to_string();
    let version = raw["version"].as_str().ok_or("Missing 'version' field in manifest.json")?.to_string();
    let main = raw["main"].as_str().map(|s| s.to_string());
    let description = raw["description"].as_str().map(|s| s.to_string());
    let author = raw["author"].as_str().map(|s| s.to_string());
    let sdk_version = raw["sdkVersion"].as_str().map(|s| s.to_string());
    let enabled = raw["enabled"].as_bool();
    let homepage = raw["homepage"].as_str().map(|s| s.to_string());
    let repository = raw["repository"].as_str().map(|s| s.to_string());
    let license = raw["license"].as_str().map(|s| s.to_string());
    let min_wealthfolio_version = raw["minWealthfolioVersion"].as_str().map(|s| s.to_string());
    let keywords = raw["keywords"].as_array().map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect());
    let icon = raw["icon"].as_str().map(|s| s.to_string());

    let permissions = if let Some(perms) = raw.get("permissions") {
        let mut parsed: Vec<AddonPermission> = vec![];
        if let Some(array) = perms.as_array() {
            for p in array {
                let category = p["category"].as_str().unwrap_or("").to_string();
                let purpose = p["purpose"].as_str().unwrap_or("").to_string();
                let mut functions: Vec<FunctionPermission> = vec![];
                if let Some(funcs) = p.get("functions").and_then(|v| v.as_array()) {
                    for f in funcs {
                        functions.push(FunctionPermission {
                            name: f["name"].as_str().unwrap_or("").to_string(),
                            is_declared: f["isDeclared"].as_bool().unwrap_or(true),
                            is_detected: f["isDetected"].as_bool().unwrap_or(false),
                            detected_at: f["detectedAt"].as_str().map(|s| s.to_string()),
                        });
                    }
                }
                parsed.push(AddonPermission { category, functions, purpose });
            }
        }
        Some(parsed)
    } else { None };

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

pub fn extract_addon_zip_internal(zip_data: Vec<u8>) -> Result<ExtractedAddon, String> {
    use std::io::Cursor;
    use zip::ZipArchive;

    let cursor = Cursor::new(zip_data);
    let mut archive = ZipArchive::new(cursor).map_err(|e| format!("Failed to read ZIP: {}", e))?;

    let mut files = Vec::new();
    let mut manifest_json: Option<String> = None;
    let mut main_file: Option<String> = None;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Failed to access file {}: {}", i, e))?;
        if file.is_dir() { continue; }
        let file_name = file.name().to_string();
        let mut contents = String::new();
        file.read_to_string(&mut contents).map_err(|e| format!("Failed to read file {}: {}", file_name, e))?;
        if file_name == "manifest.json" || file_name.ends_with("/manifest.json") {
            manifest_json = Some(contents.clone());
        }
        let is_main_fallback = file_name.ends_with("addon.js") || file_name.ends_with("addon.jsx") || file_name.ends_with("index.js") || file_name.ends_with("index.jsx") || file_name.contains("dist/addon.js");
        if is_main_fallback && main_file.is_none() { main_file = Some(file_name.clone()); }
        files.push(AddonFile { name: file_name, content: contents, is_main: false });
    }

    let metadata = if let Some(manifest_content) = manifest_json { parse_manifest_json_metadata(&manifest_content)? } else { return Err("ZIP addon must contain a manifest.json file with addon metadata".to_string()); };
    let main_file = metadata.get_main()?;
    for file in &mut files {
        file.is_main = file.name == main_file || file.name.ends_with(main_file) || (main_file.contains('/') && file.name == main_file);
    }
    if !files.iter().any(|f| f.is_main) {
        return Err(format!("Main addon file '{}' not found. Available files: {}", main_file, files.iter().map(|f| f.name.as_str()).collect::<Vec<_>>().join(", ")));
    }

    let detected_permissions = detect_addon_permissions(&files);
    let mut merged_permissions: Vec<AddonPermission> = vec![];
    if let Some(declared) = &metadata.permissions {
        for perm in declared {
            let mut cloned_functions = Vec::new();
            for func in &perm.functions {
                cloned_functions.push(FunctionPermission { name: func.name.clone(), is_declared: func.is_declared, is_detected: func.is_detected, detected_at: func.detected_at.clone() });
            }
            merged_permissions.push(AddonPermission { category: perm.category.clone(), functions: cloned_functions, purpose: perm.purpose.clone() });
        }
    }
    for detected_perm in detected_permissions {
        if let Some(existing) = merged_permissions.iter_mut().find(|p| p.category == detected_perm.category) {
            for detected_func in &detected_perm.functions {
                if let Some(existing_func) = existing.functions.iter_mut().find(|f| f.name == detected_func.name) {
                    existing_func.is_detected = true;
                    existing_func.detected_at = detected_func.detected_at.clone();
                } else {
                    existing.functions.push(detected_func.clone());
                }
            }
        } else {
            merged_permissions.push(detected_perm);
        }
    }

    let mut metadata_with_permissions = metadata;
    metadata_with_permissions.permissions = Some(merged_permissions);
    Ok(ExtractedAddon { metadata: metadata_with_permissions, files })
}

/// Download addon package from store
pub async fn download_addon_from_store(addon_id: &str, instance_id: Option<&str>) -> Result<Vec<u8>, String> {
    let api_url = format!("{}/{}/download", ADDON_STORE_API_BASE_URL, addon_id);
    let client = reqwest::Client::new();
    let response = create_request_with_headers(&client, reqwest::Method::GET, &api_url, instance_id)
        .send()
        .await
        .map_err(|e| format!("Failed to call download API for addon '{}': {}", addon_id, e))?;

    let status = response.status();
    if status.is_success() {
        // Inspect content-type to support JSON indirection or direct binary
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_lowercase();

        if content_type.contains("application/json") {
            let body = response
                .text()
                .await
                .map_err(|e| format!("Failed to read download API JSON for '{}': {}", addon_id, e))?;

            let v: serde_json::Value = serde_json::from_str(&body)
                .map_err(|e| format!("Failed to parse download API JSON for '{}': {} (body: {})", addon_id, e, body))?;

            if let Some(actual_url) = v.get("downloadUrl").and_then(|x| x.as_str()) {
                let file_resp = client.get(actual_url).send().await
                    .map_err(|e| format!("Failed to GET actual addon file for '{}': {}", addon_id, e))?;
                if !file_resp.status().is_success() {
                    let s = file_resp.status();
                    let t = file_resp.text().await.unwrap_or_default();
                    return Err(format!("Actual file download failed {} for '{}': {}", s, addon_id, t));
                }
                let bytes = file_resp.bytes().await
                    .map_err(|e| format!("Failed to read actual file bytes for '{}': {}", addon_id, e))?;
                return Ok(bytes.to_vec());
            }
            // Fall through to fallback if JSON didn't contain url
        } else {
            // Treat as direct binary
            let bytes = response.bytes().await
                .map_err(|e| format!("Failed to read download data for '{}': {}", addon_id, e))?;
            return Ok(bytes.to_vec());
        }
    }

    // Fallback: fetch listings and use downloadUrl from listing
    if let Ok(list) = fetch_addon_store_listings(instance_id).await {
        if let Some(item) = list.into_iter().find(|v| v.get("id").and_then(|x| x.as_str()) == Some(addon_id)) {
            if let Some(url) = item.get("downloadUrl").and_then(|x| x.as_str())
                .or_else(|| item.get("download_url").and_then(|x| x.as_str()))
            {
                let resp = client.get(url).send().await
                    .map_err(|e| format!("Failed to fetch addon URL from listing for '{}': {}", addon_id, e))?;
                if !resp.status().is_success() {
                    let s = resp.status();
                    let t = resp.text().await.unwrap_or_default();
                    return Err(format!("Fetching addon via listing URL failed {} for '{}': {}", s, addon_id, t));
                }
                let bytes = resp.bytes().await
                    .map_err(|e| format!("Failed to read bytes from listing URL for '{}': {}", addon_id, e))?;
                return Ok(bytes.to_vec());
            }
        }
    }

    // If we reached here, original API failed and no fallback worked
    Err(format!(
        "Download API returned {} for addon '{}' and fallback could not resolve a download URL",
        status,
        addon_id
    ))
}

/// Fetch addon store listings
pub async fn fetch_addon_store_listings(instance_id: Option<&str>) -> Result<Vec<serde_json::Value>, String> {
    let api_url = ADDON_STORE_API_BASE_URL.to_string();
    let client = reqwest::Client::new();
    let response = create_request_with_headers(&client, reqwest::Method::GET, &api_url, instance_id)
        .send().await.map_err(|e| format!("Failed to fetch addon store listings: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Store API returned error {}: {}", status, error_text));
    }
    let text = response.text().await.map_err(|e| format!("Failed to read store API response: {}", e))?;
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("Failed to parse store response: {}", e))?;
    let listings = if let Some(addons) = value.get("addons").and_then(|v| v.as_array()) {
        addons.clone()
    } else if let Some(arr) = value.as_array() { arr.clone() } else { return Err("Invalid API response structure".into()); };
    Ok(listings)
}

/// Submit rating to store
pub async fn submit_addon_rating(addon_id: &str, rating: u8, review: Option<String>, instance_id: Option<&str>) -> Result<serde_json::Value, String> {
    if rating < 1 || rating > 5 { return Err("Rating must be between 1 and 5".into()); }
    let api_url = format!("{}/{}/ratings", ADDON_STORE_API_BASE_URL, addon_id);
    let mut body = serde_json::json!({ "rating": rating });
    if let Some(r) = review { body["review"] = serde_json::Value::String(r); }
    let client = reqwest::Client::new();
    let response = create_request_with_headers(&client, reqwest::Method::POST, &api_url, instance_id)
        .json(&body).send().await.map_err(|e| format!("Failed to submit rating: {}", e))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to submit rating: HTTP {} - {}", status, text));
    }
    let text = response.text().await.map_err(|e| format!("Failed to read rating response: {}", e))?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("Failed to parse rating response: {}", e))?;
    Ok(json)
}
