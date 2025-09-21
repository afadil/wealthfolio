use chrono;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use tauri::Manager;
use tauri::{AppHandle, Emitter};
use wealthfolio_core::db;

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

    // Create a custom backup path in the specified directory
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("wealthfolio_backup_{}.db", timestamp);
    let backup_path = Path::new(&backup_dir).join(&backup_filename);

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

    // Try to get the ServiceContext to perform graceful operations before restore
    if app_handle
        .try_state::<std::sync::Arc<crate::context::ServiceContext>>()
        .is_some()
    {
        // Give some time for any pending operations to complete
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    // Use the safe restore function that handles Windows file locking issues
    db::restore_database_safe(&app_data_dir, &backup_file_path).map_err(|e| e.to_string())?;

    // After successful restore, emit event and show restart dialog
    app_handle
        .emit("database-restored", ())
        .map_err(|e| format!("Failed to emit database-restored event: {}", e))?;

    // Show restart dialog similar to update process
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

    Ok(())
}
