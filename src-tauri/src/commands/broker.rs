use wealthfolio_core::brokers::broker_service::BrokerDataService;
use crate::AppState;
use log::debug;
use tauri::State;

#[tauri::command]
pub async fn sync_all_accounts(state: State<'_, AppState>) -> Result<usize, String> {
    debug!("Syncing brokers...");
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get DB connection: {}", e))?;
    BrokerDataService::sync_all_accounts(&mut conn)
        .await
        .map(|_| 1) 
}