use chrono;
use serde::Serialize;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use tauri::Manager;
use tauri::{AppHandle, Emitter};
use wealthfolio_core::db;

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
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .to_path_buf();

    let app_data_dir = app_data_dir_path
        .to_str()
        .ok_or_else(|| "Failed to convert app data dir path to string".to_string())?
        .to_string();

    let db_path = db::get_db_path(&app_data_dir);
    let logs_dir = app_handle
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get app log dir: {}", e))?
        .to_str()
        .ok_or_else(|| "Failed to convert app log dir path to string".to_string())?
        .to_string();

    Ok(AppInfo {
        version,
        db_path,
        logs_dir,
    })
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
    let mut file =
        File::open(&backup_path).map_err(|e| format!("Failed to open backup file: {}", e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read backup file: {}", e))?;

    // Get the filename
    let filename = Path::new(&backup_path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Failed to get backup filename".to_string())?
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

    let db_path = db::get_db_path(&app_data_dir);

    // Normalize the backup directory path (remove file:// prefix if present on iOS/Android)
    let normalized_backup_dir = normalize_file_path(&backup_dir);

    // Create a custom backup path in the specified directory
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("wealthfolio_backup_{}.db", timestamp);
    let backup_path = Path::new(&normalized_backup_dir).join(&backup_filename);

    // Ensure the backup directory exists
    if let Some(parent) = backup_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;
    }

    let backup_path_str = backup_path.to_string_lossy().to_string();

    // Copy main database file
    std::fs::copy(&db_path, &backup_path_str)
        .map_err(|e| format!("Failed to backup database: {}", e))?;

    // Copy WAL file if it exists
    let wal_source = format!("{}-wal", db_path);
    let wal_target = format!("{}-wal", backup_path_str);
    if Path::new(&wal_source).exists() {
        std::fs::copy(&wal_source, &wal_target)
            .map_err(|e| format!("Failed to copy WAL file: {}", e))?;
    }

    // Copy SHM file if it exists
    let shm_source = format!("{}-shm", db_path);
    let shm_target = format!("{}-shm", backup_path_str);
    if Path::new(&shm_source).exists() {
        std::fs::copy(&shm_source, &shm_target)
            .map_err(|e| format!("Failed to copy SHM file: {}", e))?;
    }

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
    db::restore_database_safe(&app_data_dir, &normalized_backup_path).map_err(|e| e.to_string())?;

    // After successful restore, emit event and show restart dialog
    app_handle
        .emit("database-restored", ())
        .map_err(|e| format!("Failed to emit database-restored event: {}", e))?;

    // On desktop builds prompt for restart, but skip showing dialogs on iOS/Android
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

        let should_restart = app_handle
            .dialog()
            .message(
                "Database restored successfully!\n\n\
                 For the best experience, it's recommended to restart the application \
                 to ensure all data is properly refreshed.\n\n\
                 Would you like to restart now?",
            )
            .title("Database Restored - Restart Required")
            .buttons(MessageDialogButtons::OkCancel)
            .kind(MessageDialogKind::Info)
            .blocking_show();

        if should_restart {
            app_handle.restart();
        }
    }

    Ok(())
}
