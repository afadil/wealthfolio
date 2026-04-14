use chrono;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use tauri::Manager;
use tauri::{AppHandle, Emitter};
use wealthfolio_storage_sqlite::db;

use crate::context::ServiceContext;
use crate::shell_i18n::{current_strings, format_template};
#[cfg(desktop)]
use crate::updater::{check_for_update, install_update};

/// Normalize file path by removing file:// URI prefix if present (iOS/Android compatibility)
fn normalize_file_path(path: &str) -> String {
    if path.starts_with("file://") {
        path.strip_prefix("file://").unwrap_or(path).to_string()
    } else {
        path.to_string()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    db_path: String,
    logs_dir: String,
}

#[tauri::command]
pub async fn get_app_info(app_handle: AppHandle) -> Result<AppInfo, String> {
    let version = app_handle.package_info().version.to_string();

    let app_data_dir_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| {
            let s = current_strings(&app_handle);
            format_template(&s.utilities_error_app_data_dir, &e.to_string())
        })?
        .to_path_buf();

    let app_data_dir = app_data_dir_path
        .to_str()
        .ok_or_else(|| current_strings(&app_handle).utilities_error_path_to_string.clone())?
        .to_string();

    let db_path = db::get_db_path(&app_data_dir);
    let logs_dir = app_handle
        .path()
        .app_log_dir()
        .map_err(|e| {
            let s = current_strings(&app_handle);
            format_template(&s.utilities_error_log_dir, &e.to_string())
        })?
        .to_str()
        .ok_or_else(|| current_strings(&app_handle).utilities_error_path_to_string.clone())?
        .to_string();

    Ok(AppInfo {
        version,
        db_path,
        logs_dir,
    })
}

/// Check for updates and return update info if available.
#[tauri::command]
pub async fn check_for_updates(app_handle: AppHandle) -> Result<Option<serde_json::Value>, String> {
    #[cfg(desktop)]
    {
        let instance_id = app_handle
            .try_state::<std::sync::Arc<ServiceContext>>()
            .map(|state| state.instance_id.clone())
            .ok_or_else(|| current_strings(&app_handle).utilities_error_service_context.clone())?;

        let result = check_for_update(app_handle, &instance_id).await?;
        Ok(result.map(|info| serde_json::to_value(info).unwrap()))
    }
    #[cfg(not(desktop))]
    {
        Ok(None)
    }
}

/// Download and install an available update. Emits progress events and restarts the app.
#[tauri::command]
pub async fn install_app_update(app_handle: AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    install_update(app_handle).await?;
    Ok(())
}

#[tauri::command]
pub async fn backup_database(app_handle: AppHandle) -> Result<(String, Vec<u8>), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .to_str()
        .expect("failed to convert path to string")
        .to_string();

    let backup_path = db::backup_database(&app_data_dir).map_err(|e| e.to_string())?;

    // Read the backup file
    let mut file = File::open(&backup_path).map_err(|e| {
        let s = current_strings(&app_handle);
        format_template(&s.utilities_error_backup_open, &e.to_string())
    })?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| {
        let s = current_strings(&app_handle);
        format_template(&s.utilities_error_backup_read, &e.to_string())
    })?;

    // Get the filename
    let filename = Path::new(&backup_path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| current_strings(&app_handle).utilities_error_backup_filename.clone())?
        .to_string();

    Ok((filename, buffer))
}

#[tauri::command]
pub async fn backup_database_to_path(
    app_handle: AppHandle,
    backup_dir: String,
) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .to_str()
        .expect("failed to convert path to string")
        .to_string();

    // Normalize the backup directory path (remove file:// prefix if present on iOS/Android)
    let normalized_backup_dir = normalize_file_path(&backup_dir);

    // Create a custom backup path in the specified directory
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("wealthfolio_backup_{}.db", timestamp);
    let backup_path = Path::new(&normalized_backup_dir).join(&backup_filename);

    let backup_path_str = backup_path.to_string_lossy().to_string();

    db::backup_database_to_file(&app_data_dir, &backup_path_str).map_err(|e| {
        let s = current_strings(&app_handle);
        format_template(&s.utilities_error_backup_to_path, &e.to_string())
    })?;

    Ok(backup_path_str)
}

#[tauri::command]
pub async fn restore_database(
    app_handle: AppHandle,
    backup_file_path: String,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .to_str()
        .expect("failed to convert path to string")
        .to_string();

    // Normalize the backup file path (remove file:// prefix if present on iOS/Android)
    let normalized_backup_path = normalize_file_path(&backup_file_path);

    // Try to get the ServiceContext to perform graceful operations before restore
    if app_handle
        .try_state::<std::sync::Arc<crate::context::ServiceContext>>()
        .is_some()
    {
        // Give some time for any pending operations to complete
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    // Use the safe restore function that handles Windows file locking issues
    db::restore_database_safe(&app_data_dir, &normalized_backup_path).map_err(|e| {
        let msg = e.to_string();
        let s = current_strings(&app_handle);
        if msg.contains("BACKUP_FILE_NOT_FOUND") {
            s.utilities_backup_file_not_found.clone()
        } else {
            msg
        }
    })?;

    // After successful restore, emit event and show restart dialog
    app_handle.emit("database-restored", ()).map_err(|e| {
        let s = current_strings(&app_handle);
        format_template(&s.utilities_error_restore_emit, &e.to_string())
    })?;

    // On desktop builds prompt for restart, but skip showing dialogs on iOS/Android
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

        let shell = current_strings(&app_handle);
        let should_restart = app_handle
            .dialog()
            .message(shell.dialog_database_restored_message.clone())
            .title(shell.dialog_database_restored_title.clone())
            .buttons(MessageDialogButtons::OkCancel)
            .kind(MessageDialogKind::Info)
            .blocking_show();

        if should_restart {
            app_handle.restart();
        }
    }

    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateTextRequest {
    pub text: String,
    pub source_lang: String,
    pub target_lang: String,
}

/// Best-effort translation via MyMemory (outbound HTTPS). Not for confidential text.
#[tauri::command]
pub async fn translate_text(req: TranslateTextRequest) -> Result<String, String> {
    let client = reqwest::Client::new();
    wealthfolio_translation::translate_mymemory(
        &client,
        &req.text,
        &req.source_lang,
        &req.target_lang,
    )
    .await
}
