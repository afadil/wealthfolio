use chrono::DateTime;
use log::{error, info, warn};
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

// Helper function to detect if this is an App Store build
fn is_app_store_build() -> bool {
    cfg!(feature = "appstore")
}

// Helper function to retrieve platform-specific store URLs
fn app_store_url() -> Option<&'static str> {
    #[cfg(target_os = "macos")]
    {
        Some("macappstore://apps.apple.com/app/6732888445")
    }

    #[cfg(target_os = "windows")]
    {
        Some("ms-windows-store://pdp/?productid=YOUR_PRODUCT_ID")
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    pub is_app_store_build: bool,
    pub store_url: Option<String>,
    pub changelog_url: Option<String>,
    pub screenshots: Option<Vec<String>>,
}

/// Extract changelog_url from raw_json
fn extract_changelog_url(raw_json: &serde_json::Value) -> Option<String> {
    raw_json
        .get("changelog_url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Extract screenshots from raw_json
fn extract_screenshots(raw_json: &serde_json::Value) -> Option<Vec<String>> {
    raw_json.get("screenshots").and_then(|v| {
        v.as_array().map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect()
        })
    })
}

/// Check for updates and return update info if available.
/// Returns `Ok(Some(UpdateInfo))` if an update is available,
/// `Ok(None)` if already up-to-date.
pub async fn check_for_update(
    app_handle: AppHandle,
    instance_id: &str,
) -> Result<Option<UpdateInfo>, String> {
    let is_appstore = is_app_store_build();

    let update = app_handle
        .updater_builder()
        .header("X-Instance-Id", instance_id)
        .map_err(|e| format!("Failed to set header: {}", e))?
        .build()
        .map_err(|e| format!("Failed to build updater: {}", e))?
        .check()
        .await
        .map_err(|e| {
            warn!("Update check failed: {}", e);
            format!("Failed to check for updates: {}", e)
        })?;

    match update {
        Some(update) => {
            let current_version = app_handle.package_info().version.to_string();
            if update.version != current_version {
                let pub_date = update.date.and_then(|d| {
                    let seconds = d.unix_timestamp();
                    let nanos = d.nanosecond();
                    DateTime::from_timestamp(seconds, nanos).map(|dt| dt.to_rfc3339())
                });

                let changelog_url = extract_changelog_url(&update.raw_json);
                let screenshots = extract_screenshots(&update.raw_json);

                Ok(Some(UpdateInfo {
                    current_version,
                    latest_version: update.version.to_string(),
                    notes: update.body.clone(),
                    pub_date,
                    is_app_store_build: is_appstore,
                    store_url: app_store_url().map(|url| url.to_string()),
                    changelog_url,
                    screenshots,
                }))
            } else {
                Ok(None)
            }
        }
        None => Ok(None),
    }
}

/// Download and install an available update, then restart the app.
/// Shows native dialogs for success/failure and handles restart.
pub async fn install_update(app_handle: AppHandle) {
    info!("Starting update download and installation");

    // Check for updates
    let update = match app_handle.updater_builder().build() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => update,
            Ok(None) => {
                app_handle
                    .dialog()
                    .message("No update available.")
                    .title("Update")
                    .kind(MessageDialogKind::Info)
                    .blocking_show();
                return;
            }
            Err(e) => {
                error!("Failed to check for updates: {}", e);
                app_handle
                    .dialog()
                    .message(format!("Failed to check for updates: {}", e))
                    .title("Update Failed")
                    .kind(MessageDialogKind::Error)
                    .blocking_show();
                return;
            }
        },
        Err(e) => {
            error!("Failed to build updater: {}", e);
            app_handle
                .dialog()
                .message(format!("Failed to initialize updater: {}", e))
                .title("Update Failed")
                .kind(MessageDialogKind::Error)
                .blocking_show();
            return;
        }
    };

    info!(
        "Downloading update from version {} to {}",
        update.current_version, update.version
    );

    // Download and install
    match update.download_and_install(|_, _| {}, || {}).await {
        Ok(_) => {
            info!("Update installed successfully, showing dialog and restarting");

            app_handle
                .dialog()
                .message("Update installed successfully. The application will now restart.")
                .title("Update Complete")
                .kind(MessageDialogKind::Info)
                .blocking_show();

            app_handle.restart();
        }
        Err(e) => {
            error!("Failed to download and install update: {}", e);

            app_handle
                .dialog()
                .message(format!("Failed to install update: {}", e))
                .title("Update Failed")
                .kind(MessageDialogKind::Error)
                .blocking_show();
        }
    }
}
