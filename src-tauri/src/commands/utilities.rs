use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;

use chrono::{DateTime, NaiveDate, Utc};
use log::debug;
use rust_decimal::Decimal;
use serde::Deserialize;
use tauri::{AppHandle, Manager, State};
use wealthfolio_core::{
    db,
    errors::Result,
    market_data::{MarketDataServiceTrait, Quote},
};

use crate::context::ServiceContext;

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
pub async fn import_quotes(
    quotes: Vec<Quote>,
    state: State<'_, Arc<ServiceContext>>,
    _handle: AppHandle,
) -> Result<(), String> {
    debug!("Importing {} quotes", quotes.len());

    state
        .market_data_service()
        .add_quotes(quotes)
        .await
        .map_err(|e| e.to_string())
}
